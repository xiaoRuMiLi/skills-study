"""
查询基金持仓（某只基金持有的股票组合）
用法: python fund_holding.py <基金代码> [--period YYYYMMDD] [--limit N]
输出: JSON 格式的基金持仓数据
说明: 基金代码格式如 000001.OF 或 110011.OF，period 为报告期如 20251231
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client


def resolve_fund_code(code: str) -> str:
    """标准化基金代码"""
    code = code.strip().upper()
    if "." in code:
        return code
    if code.isdigit():
        return code + ".OF"
    return code


def main():
    parser = argparse.ArgumentParser(description="查询基金持仓")
    parser.add_argument("code", help="基金代码，如 110011 或 110011.OF")
    parser.add_argument("--period", default=None, help="报告期，格式 YYYYMMDD，如 20251231")
    parser.add_argument("--limit", type=int, default=20, help="返回持仓股票数量，默认20")
    args = parser.parse_args()

    fund_code = resolve_fund_code(args.code)
    pro = get_client()

    kwargs = {"ts_code": fund_code}
    if args.period:
        kwargs["period"] = args.period

    try:
        df = pro.fund_portfolio(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {fund_code} 的持仓数据，请确认基金代码和报告期"}, ensure_ascii=False))
        sys.exit(1)

    df = df.head(args.limit)
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
        "fund_code": fund_code,
        "count": len(clean_records),
        "data": clean_records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
