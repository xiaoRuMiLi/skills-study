"""
查询个股基本面数据（估值指标：PE、PB、市值、换手率等）
用法: python fundamental.py <股票代码> [--date YYYYMMDD] [--limit N]
输出: JSON 格式的基本面/估值数据
说明: 使用 daily_basic 接口，返回每日估值指标
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code


def main():
    parser = argparse.ArgumentParser(description="查询个股基本面/估值数据")
    parser.add_argument("code", help="股票代码，如 600519")
    parser.add_argument("--date", default=None, help="交易日期，格式 YYYYMMDD，默认最近")
    parser.add_argument("--limit", type=int, default=10, help="返回条数，默认10")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    kwargs = {"ts_code": ts_code}
    if args.date:
        kwargs["trade_date"] = args.date

    try:
        df = pro.daily_basic(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的基本面数据"}, ensure_ascii=False))
        sys.exit(1)

    df = df.sort_values("trade_date", ascending=False).head(args.limit)
    df = df.dropna(axis=1, how="all")
    records = df.to_dict("records")

    clean_records = []
    for rec in records:
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "item"):
                v = v.item()
            if v != v:
                continue
            clean[k] = v
        clean_records.append(clean)

    result = {
        "ts_code": ts_code,
        "count": len(clean_records),
        "data": clean_records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
