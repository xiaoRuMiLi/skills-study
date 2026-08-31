# Tushare API 参考

## 脚本与接口对照表

| 脚本 | Tushare 接口 | 积分要求 | 说明 |
|------|-------------|---------|------|
| stock_price.py | daily / weekly / monthly | 120 | 日/周/月K线 |
| realtime_quote.py | realtime_quote | 免费 | 实时行情（交易时段） |
| stock_info.py | stock_basic | 免费 | 股票基本信息 |
| financial_data.py --type income | income | 2000 | 利润表 |
| financial_data.py --type balance | balancesheet | 2000 | 资产负债表 |
| financial_data.py --type cashflow | cashflow | 2000 | 现金流量表 |
| financial_data.py --type indicator | fina_indicator | 2000 | 财务指标 |
| index_quote.py | index_daily | 免费 | 指数日线行情 |
| news.py | news | 5000 | 财经新闻（新浪等来源） |
| fund_holding.py | fund_portfolio | 5000 | 基金持仓组合 |
| fundamental.py | daily_basic | 2000 | 每日估值指标（PE/PB/市值） |
| plot_kline.py | daily / weekly / monthly | 120 | K线图（基于mplfinance） |
| plot_timeline.py | stk_mins | 5000+ | 分时图（分钟数据） |

## 常见指数代码速查

| 名称 | 代码 |
|------|------|
| 上证指数 | 000001.SH |
| 深证成指 | 399001.SZ |
| 沪深300 | 000300.SH |
| 创业板指 | 399006.SZ |
| 中证500 | 000905.SH |
| 上证50 | 000016.SH |
| 科创50 | 000688.SH |

## 股票代码规则

- 6 开头 → 上交所（.SH），如 600519.SH（贵州茅台）
- 0/3 开头 → 深交所（.SZ），如 000001.SZ（平安银行）、300750.SZ（宁德时代）
- 4/8 开头 → 北交所（.BJ）

## daily_basic 常用字段

| 字段 | 含义 |
|------|------|
| pe / pe_ttm | 市盈率（静态/滚动） |
| pb | 市净率 |
| ps / ps_ttm | 市销率 |
| dv_ratio / dv_ttm | 股息率 |
| total_mv | 总市值（万元） |
| circ_mv | 流通市值（万元） |
| turnover_rate / turnover_rate_f | 换手率 |
| volume_ratio | 量比 |

## fina_indicator 常用字段

| 字段 | 含义 |
|------|------|
| roe / roe_dt | 净资产收益率 |
| roa | 总资产收益率 |
| grossprofit_margin | 毛利率 |
| netprofit_margin | 净利率 |
| debt_to_assets | 资产负债率 |
| eps | 每股收益 |
| bps | 每股净资产 |
| ocfps | 每股经营现金流 |
| revenue / n_income | 营收 / 净利润 |
| q_profit_yoy | 单季净利润同比 |

## 积分不足时的处理

若返回权限错误，提示用户：
1. 登录 tushare.pro 查看积分
2. 通过完善资料、邀请注册、捐赠等方式提升积分
3. 或改用免费接口（stock_basic、index_daily、daily 需120积分）
