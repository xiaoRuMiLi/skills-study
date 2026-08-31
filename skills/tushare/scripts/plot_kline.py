"""
生成 K 线图（蜡烛图）
用法: python plot_kline.py <股票代码> [--freq daily|weekly|monthly] [--limit N] [--ma 5,10,20] [--output PATH] [--title TITLE]
输出: 生成 PNG 图片文件，并输出文件路径
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code

# ======== 在导入 mplfinance 之前设置中文字体 ========
# mplfinance 会继承 matplotlib 的字体设置
# 直接设置 font.family 为具体字体名，绕过 fallback 机制
import matplotlib
matplotlib.use("Agg")
from matplotlib import font_manager
_chinese_fonts = ["Microsoft YaHei", "SimHei", "FangSong", "SimSun"]
_available_fonts = {f.name for f in font_manager.fontManager.ttflist}
for _fn in _chinese_fonts:
    if _fn in _available_fonts:
        matplotlib.rcParams["font.family"] = _fn
        matplotlib.rcParams["axes.unicode_minus"] = False
        break

import pandas as pd
import matplotlib.pyplot as plt
import mplfinance as mpf


def main():
    parser = argparse.ArgumentParser(description="生成 K 线图")
    parser.add_argument("code", help="股票代码，如 600519")
    parser.add_argument("--freq", default="daily", choices=["daily", "weekly", "monthly"],
                        help="K线频率")
    parser.add_argument("--limit", type=int, default=90, help="K线数量，默认90")
    parser.add_argument("--ma", default="5,10,20", help="均线，逗号分隔，如 5,10,20；传空字符串则不画均线")
    parser.add_argument("--volume", action="store_true", default=True, help="显示成交量")
    parser.add_argument("--output", default=None, help="输出文件路径，默认保存到临时目录")
    parser.add_argument("--title", default=None, help="图表标题")
    parser.add_argument("--style", default="yahoo", help="图表风格，默认 yahoo")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    func_map = {"daily": pro.daily, "weekly": pro.weekly, "monthly": pro.monthly}
    func = func_map[args.freq]

    try:
        df = func(ts_code=ts_code)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的数据"}, ensure_ascii=False))
        sys.exit(1)

    # 取最近 N 条，按日期升序
    df = df.sort_values("trade_date").tail(args.limit).reset_index(drop=True)

    # 构造 mplfinance 需要的 DataFrame
    plot_df = pd.DataFrame({
        "Open": df["open"].values,
        "High": df["high"].values,
        "Low": df["low"].values,
        "Close": df["close"].values,
        "Volume": df["vol"].values,
    }, index=pd.to_datetime(df["trade_date"], format="%Y%m%d"))
    plot_df.index.name = "Date"

    # 均线
    mav = None
    if args.ma.strip():
        mav = tuple(int(x) for x in args.ma.split(","))

    title = args.title or f"{ts_code} {args.freq.upper()} K-Line"

    # 输出路径
    output = args.output
    if not output:
        import tempfile
        safe_code = ts_code.replace(".", "_")
        output = os.path.join(tempfile.gettempdir(), f"kline_{safe_code}_{args.freq}.png")

    # mplfinance 使用 matplotlib 的全局 rcParams
    use_style = args.style
    if use_style in ["yahoo", "charles", "tradingview", "blueskies", "brasil", "sas", "kenan", "ibd", "starsandstripes", "checkers", "mike", "nightclouds", "yahoo-dark", "charles-dark", "tradingview-dark"]:
        use_style = "default"

    kwargs = {
        "type": "candle",
        "style": use_style,
        "title": "",  # 不用 mplfinance 的 title，我们手动设置
        "volume": args.volume,
        "returnfig": True,  # 返回 figure 对象以便手动设置标题
        "figscale": 1.3,
    }
    if mav:
        kwargs["mav"] = mav

    try:
        fig, axes = mpf.plot(plot_df, **kwargs)
        # 手动设置标题，使用中文字体
        fig.suptitle(title, fontsize=14, fontweight="bold")
        fig.savefig(output, dpi=150, bbox_inches="tight")
        plt.close(fig)
    except Exception as e:
        print(json.dumps({"error": f"绘图失败: {e}"}, ensure_ascii=False))
        sys.exit(1)

    result = {
        "ts_code": ts_code,
        "freq": args.freq,
        "bars": len(plot_df),
        "file": output,
        "message": f"K线图已生成: {output}",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
