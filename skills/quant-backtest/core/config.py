# -*- coding: utf-8 -*-
"""统一配置：回测参数、交易成本、市场规则。

集中放置所有可调参数，支持代码覆盖或环境变量覆盖。
这样 CLI / 策略 / 引擎 / 数据源都能引用同一套配置，避免魔法数字散落。
"""
import os

# ---- 交易成本 ----
# A 股佣金约 0.03%（双边），印花税 0.1%（卖出），涨跌停 ±10%
COMMISSION_RATE = float(os.getenv("QB_COMMISSION", "0.0003"))
STAMP_TAX = float(os.getenv("QB_STAMP_TAX", "0.001"))
PRICE_LIMIT = float(os.getenv("QB_PRICE_LIMIT", "0.10"))
LOT_SIZE = int(os.getenv("QB_LOT_SIZE", "100"))          # 一手 = 100 股

# ---- 回测默认 ----
DEFAULT_INITIAL_CAPITAL = float(os.getenv("QB_INITIAL_CAPITAL", "100000"))
DEFAULT_MA_SHORT = int(os.getenv("QB_MA_SHORT", "5"))
DEFAULT_MA_LONG = int(os.getenv("QB_MA_LONG", "20"))
DEFAULT_START = os.getenv("QB_START", "2022-06-01")
DEFAULT_END = os.getenv("QB_END", "2026-08-31")
DEFAULT_MAX_LEN = int(os.getenv("QB_MAX_LEN", "1023"))   # 数据源单次拉取最大K线数
DEFAULT_DATA_SOURCE = os.getenv("QB_DATA_SOURCE", "sina")

# ---- 指标 ----
RISK_FREE_RATE = float(os.getenv("QB_RISK_FREE", "0.02"))  # 夏普用无风险利率
TRADING_DAYS = int(os.getenv("QB_TRADING_DAYS", "252"))    # 年化交易日

# ---- 渲染 ----
DEFAULT_MA_LIST = tuple(int(x) for x in os.getenv("QB_MA_LIST", "5,10,20,60,180").split(",") if x.strip())


class TradingConfig:
    """交易执行配置（回测引擎使用）。"""

    def __init__(self, initial_capital: float = DEFAULT_INITIAL_CAPITAL,
                 commission: float = COMMISSION_RATE,
                 stamp_tax: float = STAMP_TAX,
                 price_limit: float = PRICE_LIMIT,
                 lot: int = LOT_SIZE,
                 with_cost: bool = True):
        self.initial_capital = initial_capital
        self.commission = commission
        self.stamp_tax = stamp_tax
        self.price_limit = price_limit
        self.lot = lot
        self.with_cost = with_cost
