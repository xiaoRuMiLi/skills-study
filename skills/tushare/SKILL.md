---
name: tushare
description: >
  查询中国A股数据（基于 Tushare Pro API）。支持个股历史价格（日K/周K/月K）、实时行情、
  股票基本信息、财务数据（利润表/资产负债表/现金流量表/财务指标）、指数行情（沪深300/上证指数等）、
  财经新闻、基金持仓、个股估值基本面（PE/PB/市值），并可生成K线图和分时图。
  Use when the user asks about Chinese A-share stock prices, quotes, financials, index levels,
  financial news, fund holdings, or requests stock charts (K-line/candlestick, intraday timeline).
  Triggers on: 股价、行情、K线、分时图、财报、利润表、资产负债表、市盈率、市值、指数、沪深300、
  上证指数、基金持仓、财经新闻、基本面、估值。
---

# Tushare A股数据技能

## 前置条件

必须设置环境变量 `TUSHARE_TOKEN`（用户的 tushare.pro API token）。
若未设置，提示用户先在 [tushare.pro](https://tushare.pro/) 注册并获取 token。

## 脚本目录

所有脚本位于 `scripts/`，均输出 JSON（stdout），可直接解析用于分析。

```
scripts/
├── ts_client.py         # 公共客户端（勿直接调用）
├── stock_price.py       # 历史价格（日/周/月K）
├── realtime_quote.py    # 实时行情
├── stock_info.py        # 股票基本信息
├── financial_data.py    # 财务数据
├── index_quote.py       # 指数行情
├── news.py              # 财经新闻
├── fund_holding.py      # 基金持仓
├── fundamental.py       # 估值基本面
├── plot_kline.py        # 生成K线图（PNG）
└── plot_timeline.py     # 生成分时图（PNG）
```

## 用法

用 `python <脚本> --help` 查看每个脚本的完整参数。通用模式：

```bash
# 历史价格（默认最近60个交易日）
python scripts/stock_price.py 600519 --freq daily --limit 60

# 实时行情（支持多只）
python scripts/realtime_quote.py 600519 000001

# 股票基本信息
python scripts/stock_info.py 600519

# 财务指标（最近4期）
python scripts/financial_data.py 600519 --type indicator --limit 4

# 利润表
python scripts/financial_data.py 600519 --type income

# 指数行情（支持名称）
python scripts/index_quote.py 沪深300 --limit 30

# 财经新闻
python scripts/news.py --src sina --limit 20

# 基金持仓
python scripts/fund_holding.py 110011 --period 20251231

# 估值基本面（PE/PB/市值）
python scripts/fundamental.py 600519 --limit 10

# K线图（生成PNG）
python scripts/plot_kline.py 600519 --freq daily --limit 90 --ma 5,10,20

# 分时图（需要高积分权限）
python scripts/plot_timeline.py 600519
```

## 工作流程

### 文字分析类查询
1. 确定股票代码（用户可能给名称，需先推断或用 `stock_info.py` 确认）
2. 调用对应脚本获取 JSON 数据
3. 解析数据，给出分析结论（涨跌幅、估值水平、财务健康度等）

### 图表展示类查询
1. 调用 `plot_kline.py` 或 `plot_timeline.py` 生成 PNG
2. 脚本输出的 JSON 中包含 `file` 字段（图片绝对路径）
3. 将该图片展示给用户（通过 `read` 工具读取图片或作为附件发送）
4. 同时可调用 `stock_price.py` 获取文字数据辅助分析

### 股票代码解析
- 用户给纯数字（如 600519）→ 脚本自动补全交易所后缀
- 用户给名称（如 贵州茅台）→ 需先知道代码，若不确定可提示用户提供，或用已知常识映射
- 常见股票：贵州茅台=600519、宁德时代=300750、平安银行=000001、比亚迪=002594

## 积分与权限

不同接口需要不同 tushare 积分。若脚本报权限错误，参考 `references/tushare_api.md`
中的积分对照表，告知用户所需积分及提升方式。免费/低积分可用：
`stock_basic`、`index_daily`、`realtime_quote`；日K需120积分。

## 注意事项

- 所有脚本均从环境变量 `TUSHARE_TOKEN` 读取 token，勿在命令中明文传递
- 非交易时段 `realtime_quote.py` 返回最近收盘数据
- `plot_timeline.py` 的分时数据（分钟级）需要较高积分，可能不可用，报错时如实告知
- 财务数据接口返回字段多，解析时聚焦用户关心的指标
- 更多接口细节见 `references/tushare_api.md`
