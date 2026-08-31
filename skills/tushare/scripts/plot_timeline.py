"""
生成分时图（当日/最近交易日的分钟级走势）
用法: python plot_timeline.py <股票代码> [--date YYYYMMDD] [--output PATH] [--title TITLE]
输出: 生成 PNG 图片文件，并输出文件路径
说明: 分时图展示价格线、均价线和成交量。需要 tushare 分钟级数据权限（积分要求较高）。
      若无分钟数据权限，脚本会报错提示。
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager


def setup_chinese_font():
    """尝试设置中文字体，避免乱码"""
    candidates = ["Microsoft YaHei", "SimHei", "Source Han Sans SC", "Noto Sans CJK SC", "Arial Unicode MS"]
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in available:
            plt.rcParams["font.sans-serif"] = [name]
            break
    plt.rcParams["axes.unicode_minus"] = False


def main():
    parser = argparse.ArgumentParser(description="生成分时图")
    parser.add_argument("code", help="股票代码，如 600519")
    parser.add_argument("--date", default=None, help="交易日期，格式 YYYYMMDD，默认最近交易日")
    parser.add_argument("--output", default=None, help="输出文件路径")
    parser.add_argument("--title", default=None, help="图表标题")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    # 获取分钟级数据
    kwargs = {"ts_code": ts_code, "freq": "1min"}
    if args.date:
        kwargs["start_date"] = args.date + " 09:30:00"
        kwargs["end_date"] = args.date + " 15:00:00"

    try:
        # stk_mins 需要较高积分权限
        df = pro.stk_mins(**kwargs)
    except Exception as e:
        err_msg = str(e)
        if "permission" in err_msg.lower() or "积分" in err_msg or "points" in err_msg.lower():
            print(json.dumps({
                "error": "分钟级数据需要更高的 tushare 积分权限，请升级积分后重试",
                "detail": err_msg
            }, ensure_ascii=False))
        else:
            print(json.dumps({"error": err_msg}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的分钟数据"}, ensure_ascii=False))
        sys.exit(1)

    # 如果没指定日期，取最近一个交易日
    df["trade_time"] = pd.to_datetime(df["trade_time"])
    if not args.date:
        latest_date = df["trade_time"].dt.date.max()
        df = df[df["trade_time"].dt.date == latest_date]
    else:
        target = pd.to_datetime(args.date).date()
        df = df[df["trade_time"].dt.date == target]

    if df.empty:
        print(json.dumps({"error": "指定日期无数据"}, ensure_ascii=False))
        sys.exit(1)

    df = df.sort_values("trade_time").reset_index(drop=True)

    # 计算均价线 = 累计成交额 / 累计成交量
    if "amount" in df.columns and "vol" in df.columns:
        cum_amount = df["amount"].cumsum()
        cum_vol = df["vol"].cumsum()
        df["avg_price"] = (cum_amount / cum_vol.replace(0, pd.NA)).ffill()
    else:
        df["avg_price"] = df["close"].cumsum() / (df.index + 1)

    setup_chinese_font()

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7), sharex=True,
                                    gridspec_kw={"height_ratios": [3, 1]})

    times = df["trade_time"]
    close = df["close"].values
    avg = df["avg_price"].values
    vol = df["vol"].values

    # 价格线
    ax1.plot(times, close, color="#1f77b4", linewidth=1.2, label="价格")
    ax1.plot(times, avg, color="#ff7f0e", linewidth=1.0, label="均价")
    ax1.set_ylabel("价格")
    ax1.legend(loc="upper left")
    ax1.grid(True, alpha=0.3)

    title = args.title or f"{ts_code} 分时图"
    ax1.set_title(title)

    # 成交量
    colors = ["#d62728" if c >= o else "#2ca02c"
              for c, o in zip(df["close"].values, df["open"].values)]
    ax2.bar(times, vol, color=colors, width=0.0008)
    ax2.set_ylabel("成交量")
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()

    output = args.output
    if not output:
        import tempfile
        safe_code = ts_code.replace(".", "_")
        output = os.path.join(tempfile.gettempdir(), f"timeline_{safe_code}.png")

    plt.savefig(output, dpi=150, bbox_inches="tight")
    plt.close(fig)

    result = {
        "ts_code": ts_code,
        "date": str(df["trade_time"].dt.date.iloc[0]),
        "points": len(df),
        "file": output,
        "message": f"分时图已生成: {output}",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
