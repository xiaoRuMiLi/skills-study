# -*- coding: utf-8 -*-
"""策略抽象基类。

所有策略必须实现 generate_signals(df) -> df，并在返回的 DataFrame 中
附加一个 signal 列，语义统一为：
    +1 = 该日收盘后产生买入信号
    -1 = 该日收盘后产生卖出信号
     0 = 无操作

回测引擎只读取 signal 列，不关心策略类型，因此任意自定义策略
只要符合此契约即可无缝接入。

【策略中文说明】每个策略可通过以下类属性提供中文详细说明，
会显示在 HTML 报告的"策略说明"区块：
    overview  — 策略一句话简介（什么逻辑）
    buy_rule  — 什么情况买入
    sell_rule — 什么情况卖出
未提供时 get_rules() 会用默认文案兜底，不影响功能。
"""
import abc

import pandas as pd


class Strategy(abc.ABC):
    """策略基类。新策略继承此类并实现 generate_signals()。"""

    name = "base"
    display_name = "Base"
    # 中文策略说明（可选的类属性，自定义策略直接覆盖即可）
    overview = ""
    buy_rule = ""
    sell_rule = ""

    @abc.abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """在 df 上计算信号，返回带 signal 列的 DataFrame。"""

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        """通用预处理：按升序排序、重置索引，避免策略内反复处理。"""
        return df.copy().sort_values("date").reset_index(drop=True)

    def get_rules(self) -> dict:
        """返回策略的中文说明 {overview, buy_rule, sell_rule}。

        若自定义策略未写这些属性，则用 display_name 等默认文案兜底，
        保证 HTML 里始终有"策略说明"区块可展示。
        """
        overview = self.overview or (
            f"{self.display_name}策略，基于历史行情计算信号，输出买入/卖出标记。"
        )
        buy_rule = self.buy_rule or (
            "该策略通过 generate_signals() 计算出 signal 列；当 signal=+1 时触发买入。"
            "具体逻辑见策略源码。"
        )
        sell_rule = self.sell_rule or (
            "当 signal=-1 时触发卖出。具体逻辑见策略源码。"
        )
        return {
            "overview": overview,
            "buy_rule": buy_rule,
            "sell_rule": sell_rule,
        }

    def __repr__(self):
        return f"<Strategy {self.name}>"
