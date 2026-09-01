# -*- coding: utf-8 -*-
"""绩效指标计算：总收益、年化、最大回撤、夏普、胜率、盈亏比。"""
import pandas as pd
import numpy as np

from .config import RISK_FREE_RATE, TRADING_DAYS


def compute_metrics(equity_df, trades, initial_capital, start, end, data_source, fetched_at):
    """从净值曲线 + 交易明细计算完整绩效指标。

    Args:
        equity_df: 逐日净值表（date/equity）
        trades:    交易明细表（type/price/shares/pnl...）
        initial_capital: 初始资金
    Returns:
        dict: 绩效指标
    """
    eq = equity_df["equity"].values
    dates = pd.to_datetime(equity_df["date"])
    n = len(eq)
    if n == 0:
        return {}
    final = eq[-1]
    total_return = final / initial_capital - 1

    years = max((dates.iloc[-1] - dates.iloc[0]).days / 365.25, 1e-6)
    cagr = (final / initial_capital) ** (1 / years) - 1 if final > 0 else -1

    # 最大回撤
    running_max = np.maximum.accumulate(eq)
    drawdown = (eq - running_max) / running_max
    max_drawdown = float(drawdown.min())

    # 年化夏普（无风险利率）
    daily_ret = pd.Series(eq).pct_change().dropna()
    if len(daily_ret) > 1 and daily_ret.std() != 0:
        sharpe = (daily_ret.mean() * TRADING_DAYS - RISK_FREE_RATE) / (daily_ret.std() * np.sqrt(TRADING_DAYS))
    else:
        sharpe = 0.0

    # 胜率 / 盈亏比
    sells = trades[trades["type"] == "sell"] if not trades.empty else pd.DataFrame()
    if not sells.empty and "pnl" in sells.columns:
        wins = sells["pnl"][sells["pnl"] > 0]
        losses = sells["pnl"][sells["pnl"] <= 0]
        win_rate = len(wins) / len(sells)
        avg_win = wins.mean() if len(wins) else 0.0
        avg_loss = abs(losses.mean()) if len(losses) else 0.0
        profit_factor = (avg_win / avg_loss) if avg_loss else 0.0
    else:
        win_rate = profit_factor = 0.0

    return {
        "initial_capital": initial_capital,
        "final_equity": round(final, 2),
        "total_return": round(total_return * 100, 2),
        "cagr": round(cagr * 100, 2),
        "max_drawdown": round(max_drawdown * 100, 2),
        "sharpe": round(sharpe, 2),
        "win_rate": round(win_rate * 100, 2),
        "profit_factor": round(profit_factor, 2),
        "num_trades": len(trades[trades["type"] == "buy"]) if not trades.empty else 0,
        "days": n,
        "start": start,
        "end": end,
        "data_source": data_source,
        "fetched_at": fetched_at,
        "short_window_warning": n < 750,
    }
