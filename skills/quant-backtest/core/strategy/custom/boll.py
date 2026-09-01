# -*- coding: utf-8 -*-
"""示例自定义策略：布林带突破（自动发现演示）。

放入 core/strategy/custom/ 目录，程序会自动加载。
用法: python scripts/backtest.py --symbol sh600519 --strategy my_boll
"""
from core.strategy.base import Strategy
from core.strategy import register_strategy


class BollStrategy(Strategy):
    name = "my_boll"
    display_name = "布林带突破"
    overview = "用布林带(BOLL)的上下轨作为支撑/压力，价格触及轨道时反向操作。"
    buy_rule = ("收盘价跌破布林带下轨（20日均线 - 2倍标准差），"
                "视为超跌、回归均值的概率增大，判定为买入信号。")
    sell_rule = ("收盘价突破布林带上轨（20日均线 + 2倍标准差），"
                 "视为超涨、回归均值的概率增大，判定为卖出信号。")

    def generate_signals(self, df):
        df = self.prepare(df)
        mid = df["close"].rolling(20).mean()
        std = df["close"].rolling(20).std()
        df["boll_upper"] = mid + 2 * std
        df["boll_mid"] = mid
        df["boll_lower"] = mid - 2 * std
        df["signal"] = 0
        df.loc[df["close"] < df["boll_lower"], "signal"] = 1   # 触及下轨买入
        df.loc[df["close"] > df["boll_upper"], "signal"] = -1  # 触及上轨卖出
        return df


def register():
    register_strategy("my_boll", BollStrategy())
