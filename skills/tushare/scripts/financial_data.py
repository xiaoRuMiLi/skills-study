"""
查询财务数据（财报、利润表、资产负债表、现金流量表）
用法: python financial_data.py <股票代码> [--type income|balance|cashflow|indicator] [--period YYYYMMDD] [--limit N]
输出: JSON 格式的财务数据
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import get_client, resolve_ts_code


def main():
    parser = argparse.ArgumentParser(description="查询财务数据")
    parser.add_argument("code", help="股票代码，如 600519")
    parser.add_argument("--type", default="indicator",
                        choices=["income", "balance", "cashflow", "indicator"],
                        help="数据类型: income(利润表), balance(资产负债表), cashflow(现金流量表), indicator(财务指标)")
    parser.add_argument("--period", default=None, help="报告期，格式 YYYYMMDD，如 20251231")
    parser.add_argument("--limit", type=int, default=4, help="返回期数，默认4")
    args = parser.parse_args()

    ts_code = resolve_ts_code(args.code)
    pro = get_client()

    func_map = {
        "income": pro.income,
        "balance": pro.balancesheet,
        "cashflow": pro.cashflow,
        "indicator": pro.fina_indicator,
    }
    func = func_map[args.type]

    kwargs = {"ts_code": ts_code}
    if args.period:
        kwargs["period"] = args.period

    try:
        df = func(**kwargs)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if df is None or df.empty:
        print(json.dumps({"error": f"未找到 {ts_code} 的财务数据"}, ensure_ascii=False))
        sys.exit(1)

    # 按报告期降序，取最近 N 期
    if "end_date" in df.columns:
        df = df.sort_values("end_date", ascending=False).head(args.limit)
    else:
        df = df.head(args.limit)

    # 过滤掉全为 NaN 的列
    df = df.dropna(axis=1, how="all")

    records = df.to_dict("records")
    # 清理 NaN
    clean_records = []
    for rec in records:
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "item"):
                v = v.item()
            if v != v:  # NaN
                continue
            clean[k] = v
        clean_records.append(clean)

    result = {
        "ts_code": ts_code,
        "type": args.type,
        "count": len(clean_records),
        "data": clean_records,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
