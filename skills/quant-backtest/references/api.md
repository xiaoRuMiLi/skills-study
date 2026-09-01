# 回测引擎参考资料

## 数据源：新浪财经公开行情接口（零依赖，默认）

本技能通过 Python 标准库 `urllib` 直接调用新浪公开行情接口拉取 A 股真实日线数据，**无需 akshare、无需 API key**。

- 接口：`https://quotes.sina.cn/cn/api/jsonp_v2.php/...getKLineData`
- 参数：`symbol`（带市场前缀，如 `sh600519`/`sz000858`）、`scale=240`（日线）、`datalen`（最多约 1023 条）
- 覆盖：约 4 年（近 1023 个交易日）
- 返回字段：day/open/high/low/close/volume

**代码示例：**
```python
import urllib.request, json, re
url = ("https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_=/CN_MarketDataService"
       ".getKLineData?symbol=sh600519&scale=240&ma=no&datalen=1023")
req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0","Referer":"https://finance.sina.com.cn"})
raw = urllib.request.urlopen(req, timeout=20).read().decode("utf-8","ignore")
arr = json.loads(re.search(r"\((\[.*\])\)", raw, re.S).group(1))
```

## 个股信息：新浪 hq + 东财（带缓存）

报告头部显示的中文名称/最新价/涨跌幅来自新浪 hq 接口（稳定）：
```python
url = f"https://hq.sinajs.cn/list={symbol}"   # 返回 GBK：名称,今开,昨收,当前价,... 
```

行业/概念/PE 来自东方财富接口（可选，网络不通则自动省略），并做了**本地缓存**（`.cache/stock_info_<symbol>.json`，TTL 7 天），避免频繁请求。

## 统一数据 schema（最重要）

所有数据源返回的 DataFrame 必须符合以下**统一 schema**：

| 字段 | 类型 | 说明 |
|------|------|------|
| date | datetime | 交易日期（升序） |
| open | float | 开盘价 |
| high | float | 最高价 |
| low | float | 最低价 |
| close | float | 收盘价 |
| volume | float | 成交量 |

**自定义数据源只需实现 `fetch()` 返回符合此 schema 的 DataFrame**，并用基类 `validate()` 收尾（自动校验+排序），即可无缝接入。

## 策略逻辑

### 1. MA 双均线金叉死叉
- 短均线上穿长均线（金叉）→ 买入
- 短均线下穿长均线（死叉）→ 卖出
- 默认参数：短 5 / 长 20

### 2. RSI 超买超卖
- RSI(14) < 30（超卖）→ 买入
- RSI(14) > 70（超买）→ 卖出

### 3. MACD
- DIF 上穿 DEA（金叉）→ 买入
- DIF 下穿 DEA（死叉）→ 卖出

### 4. 布林带（示例自定义策略 my_boll）
- 收盘价跌破下轨（20日均线-2倍标准差）→ 买入
- 收盘价突破上轨（20日均线+2倍标准差）→ 卖出

## A 股交易规则（已内置）

| 规则 | 处理 |
|------|------|
| 佣金 | 0.03%，买卖双边 |
| 印花税 | 0.1%，仅卖出 |
| 涨跌停 | ±10%，涨停不追买、跌停不追卖 |
| T+1 | 买入次日才可卖出 |
| 最小交易单位 | 100 股（一手） |

## 输出指标

- 总收益率 / 年化收益
- 最大回撤
- 夏普比率（无风险利率 2%）
- 胜率 / 盈亏比
- 交易次数

## 免责声明

回测为历史模拟，含生存偏差与过拟合风险，不构成投资建议，过去表现不代表未来收益。
