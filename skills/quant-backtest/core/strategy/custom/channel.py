# -*- coding: utf-8 -*-
"""示例自定义策略：线性回归通道（均值回归）。

用户逻辑：近 N 天收盘价做线性回归 → 中轨；上下轨 = 中轨 ± k×标准差（平行通道）。
        价格跌破下轨 → 以收市价买入（超卖反弹）；突破上轨 → 以收市价卖出（超买回落）。
放入 core/strategy/custom/ 目录自动加载。
用法: python scripts/backtest.py --symbol sh600519 --strategy channel
"""
import numpy as np

from core.strategy.base import Strategy
from core.strategy import register_strategy


class ChannelStrategy(Strategy):
    name = "channel"
    display_name = "线性回归通道（均值回归）"
    overview = ("对近 N 天收盘价做线性回归得中轨，上下轨 = 中轨 ± k×标准差，形成平行通道；"
                "价格在通道内运行，视为围绕趋势均值波动。")
    buy_rule = ("价格（收市价）跌破下通道线（中轨 - k×标准差）时，以当日收市价买入，"
                "视为超卖、价格大概率回归通道内。")
    sell_rule = ("价格（收市价）突破上通道线（中轨 + k×标准差）时，以当日收市价卖出，"
                 "视为超买、价格大概率回归通道内。")

    def __init__(self, period: int = 120, k: float = 2.0):
        self.period = period          # 通道窗口（天）
        self.k = k                    # 标准差倍数

    def generate_signals(self, df):
        df = self.prepare(df)
        close = df["close"].values
        n = len(close)
        period = self.period
        # 初始化通道列
        df["ch_mid"] = np.nan
        df["ch_upper"] = np.nan
        df["ch_lower"] = np.nan
        # 逐日计算线性回归通道
        for i in range(n):
            if i + 1 < period:
                continue
            window = close[i + 1 - period:i + 1]      # 近 period 天
            x = np.arange(period)
            # 线性回归斜率+截距
            slope, intercept = np.polyfit(x, window, 1)
            mid = slope * (period - 1) + intercept     # 窗口末日的回归值（中轨）
            std = window.std(ddof=0)                   # 窗口标准差
            df.loc[df.index[i], "ch_mid"] = mid
            df.loc[df.index[i], "ch_upper"] = mid + self.k * std
            df.loc[df.index[i], "ch_lower"] = mid - self.k * std
        # 买卖信号：收盘价低于下轨=买，高于上轨=卖（均值回归，当日收市价成交）
        df["signal"] = 0
        df.loc[df["close"] < df["ch_lower"], "signal"] = 1
        df.loc[df["close"] > df["ch_upper"], "signal"] = -1
        return df


def register():
    register_strategy("channel", ChannelStrategy())
