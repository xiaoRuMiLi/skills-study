"""
查询股票基本信息（公司名称、行业、上市日期等）
用法: python stock_info.py <股票代码>
输出: JSON 格式的股票基本信息
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code


def main():
    parser = argparse.ArgumentParser(description="查询股票基本信息")
    parser.add_argument("code", help="股票代码，如 600519")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    try:
        df = pro.stock_basic(ts_code=ts_code, fields=(
            "ts_code,name,area,industry,market,list_date,fullname,"
            "cnspell,exchange,curr_type,list_status,delist_date"
        ))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的基本信息"}, ensure_ascii=False))
        sys.exit(1)

    record = df.iloc[0].to_dict()
    clean = {}
    for k, v in record.items():
        if hasattr(v, "item"):
            clean[k] = v.item()
        elif v != v:  # NaN check
            clean[k] = None
        else:
            clean[k] = v

    print(json.dumps(clean, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
