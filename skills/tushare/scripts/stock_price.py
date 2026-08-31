"""
查询股票历史价格（日K/周K/月K）
用法: python stock_price.py <股票代码> [--freq daily|weekly|monthly] [--start YYYYMMDD] [--end YYYYMMDD] [--limit N]
输出: JSON 格式的价格数据
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code


def main():
    parser = argparse.ArgumentParser(description="查询股票历史价格")
    parser.add_argument("code", help="股票代码，如 600519 或 600519.SH")
    parser.add_argument("--freq", default="daily", choices=["daily", "weekly", "monthly"],
                        help="K线频率: daily(日K), weekly(周K), monthly(月K)")
    parser.add_argument("--start", default=None, help="开始日期，格式 YYYYMMDD")
    parser.add_argument("--end", default=None, help="结束日期，格式 YYYYMMDD")
    parser.add_argument("--limit", type=int, default=60, help="返回条数限制，默认60")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    func_map = {
        "daily": pro.daily,
        "weekly": pro.weekly,
        "monthly": pro.monthly,
    }
    func = func_map[args.freq]

    kwargs = {"ts_code": ts_code}
    if args.start:
        kwargs["start_date"] = args.start
    if args.end:
        kwargs["end_date"] = args.end

    try:
        df = func(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的数据"}, ensure_ascii=False))
        sys.exit(1)

    # 按日期升序排列，取最近 N 条
    df = df.sort_values("trade_date").tail(args.limit)

    records = df[["trade_date", "open", "high", "low", "close", "vol", "amount"]].to_dict("records")
    result = {
        "ts_code": ts_code,
        "freq": args.freq,
        "count": len(records),
        "data": records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
