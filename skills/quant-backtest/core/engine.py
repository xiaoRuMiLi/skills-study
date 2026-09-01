# -*- coding: utf-8 -*-
"""回测引擎：统一执行器。

只读取 df 中的 signal 列（+1/-1/0），不关心策略类型。
负责 A 股交易成本（佣金/印花税）、T+1 约束、涨跌停过滤、
100 股一手、初始资金管理，输出逐日净值曲线与交易明细。

绩效指标计算见 core.metrics。
"""
import pandas as pd

from .config import (COMMISSION_RATE, STAMP_TAX, PRICE_LIMIT, LOT_SIZE,
                     DEFAULT_INITIAL_CAPITAL, TradingConfig)


class BacktestConfig(TradingConfig):
    """回测执行配置（兼容旧名，行为同 TradingConfig）。"""

    def __init__(self, initial_capital: float = DEFAULT_INITIAL_CAPITAL,
                 commission: float = COMMISSION_RATE,
                 stamp_tax: float = STAMP_TAX,
                 price_limit: float = PRICE_LIMIT,
                 lot: int = LOT_SIZE,
                 with_cost: bool = True):
        super().__init__(initial_capital, commission, stamp_tax,
                         price_limit, lot, with_cost)


class BacktestEngine:
    """回测执行器。run(df) 返回 (equity_df, trades_df)。"""

    def __init__(self, config: BacktestConfig = None):
        self.config = config or BacktestConfig()

    def run(self, df: pd.DataFrame):
        cfg = self.config
        if "signal" not in df.columns:
            raise ValueError("df 缺少 signal 列，请先运行策略生成信号")

        df = df.reset_index(drop=True)
        cash = cfg.initial_capital
        shares = 0
        position_cost = 0.0
        prev_close = None
        t_plus_1_block = False  # T+1：买入当日不可卖
        trades = []
        equity_curve = []

        for i, row in df.iterrows():
            price = float(row["close"])
            date = row["date"]
            sig = int(row["signal"]) if not pd.isna(row["signal"]) else 0

            # ---- 卖出信号（T+1 约束 + 持仓 > 0）----
            if shares > 0 and sig == -1 and not t_plus_1_block:
                fee = (cfg.commission + cfg.stamp_tax) if cfg.with_cost else 0
                proceeds = shares * price * (1 - fee)
                cash += proceeds
                profit = proceeds - position_cost
                trades.append({"date": date.strftime("%Y-%m-%d"), "type": "sell",
                               "price": round(price, 2), "shares": shares,
                               "pnl": round(profit, 2),
                               "pnl_pct": round(profit / position_cost * 100, 2) if position_cost else 0})
                shares = 0
                position_cost = 0.0

            # ---- 买入信号 ----
            if shares == 0 and sig == 1:
                if prev_close and (price / prev_close - 1) > cfg.price_limit - 0.005:
                    t_plus_1_block = False  # 涨停不追买
                else:
                    budget = cash * (1 - (cfg.commission if cfg.with_cost else 0))
                    shares = int(budget // (price * cfg.lot)) * cfg.lot
                    if shares == 0:
                        raise RuntimeError(
                            f"初始资金 {cfg.initial_capital:,.0f} 元不足买入 1 手"
                            f"（{cfg.lot}股 x {price:.2f} 元 = {price * cfg.lot:,.0f} 元）。"
                            f"请提高初始资金或回测低价股。")
                    fee = cfg.commission if cfg.with_cost else 0
                    cost = shares * price * (1 + fee)
                    cash -= cost
                    position_cost = cost
                    trades.append({"date": date.strftime("%Y-%m-%d"), "type": "buy",
                                   "price": round(price, 2), "shares": shares,
                                   "pnl": None, "pnl_pct": None})
                    t_plus_1_block = True
                    equity = cash + shares * price
                    equity_curve.append({"date": date.strftime("%Y-%m-%d"),
                                         "equity": round(equity, 2),
                                         "close": round(price, 2),
                                         "shares": shares,
                                         "cash": round(cash, 2)})
                    prev_close = price
                    continue

            # ---- 记录当日净值 ----
            equity = cash + shares * price
            equity_curve.append({"date": date.strftime("%Y-%m-%d"),
                                 "equity": round(equity, 2),
                                 "close": round(price, 2),
                                 "shares": shares,
                                 "cash": round(cash, 2)})
            prev_close = price
            t_plus_1_block = False

        if not equity_curve:
            raise RuntimeError("回测区间内未产生任何交易信号，请调整策略参数或扩大区间。")

        return pd.DataFrame(equity_curve), pd.DataFrame(trades)
