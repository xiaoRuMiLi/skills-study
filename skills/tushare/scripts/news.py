"""
查询财经消息/新闻
用法: python news.py [--src sina|wallstreetcn|10jqka|eastmoney|yuncaijing] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--limit N]
输出: JSON 格式的财经新闻列表
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client


def main():
    parser = argparse.ArgumentParser(description="查询财经消息")
    parser.add_argument("--src", default="sina",
                        choices=["sina", "wallstreetcn", "10jqka", "eastmoney", "yuncaijing"],
                        help="新闻来源，默认 sina")
    parser.add_argument("--start", default=None, help="开始日期，格式 YYYY-MM-DD HH:MM:SS")
    parser.add_argument("--end", default=None, help="结束日期，格式 YYYY-MM-DD HH:MM:SS")
    parser.add_argument("--limit", type=int, default=20, help="返回条数，默认20")
    args = parser.parse_args()

    pro = get_client()

    kwargs = {"src": args.src}
    if args.start:
        kwargs["start_date"] = args.start
    if args.end:
        kwargs["end_date"] = args.end

    try:
        df = pro.news(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": "未获取到新闻数据", "src": args.src}, ensure_ascii=False))
        sys.exit(1)

    df = df.head(args.limit)
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
        "src": args.src,
        "count": len(clean_records),
        "data": clean_records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
