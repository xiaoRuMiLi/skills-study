"""
查询实时行情/最新报价
用法: python realtime_quote.py <股票代码> [股票代码2 ...]
输出: JSON 格式的实时行情数据
说明: 使用 tushare 的实时行情接口，交易时段返回实时数据，非交易时段返回最近收盘数据
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ts_client import resolve_ts_code
import tushare as ts


def get_realtime(codes: list) -> list:
    """获取实时行情，支持多个代码"""
    results = []
    for code in codes:
        ts_code = resolve_ts_code(code)
        try:
            # tushare 实时行情
            df = ts.realtime_quote(ts_code=ts_code)
            if df is not None and not df.empty:
                row = df.iloc[0].to_dict()
                # 转换 numpy 类型为 Python 原生类型
                clean = {}
                for k, v in row.items():
                    if hasattr(v, "item"):
                        clean[k] = v.item()
                    else:
                        clean[k] = v
                results.append(clean)
            else:
                results.append({"ts_code": ts_code, "error": "无数据"})
        except Exception as e:
            results.append({"ts_code": ts_code, "error": str(e)})
    return results


def main():
    parser = argparse.ArgumentParser(description="查询实时行情")
    parser.add_argument("codes", nargs="+", help="股票代码，可多个，如 600519 000001.SZ")
    args = parser.parse_args()

    results = get_realtime(args.codes)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
