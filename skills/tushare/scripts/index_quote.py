"""
查询指数行情（沪深300、上证指数等）
用法: python index_quote.py <指数代码或名称> [--start YYYYMMDD] [--end YYYYMMDD] [--limit N]
输出: JSON 格式的指数行情数据
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_index_code


def main():
    parser = argparse.ArgumentParser(description="查询指数行情")
    parser.add_argument("code", help="指数代码或名称，如 000300.SH、沪深300、上证指数")
    parser.add_argument("--start", default=None, help="开始日期，格式 YYYYMMDD")
    parser.add_argument("--end", default=None, help="结束日期，格式 YYYYMMDD")
    parser.add_argument("--limit", type=int, default=30, help="返回条数限制，默认30")
    args = parser.parse_args()

    index_code = resolve_index_code(args.code)
    pro = get_client()

    kwargs = {"ts_code": index_code}
    if args.start:
        kwargs["start_date"] = args.start
    if args.end:
        kwargs["end_date"] = args.end

    try:
        df = pro.index_daily(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {index_code} 的指数数据"}, ensure_ascii=False))
        sys.exit(1)

    df = df.sort_values("trade_date").tail(args.limit)
    records = df[["trade_date", "open", "high", "low", "close", "vol", "amount"]].to_dict("records")

    result = {
        "ts_code": index_code,
        "count": len(records),
        "data": records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
