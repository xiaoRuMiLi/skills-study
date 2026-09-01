# -*- coding: utf-8 -*-
"""示例自定义策略：60日均线单均线（收市价成交）。

用户逻辑：股价上穿 60 日均线 → 以收市价买入；跌破 60 日均线 → 以收市价卖出。
放入 core/strategy/custom/ 目录自动加载。
用法: python scripts/backtest.py --symbol sh600519 --strategy ma60
"""
from core.strategy.base import Strategy
from core.strategy import register_strategy


class MA60Strategy(Strategy):
    name = "ma60"
    display_name = "60日均线（收市价成交）"
    overview = "以 60 日均线作为趋势分界：股价站上 60 日线视为多头，跌破视为空头。"
    buy_rule = ("股价（收市价）向上穿越 60 日均线时，以当日收市价买入，"
                "视为站上长期趋势线、多头确立。")
    sell_rule = ("股价（收市价）向下跌破 60 日均线时，以当日收市价卖出，"
                 "视为跌破长期趋势线、多头转弱。")

    def __init__(self, period: int = 60):
        self.period = period

    def generate_signals(self, df):
        df = self.prepare(df)
        # 计算 60 日均线
        df["ma"] = df["close"].rolling(self.period).mean()
        # 计算趋势状态：收盘价在均线上方为 1，下方为 0
        state = (df["close"] > df["ma"]).astype(int)
        # 上穿（0->1）= 买入；下穿（1->0）= 卖出
        df["signal"] = 0
        df.loc[(state == 1) & (state.shift(1) == 0), "signal"] = 1
        df.loc[(state == 0) & (state.shift(1) == 1), "signal"] = -1
        # 注意：信号当日生成，引擎以当日收市价成交（不 shift，符合"以收市价买卖"）
        return df


def register():
    register_strategy("ma60", MA60Strategy())
