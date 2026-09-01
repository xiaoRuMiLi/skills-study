#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""quant-backtest CLI 入口。

模块化架构：
  - 数据源: core.data_source 工厂（默认 sina，可扩展）
  - 策略:   core.strategy 注册表 + 自动发现（默认 ma/rsi/macd）
  - 引擎:   core.engine 回测执行器（真实 A 股规则）
  - 渲染:   core.render ECharts K线 + 买卖箭头

用法:
    python backtest.py --symbol sh600519 --strategy ma --short 5 --long 20 \
        --start 2022-06-01 --end 2026-08-31 --initial-capital 1000000

    # 发现能力:
    python backtest.py --list-strategies
    python backtest.py --list-datasources

    # 自定义数据源: --datasource my_src   (需先注册)
    # 自定义策略:   --strategy my_boll    (放入 core/strategy/custom/ 自动发现)
"""
import argparse
import json
import sys
import importlib.util
from datetime import datetime
from pathlib import Path

# 确保能导入 core 包
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
if str(SKILL_ROOT) not in sys.path:
    sys.path.insert(0, str(SKILL_ROOT))


def _check_deps():
    """启动时检查必要依赖，缺库时给出清晰安装提示。"""
    required = {
        "pandas": "数据处理（DataFrame）",
        "numpy": "数值计算",
    }
    missing = []
    for mod, desc in required.items():
        if importlib.util.find_spec(mod) is None:
            missing.append(f"{mod}（{desc}）")
    if missing:
        print("\n[backtest] ⚠️ 缺少必要依赖，请先安装：")
        print("  " + "、".join(missing))
        print('\n  执行：pip install pandas numpy')
        print("  （本技能零其他依赖，仅需这两个库）\n", flush=True)
        sys.exit(3)


_check_deps()

from core import data_source as ds          # noqa: E402
from core import strategy as stgy           # noqa: E402
from core import render                     # noqa: E402
from core import config as qcfg             # noqa: E402
from core.engine import BacktestEngine      # noqa: E402
from core.metrics import compute_metrics    # noqa: E402


def _print_strategies():
    print("可用策略:")
    for name, display in stgy.list_strategies().items():
        print(f"  {name:<12} {display}")
    print("\n自定义策略: 在 core/strategy/custom/ 下放 .py 文件，自动发现。见 SKILL.md。")


def _print_datasources():
    print("可用数据源:")
    for name, display in ds.list_datasources().items():
        print(f"  {name:<12} {display}")
    print("\n自定义数据源: 继承 core.data_source.base.DataSource，register_datasource 注册。见 SKILL.md。")


def main():
    p = argparse.ArgumentParser(
        description="A股量化策略回测引擎（模块化，真实数据，可扩展）",
        epilog="示例: python backtest.py --symbol sh600519 --strategy ma --initial-capital 1000000",
    )
    p.add_argument("--symbol", help="带市场前缀代码，如 sh600519/sz000858")
    p.add_argument("--strategy", default="ma", help="策略名（内置 ma/rsi/macd，或自定义注册名）")
    p.add_argument("--datasource", default="sina", help="数据源名（默认 sina）")
    p.add_argument("--short", type=int, default=qcfg.DEFAULT_MA_SHORT)
    p.add_argument("--long", type=int, default=qcfg.DEFAULT_MA_LONG)
    p.add_argument("--start", default=qcfg.DEFAULT_START)
    p.add_argument("--end", default=qcfg.DEFAULT_END)
    p.add_argument("--initial-capital", type=float, default=qcfg.DEFAULT_INITIAL_CAPITAL)
    p.add_argument("--ma", default=",".join(str(x) for x in qcfg.DEFAULT_MA_LIST), help="渲染用均线周期，逗号分隔（默认 5,10,20）")
    p.add_argument("--boll", action="store_true", help="开启布林线")
    p.add_argument("--no-vol", action="store_true", help="隐藏成交量副图")
    p.add_argument("--no-equity", action="store_true", help="隐藏净值曲线副图")
    p.add_argument("--max-len", type=int, default=qcfg.DEFAULT_MAX_LEN, help="数据源单次拉取的最大K线数（默认1023）")
    p.add_argument("--out", default=None, help="输出目录（默认 output/<symbol>_<strategy>/ 下次运行自动归类）")
    p.add_argument("--list-strategies", action="store_true", help="列出所有可用策略并退出")
    p.add_argument("--list-datasources", action="store_true", help="列出所有可用数据源并退出")
    args = p.parse_args()

    # ---- 发现命令 ----
    if args.list_strategies:
        _print_strategies()
        return
    if args.list_datasources:
        _print_datasources()
        return
    if not args.symbol:
        p.error("缺少必要参数 --symbol（或用 --list-strategies / --list-datasources 查看能力）")

    try:
        # 1. 数据源工厂
        source = ds.get_datasource(args.datasource)
        print(f"[backtest] 数据源: {source.display_name}", flush=True)
        # 支持 --max-len 传给数据源（若支持）
        try:
            df = source.fetch(args.symbol, args.start, args.end, max_len=args.max_len)
        except TypeError:
            df = source.fetch(args.symbol, args.start, args.end)
        # 拉取个股基本信息（名称/行业等），失败不影响回测
        try:
            stock_info = source.get_stock_info(args.symbol)
        except Exception:  # noqa: BLE001
            stock_info = {}

        # 2. 策略
        strat = stgy.get_strategy(args.strategy)
        df = strat.generate_signals(df)
        strat_params = ""
        if hasattr(strat, "short") and hasattr(strat, "long"):
            strat_params = f"MA {strat.short}/{strat.long}"
        elif hasattr(strat, "period"):
            # 通用：根据策略名判断是 RSI 还是均线周期
            prefix = "RSI" if args.strategy.lower() == "rsi" else "均线"
            strat_params = f"{prefix} 周期={strat.period}"

        # 3. 回测引擎
        cfg = qcfg.TradingConfig(initial_capital=args.initial_capital)
        engine = BacktestEngine(cfg)
        equity_df, trades = engine.run(df)

        # 4. 绩效
        metrics = compute_metrics(
            equity_df, trades, args.initial_capital, args.start, args.end,
            source.display_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
    except Exception as e:
        hint = ""
        msg = str(e)
        # 错误提示优化：策略/数据源未找到时给出候选
        if "未注册的策略" in msg:
            hint = " 候选策略: " + ", ".join(list(stgy.list_strategies()))
        elif "未注册的数据源" in msg:
            hint = " 候选数据源: " + ", ".join(list(ds.list_datasources()))
        print(f"\n[backtest] ⚠️ {msg}{hint}\n", flush=True)
        sys.exit(2)

    # 5. 渲染 HTML
    # 把净值曲线（equity）按日期合并回 df，供净值副图渲染
    if "date" in equity_df.columns and not equity_df.empty:
        eq_map = dict(zip(equity_df["date"].astype(str), equity_df["equity"]))
        df["equity"] = df["date"].dt.strftime("%Y-%m-%d").map(eq_map)

    ma_list = tuple(int(x) for x in args.ma.split(",") if x.strip())
    html = render.render_html(df, trades, metrics, args.symbol, args.strategy,
                              strat_params, ma_list=ma_list, use_boll=args.boll,
                              use_vol=not args.no_vol, show_equity=not args.no_equity,
                              rules=strat.get_rules(), stock_info=stock_info)

    # 输出目录：默认输出到 output/<symbol>_<strategy>/（每次运行自动归类，避免堆在根目录）
    out_dir = args.out or (str(SKILL_ROOT / "output" / f"{args.symbol}_{args.strategy}"))
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    html_path = Path(out_dir) / f"{args.symbol}_{args.strategy}.html"
    csv_path = Path(out_dir) / f"{args.symbol}_{args.strategy}.csv"
    html_path.write_text(html, encoding="utf-8")
    equity_df.to_csv(csv_path, index=False)

    print("=" * 52, flush=True)
    print(f"回测完成：{args.symbol} {args.strategy} ({args.start} ~ {args.end})", flush=True)
    print(f"  总收益率: {metrics['total_return']}%", flush=True)
    print(f"  年化收益: {metrics['cagr']}%", flush=True)
    print(f"  最大回撤: {metrics['max_drawdown']}%", flush=True)
    print(f"  夏普比率: {metrics['sharpe']}", flush=True)
    print(f"  胜率:     {metrics['win_rate']}%   盈亏比: {metrics['profit_factor']}", flush=True)
    print(f"  交易次数: {metrics['num_trades']}", flush=True)
    if metrics["short_window_warning"]:
        print("  ⚠️ 回测区间不足 3 年，参考价值有限", flush=True)
    print(f"  报告: {html_path}", flush=True)
    print(f"  明细: {csv_path}", flush=True)

    print("\n" + json.dumps(metrics, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
