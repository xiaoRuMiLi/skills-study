# -*- coding: utf-8 -*-
"""内置策略实现：MA 双均线、RSI 超买超卖、MACD。"""
import pandas as pd
import numpy as np

from .base import Strategy


class MAStrategy(Strategy):
    """双均线金叉死叉。短均线上穿长均线买入，下穿卖出。"""

    name = "ma"
    display_name = "双均线金叉死叉"
    overview = "用两条不同周期的移动平均线判断趋势：短均线在长均线之上视为上升趋势，之下视为下降趋势。"
    buy_rule = ("短周期均线（如 MA5）从下方向上穿越长周期均线（如 MA20），形成「金叉」，"
                "说明短期走势转强，判定为买入信号。")
    sell_rule = ("短周期均线从上方向下穿越长周期均线，形成「死叉」，"
                 "说明短期走势转弱，判定为卖出信号。")

    def __init__(self, short: int = 5, long: int = 20):
        self.short = short
        self.long = long
        if self.short >= self.long:
            raise ValueError("short 必须小于 long")

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self.prepare(df)
        df["ma_short"] = df["close"].rolling(self.short).mean()
        df["ma_long"] = df["close"].rolling(self.long).mean()
        state = (df["ma_short"] > df["ma_long"]).astype(int)
        # 金叉：0->1；死叉：1->0
        df["signal"] = 0
        df.loc[(state == 1) & (state.shift(1) == 0), "signal"] = 1
        df.loc[(state == 0) & (state.shift(1) == 1), "signal"] = -1
        df["sig_state"] = state  # 供渲染显示均线状态
        return df


class RSIStrategy(Strategy):
    """RSI 超买超卖。RSI(14) < 30 买入，> 70 卖出。"""

    name = "rsi"
    display_name = "RSI 超买超卖"
    overview = "用相对强弱指标(RSI)衡量近期涨跌动能，识别超买（涨过头）和超卖（跌过头）的极端状态。"
    buy_rule = ("RSI 指标跌破超卖线（默认 30），说明股价短期跌得过多、存在反弹需求，"
                "判定为买入信号。")
    sell_rule = ("RSI 指标升破超买线（默认 70），说明股价短期涨得过多、存在回调压力，"
                 "判定为卖出信号。")

    def __init__(self, period: int = 14, oversold: float = 30, overbought: float = 70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self.prepare(df)
        delta = df["close"].diff()
        gain = delta.clip(lower=0).rolling(self.period).mean()
        loss = (-delta.clip(upper=0)).rolling(self.period).mean()
        rs = gain / (loss + 1e-9)
        df["rsi"] = 100 - (100 / (1 + rs))
        df["signal"] = 0
        df.loc[df["rsi"] < self.oversold, "signal"] = 1
        df.loc[df["rsi"] > self.overbought, "signal"] = -1
        return df


class MACDStrategy(Strategy):
    """MACD 金叉死叉。DIF 上穿 DEA 买入，下穿卖出。"""

    name = "macd"
    display_name = "MACD 金叉死叉"
    overview = "用 MACD 指标（快慢均线差 DIF 与信号线 DEA）判断趋势动能的变化与买卖时机。"
    buy_rule = ("DIF 线从下方向上穿越 DEA 线，形成「MACD 金叉」，"
                "说明多头动能增强，判定为买入信号。")
    sell_rule = ("DIF 线从上方向下穿越 DEA 线，形成「MACD 死叉」，"
                 "说明空头动能增强，判定为卖出信号。")

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        self.fast = fast
        self.slow = slow
        self.signal = signal

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self.prepare(df)
        ema_fast = df["close"].ewm(span=self.fast, adjust=False).mean()
        ema_slow = df["close"].ewm(span=self.slow, adjust=False).mean()
        df["dif"] = ema_fast - ema_slow
        df["dea"] = df["dif"].ewm(span=self.signal, adjust=False).mean()
        df["macd_hist"] = (df["dif"] - df["dea"]) * 2
        df["signal"] = 0
        df.loc[(df["dif"] > df["dea"]) & (df["dif"].shift(1) <= df["dea"].shift(1)), "signal"] = 1
        df.loc[(df["dif"] < df["dea"]) & (df["dif"].shift(1) >= df["dea"].shift(1)), "signal"] = -1
        return df
