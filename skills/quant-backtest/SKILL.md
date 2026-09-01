---
name: quant-backtest
description: 专业A股量化回测引擎（模块化·真实数据·零依赖·可视化）。从公开行情接口拉取真实历史日线，运行MA/RSI/MACD/布林带等策略回测，一键生成仿交易软件的交互式HTML报告：K线蜡烛图+成交量+净值曲线+均线+布林线+买卖点箭头标记+中文悬浮提示+十字线贯穿联动+逐笔交易明细表+策略中文说明+个股中文名称，支持导出PDF。采用工厂+注册表+自动发现架构，可无缝接入自定义策略与自定义数据源（OpenClaw可根据用户想法自动生成策略代码/数据源规范）。覆盖：策略回测、历史回测、量化选股、夏普比率、最大回撤、净值曲线、MA金叉死叉、RSI超买超卖、MACD、布林带、回测贵州茅台/五粮液等。所有数字可溯源到真实行情，绝不编造，附免责声明。触发词：量化回测、策略回测、历史回测、回测股票、MA均线、金叉死叉、夏普比率、最大回撤、净值曲线、布林带、MACD回测、帮我回测、写个策略。
author: king
---

# A股量化策略回测引擎（模块化 · 真实数据 · 可视化）

真实数据、可溯源、可扩展、**可视化**的 A 股回测技能。
采用**工厂 + 注册表 + 自动发现**架构，策略与数据源都能**无缝接入**，
输出仿交易软件的 **ECharts 交互式 HTML 报告**。

> 🎯 **特色**：不是枯燥的数字表格，而是一份完整的、可读懂、可交互、可导出 PDF 的"回测诊断书"。

## ⚠️ 核心原则（必须遵守）

1. **禁止编造数据**：所有行情/K线必须来自 `core/data_source` 拉取的真实数据，禁止凭空生成数字。
2. **每个结果可溯源**：报告注明数据来源、代码、区间、获取时间。
3. **必须附免责声明**：回测不构成投资建议，过去表现不代表未来收益。
4. **区间过短要提示**：少于 3 年标注"参考价值有限"。

---

## 💬 对话式工作流（OpenClaw 必须遵循）

本技能是**交互式**的：不要求用户一次性给全所有参数。OpenClaw 应按下面的流程，**从对话上下文里提取已知信息，缺的再向用户提问**，确认齐全后执行回测。

### 第一步：确定要回测哪只股票

1. **优先从对话上下文提取**：如果用户已经提到股票（如"回测茅台"、"分析五粮液"、"600519"），直接识别为股票代码。
   - **中文名 → 代码映射**（常见，OpenClaw 可用 `--list-datasources` 或常识补充）：
     - 贵州茅台 → `sh600519`
     - 五粮液 → `sz000858`
     - 中国平安 → `sh601318`
     - 宁德时代 → `sz300750`
     - 招商银行 → `sh600036`
     - 比亚迪 → `sz002594`
   - 若用户给了 6 位代码但没说市场（如"600519"），需要补前缀：`6` 开头→`sh`，`0`/`3` 开头→`sz`，`4`/`8` 开头→`bj`（北交所）。
2. **若上下文里没有股票**，向用户提问（一次问清，别连珠炮）：
   > "请问您想回测哪只股票呢？给我代码或名称都可以，比如『贵州茅台』或『sh600519』。"

### 第二步：确定用哪个策略回测

1. **优先从上下文提取**：如果用户提到"金叉死叉/均线"→ `ma`；"超买超卖/RSI"→ `rsi`；"MACD"→ `macd`；"布林带"→ `my_boll`。
2. **若上下文没有策略**，向用户提问，**并列出可用策略**（用 `--list-strategies` 获取）：
   > "请问用什么策略回测？可选：**ma**（双均线金叉死叉）、**rsi**（超买超卖）、**macd**（MACD金叉死叉）、**my_boll**（布林带突破）。您自定义的策略也可以告诉我。"
3. **用户可能想要自定义策略**：如果用户描述了一个策略逻辑（如"帮我写个金叉+RSI双确认的策略"），OpenClaw 应：
   - 根据 `core/strategy/base.py` 的规范，**写成 strategy 类的代码** → 保存到 `core/strategy/custom/` → 用策略名回测。
   - 具体规范见下方"无缝接入：自定义策略"章节。

### 第三步：确认关键参数（缺省用默认）

以下参数**缺省即可用默认值**，不强制提问，但若用户显式提出则遵循：
- `--start` / `--end`：回测区间（默认近 4 年）
- `--initial-capital`：初始资金（默认 100000）
- `--short`/`--long`：MA 周期（默认 5/20）
- `--boll`：是否显示布林线

若用户没提**区间**但想要"最近一年"等模糊表述，OpenClaw 可**换算成日期**并向用户确认一次。

### 然后执行

确定 `symbol` + `strategy` 后执行：
```bash
python scripts/backtest.py --symbol <代码> --strategy <策略名> [其他参数]
```
执行后**向用户简要说明报告位置**，并提示可打开 HTML 查看（提到走势/买卖点/净值等特色）。

### 交互示例（OpenClaw 照着做）

> **用户**：帮我回测一下茅台
> **Agent**：好的，我识别到您想回测**贵州茅台（sh600519）**。请问想用哪个策略呢？
> 可选：**ma**（双均线金叉死叉）/ **rsi**（超买超卖）/ **macd**（MACD金叉死叉）/ **my_boll**（布林带突破）
> **用户**：MACD 吧
> **Agent**：好的，用 **MACD 策略**回测贵州茅台（默认近 4 年、初始资金 10 万）。正在执行...
> [执行] → 报告已生成：`output/sh600519_macd/sh600519_macd.html`
> **Agent**：回测完成！总收益 **xx%**、夏普 **xx**。这是交互式 HTML 报告，包含 K线图、买卖点箭头、净值曲线和逐笔交易明细，您可以打开查看，也支持导出 PDF。

> **用户**（仅说策略）：用 RSI 策略回测五粮液
> **Agent**：好的，我识别到 **五粮液（sz000858）+ RSI 策略**。正在执行...（上下文已齐全，无需追问，直接跑）

---

## 架构

```
quant-backtest/
├── SKILL.md                 # 本文档（说明 + 接入规范）
├── core/
│   ├── config.py            # 统一配置（成本/规则/默认值，支持环境变量覆盖）
│   ├── data_source/         # ★ 数据源工厂（统一 schema，可扩展 + 缓存）
│   │   ├── base.py          #   DataSource 基类 + 统一返回规范 + 缓存
│   │   ├── sina.py          #   新浪公开接口（默认，零依赖）
│   │   └── __init__.py      #   register_datasource / get_datasource
│   ├── strategy/            # ★ 策略包（自动发现，signal 契约统一）
│   │   ├── base.py          #   Strategy 基类 + get_rules() 中文说明
│   │   ├── builtin.py       #   ma / rsi / macd
│   │   ├── custom/          #   自定义策略目录（自动发现）
│   │   └── __init__.py      #   register_strategy / get_strategy
│   ├── engine.py            #   回测执行器（佣金/印花税/T+1/涨跌停/一手）
│   ├── metrics.py           #   绩效指标（收益/年化/回撤/夏普/胜率/盈亏比）
│   ├── render.py            #   ECharts HTML 渲染（多副图/标记/中文tooltip/十字线）
│   └── __init__.py
├── scripts/backtest.py      # CLI 入口（含发现命令）
├── assets/echarts.min.js    # 本地 ECharts（离线渲染）
└── output/                  # 回测报告输出（可按标的分目录）
```

## 环境前提与兼容性

### Python 依赖

- Python **3.10+**，只需 **`pandas`** + **`numpy`** 两个库。
- **零其他第三方依赖**：数据源用标准库 `urllib`，不依赖 `requests`/`akshare`/`yaml`/`flask`/`playwright` 等任何重库。
- 缺依赖时让用户执行：
  ```bash
  pip install pandas numpy
  ```
  （这是用户手动步骤，不在 skill 内自动执行；CLI 启动时也会检测并给出友好提示。）

### 浏览器兼容性

生成的 HTML 报告是**纯静态文件**，兼容性极好：

| 项目 | 说明 |
|------|------|
| 打开方式 | **双击 HTML 即可打开**，无需任何服务器/Web服务 |
| 渲染引擎 | ECharts 5（基于 Canvas，不依赖 WebGL 等高级特性） |
| JS 兼容 | 报告 JS 全部为 ES5 级别（`var`/`function`），无 `const`/`let`/箭头函数/模板字符串等新特性 |
| 支持浏览器 | Chrome / Edge / Firefox / Safari / Opera 等**所有现代浏览器**，较老浏览器也基本可用 |
| 离线可用 | ECharts 已内嵌到 HTML（`assets/echarts.min.js`），**断网也能打开** |
| PDF | 报告内置"导出 PDF"按钮，用浏览器打印功能，无需额外库 |

> 📌 **兼容性保证**：这份报告不依赖网络、不依赖特定浏览器、不依赖服务器。**任何用户都能直接双击查看**，非常适合分享给他人。

## 快速开始

```bash
python scripts/backtest.py --symbol sh600519 --strategy ma --short 5 --long 20 \
    --start 2022-06-01 --end 2026-08-31 --initial-capital 1000000
```

**发现能力**（先看有什么可用）：
```bash
python scripts/backtest.py --list-strategies    # 列出所有策略
python scripts/backtest.py --list-datasources   # 列出所有数据源
```

**常用参数**：
- `--symbol` 带市场前缀：`sh600519`（沪）/ `sz000858`（深），必填
- `--strategy` `ma` | `rsi` | `macd`，或自定义策略名（如 `my_boll`）
- `--short`/`--long` MA 策略的短/长周期；`--ma 5,10,20,60,180` 渲染均线（**默认即含 60/180 长周期均线**，可任意增删，如 `--ma 5,20,60,120,250`）
- `--boll` 开启布林线；`--no-vol` 隐藏成交量；`--no-equity` 隐藏净值曲线
- `--datasource` 数据源名（默认 sina）
- `--start`/`--end` 区间；`--initial-capital` 资金；`--max-len` 最大K线数

**输出**：`output/<symbol>_<strategy>/` 下的 HTML（交互式报告）+ CSV（逐日明细）。

## 🖥️ 特色：可视化 HTML 报告

报告是一份**仿交易软件**的完整回测诊断书：

| 区块 | 内容 |
|------|------|
| 顶部标题 | 个股中文名称（如"贵州茅台（sh600519）"） |
| 个股信息条 | 名称 / 最新价 / 涨跌幅（红涨绿跌） |
| 指标卡片 | 总收益 / 年化 / 最大回撤 / 夏普 / 胜率 / 盈亏比 |
| 策略说明 | 策略简介 + 买入条件 + 卖出条件（中文） |
| 主图 | K线蜡烛图 + MA均线 + 布林线 + 买卖点箭头（↑红买入/↓绿卖出） |
| 副图1 | 成交量柱状图（红涨绿跌）+ 成交量均线 |
| 副图2 | 净值曲线（资金曲线，蓝色面积） |
| 交易明细表 | 逐笔交易：日期/方向/价格/股数/盈亏/盈亏% |
| 底部 | 免责声明 |
| 交互 | ① 中文悬浮提示（开盘/收盘/最高/最低）② 十字线贯穿所有副图 ③ dataZoom 缩放聚焦交易区 ④"导出 PDF"按钮 |

**关键交互**：
- 鼠标悬停任意 K 线 → 显示"开/收/低/高"中文 tooltip，十字虚线**贯穿**主图/成交量/净值三个区域，方便比对同一日期。
- 底部滑块 + 滚轮缩放，默认聚焦到有交易的区间。
- 右上角"🖨️ 导出 PDF"按钮可另存为 PDF。

## 🧩 自定义策略：核心契约

**核心契约**：策略继承 `Strategy`，实现 `generate_signals(df)`，在 df 上附加 **`signal` 列**：
- `+1` = 买入信号
- `-1` = 卖出信号
- `0` = 无操作

> ⚠️ **最重要的一点：signal 列必须当天收盘确定、且引擎以当日收市价成交**。这符合"以收市价买卖"的常见需求。

---

## 🤝 策略共创流程（用户是想法，你负责落地）★核心方法论★

**用户提供的往往是模糊的想法，而不是可执行的代码。你的职责是：把用户的想法，经过判断与沟通，落地成一个真实可跑、有实际意义的策略。**

当用户提出策略思路时，**不要急着写代码**，按以下流程走：

### 第一步：判断是否已有先例（先用内置/已有策略）

先对照**已有的内置策略**（ma/rsi/macd/my_boll/channel 等），判断用户想法是否命中：

| 用户想法 | 对应已有策略 |
|---------|------------|
| "金叉死叉 / 双均线" | `ma` |
| "超买超卖 / RSI" | `rsi` |
| "MACD / DIF DEA" | `macd` |
| "布林带 / 上下轨" | `my_boll` |
| "趋势通道 / 回归通道" | `channel` |
| "XX日均线上穿买 / 跌破卖" | 单均线 → 内置 `sma`（若支持）或自定义 maXX |

**若命中了已有策略**，直接向用户说明并建议用已有策略（省时、可对比），**不重复造轮子**。

### 第二步：判断是否为"现实可行"的量化策略

用户的想法要满足**可落地**标准：
- ✅ **有明确的买卖信号**（什么条件下买、什么条件下卖，可量化）
- ✅ **有数据支持**（价格/均线/指标等，能算出来）
- ✅ **不违反交易规则**（T+1、涨跌停、一手、收市价成交等）
- ✅ **有实际意义**（不是纯随机、不是对未来不可知的数据）

**如果想法不满足**（如"感觉要涨就买"、"根据新闻情绪买"等），要向用户说明**边界**，并建议改造成可量化形式。

### 第三步：多轮沟通，直到可落地

**关键：用户只有模糊想法时，用结构化提问帮你定位关键参数**，一次问清但别连珠炮：

| 需要确认的点 | 典型问法 |
|------------|---------|
| **通道/窗口周期** | "用多久的数据来算？比如 60 天还是 120 天？" |
| **买卖方向** | "跌破下轨是买入（超卖反弹）还是突破上轨买入（强势突破）？" |
| **参数阈值** | "均线取 5/20 还是 5/60？布林用几倍标准差？" |
| **成交方式** | "按当日收市价成交，对吗？"（默认收市价） |
| **数据源** | "用哪个数据源？新浪默认可以吗？" |

**当用户说"就用你的建议方案"时**，说明用户信任你的专业判断——此时你应给出**有依据的方案**（如"线性回归通道 + 120天 + ±2σ + 均值回归"），并解释为什么这样设计（趋势通道价格大概率回归均值、能控制回撤）。

### 第四步：给出建议方案 → 确认 → 落地

1. 给用户一个**完整、可执行、有依据**的策略建议（含关键参数和买卖逻辑）。
2. 说明**为什么**这样设计（贴合你想法的同时，保证可落地、有意义）。
3. 用户确认后，按"自定义策略规范"写代码 → 自动发现 → 回测 → 可视化报告。

### 第五步：回测后给客观解读

回测完成后**如实汇报结果**（哪怕亏损），并对比其他策略，帮用户理解策略特性：
- 收益/回撤/夏普/胜率如何？
- 这个策略适合什么行情（趋势/震荡）？
- 和已有策略比，优缺点是什么？

### 沟通示例

> **用户**：我想给 K 线做个通道线，上边连高点、下边连低点，做回测。
> **Agent**（先判断）：这个想法是**趋势通道/回归通道**。我建议用**线性回归通道**：对近 N 天价格做线性回归得中轨，上下轨 = 中轨 ± k×标准差，形成平行通道。先确认几个点：
> ① 用多久的窗口？（建议 120 天）
> ② 买卖方向？通道策略有两种：**跌破下轨买（超卖反弹）** 还是 **突破上轨买（强势突破）**？
> ③ 按当日收市价成交，对吗？
> **用户**：就用你的建议方案。
> **Agent**（用户信任我，给有依据方案）：那我用**线性回归通道，120天窗口，±2σ，均值回归**（跌破下轨买、突破上轨卖），因为通道靠"价格大概率回归均值"，能控制回撤。正在落地...
> [回测] → 如实汇报收益/回撤/胜率，并对比已有策略。

---

## ⚙️ 自定义策略：技术实现细则

回测引擎**只读 signal 列**，不关心策略类型 → **任意策略无缝接入**。

### 方式一：文件自动发现（推荐，无需改主代码）

在 `core/strategy/custom/` 下建一个 `.py` 文件（如 `my_duel.py`），程序**自动加载**：

```python
# core/strategy/custom/my_duel.py
from core.strategy.base import Strategy
from core.strategy import register_strategy

class DuelStrategy(Strategy):
    name = "my_duel"                 # ★ 注册名：命令行 --strategy my_duel
    display_name = "双确认策略"       # 展示名
    # —— 以下 3 个属性提供中文说明，会显示在 HTML"策略说明"区 ——
    overview = "均线金叉 + RSI 超卖 双条件确认，减少假信号。"
    buy_rule = "短均线上穿长均线(金叉) 且 RSI<30(超卖) 时买入。"
    sell_rule = "短均线下穿长均线(死叉) 或 RSI>70(超买) 时卖出。"

    def generate_signals(self, df):
        df = self.prepare(df)                 # 基类提供：排序+重置索引
        # 计算均线
        df["ma_s"] = df["close"].rolling(5).mean()
        df["ma_l"] = df["close"].rolling(20).mean()
        # 计算RSI
        delta = df["close"].diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        df["rsi"] = 100 - 100 / (1 + gain / (loss + 1e-9))
        # 生成 signal 列
        df["signal"] = 0
        buy = (df["ma_s"] > df["ma_l"]) & (df["rsi"] < 30)
        sell = (df["ma_s"] < df["ma_l"]) | (df["rsi"] > 70)
        df.loc[buy, "signal"] = 1
        df.loc[sell, "signal"] = -1
        return df

def register():                        # ★ 自动发现会调用这个函数
    register_strategy("my_duel", DuelStrategy())
```

### 方式二：代码注册（在 CLI 里）

自定义策略也可以不放在 custom/ 目录，而是在你的脚本里手动注册：
```python
from core.strategy import register_strategy
register_strategy("my_duel", DuelStrategy())   # 然后 --strategy my_duel
```

### 自定义策略要点
1. **必须**实现 `generate_signals()` 并返回带 `signal` 列的 df。
2. **建议**定义 `overview`/`buy_rule`/`sell_rule` 三个字符串 → HTML 自动显示"策略说明"。**不写也有兜底文案**，不会空白。
3. **建议**用 `self.prepare(df)` 预处理（排序+重置索引）。
4. `name` 是命令行调用名，`display_name` 是展示名。
5. 文件会自动发现，**无需修改任何主代码**。

## 🔌 无缝接入：自定义数据源（详细规范）

**背景**：默认数据源是新浪（`sina`）。如果将来新浪/东财不可用，或者你想接入别的行情源，可以**按规范写一个新数据源**，OpenClaw 也能自动生成。

**核心契约**：数据源继承 `DataSource`，实现 `fetch(symbol, start, end)`，返回**统一 schema** 的 DataFrame，列固定为：

```python
# 必须包含且仅包含这些列
UNIFIED_COLUMNS = ["date", "open", "high", "low", "close", "volume"]
```

### 实现规范

```python
# core/data_source/my_source.py（放在 data_source/ 下）
from core.data_source.base import DataSource, DataSourceError
from core.data_source import register_datasource

class MySource(DataSource):
    name = "my_src"                    # ★ 数据源名：--datasource my_src
    display_name = "我的行情源"

    def fetch(self, symbol, start, end, max_len=None, **kwargs):
        """拉取某只股票日线，返回统一 schema 的 DataFrame。"""
        try:
            raw = self._request_data(symbol, start, end)   # 你的拉取逻辑
            df = self._to_dataframe(raw)                    # 转成统一 DataFrame
        except Exception as e:
            raise DataSourceError(f"[my_src] 获取失败: {e}")
        # 用基类 validate() 自动校验字段+统一排序，保证 schema 一致
        return self.validate(df)

    def _request_data(self, symbol, start, end):
        # ... 用你的 API 拉数据，返回原始结构 ...
        return raw

    def _to_dataframe(self, raw):
        # ... 转成 pandas.DataFrame，列名对齐 UNIFIED_COLUMNS ...
        return df

    def get_stock_info(self, symbol):
        """可选：返回个股信息 {name, industry, region, pe, price, change_pct}。
        不实现则 HTML 不显示基本信息，不影响回测。"""
        return {"name": "股票名", "price": 123.45}   # 示例

register_datasource("my_src", MySource())
```

### 自定义数据源要点
1. **必须**实现 `fetch()`，返回列 = `date/open/high/low/close/volume` 的 DataFrame。
2. **强烈建议**用 `self.validate(df)` 收尾——它自动做：字段校验、类型转数值、降序去重、按日期排序。这样无论数据来自哪家，**引擎/渲染层都不用改**。
3. `get_stock_info` 可选，用于报告头部显示中文名称/价格；返回约定字段即可，缺省不报错。
4. 注册后即可 `--datasource my_src` 使用，**无需改主代码**。
5. 若将来新浪/东财不可用，OpenClaw 可参照本规范**自动生成新的数据源代码**。

### 统一 schema 说明（重要）
| 字段 | 类型 | 说明 |
|------|------|------|
| date | datetime | 日期（升序） |
| open/high/low/close | float | 开盘/最高/最低/收盘 |
| volume | float | 成交量 |

**只要 Python 数据结构符合这个 schema，任何行情源都能无缝接入，报告渲染零改动。**

## 配置分层（config.py）

所有可调参数集中在 `core/config.py`，支持**环境变量覆盖**：

| 环境变量 | 含义 | 默认 |
|---------|------|------|
| `QB_COMMISSION` | 佣金率 | 0.0003 |
| `QB_STAMP_TAX` | 印花税 | 0.001 |
| `QB_PRICE_LIMIT` | 涨跌停幅度 | 0.10 |
| `QB_LOT_SIZE` | 一手股数 | 100 |
| `QB_INITIAL_CAPITAL` | 初始资金 | 100000 |
| `QB_START`/`QB_END` | 默认回测区间 | 2022-06-01 / 2026-08-31 |
| `QB_DATA_SOURCE` | 默认数据源 | sina |
| `QB_RISK_FREE` | 夏普无风险利率 | 0.02 |

## 边界说明

- 仅支持 A 股日线；分钟级、高频交易、实盘自动下单**不支持**。
- 新股上市不足 60 交易日、停牌股会标注提示。
- 数据覆盖：新浪免费接口约 4 年（近 1023 个交易日）。

## 免责声明

本工具输出为**历史回测模拟**，已计入佣金/印花税并处理 T+1，但回测含**生存偏差、过拟合风险**，**不构成任何投资建议，过去表现不代表未来收益**。请勿据此进行实盘决策。

---
*作者：king · 基于 OpenClaw 的模块化量化回测技能*
