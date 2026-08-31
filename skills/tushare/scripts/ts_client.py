"""
Tushare 公共客户端模块
用法: from ts_client import get_client, resolve_ts_code
"""
import os
import sys
import tushare as ts

_client = None


def get_client():
    """获取 tushare pro 客户端，优先从环境变量读取 token"""
    global _client
    if _client is None:
        token = os.environ.get("TUSHARE_TOKEN", "")
        if not token:
            print("错误: 请设置环境变量 TUSHARE_TOKEN", file=sys.stderr)
            sys.exit(1)
        ts.set_token(token)
        _client = ts.pro_api()
    return _client


def resolve_ts_code(code: str) -> str:
    """
    将用户输入的股票代码标准化为 tushare 格式。
    支持输入: 600519, 600519.SH, 000001.SZ, sh600519, sz000001
    输出: 600519.SH / 000001.SZ
    """
    code = code.strip().upper()
    # 已经是标准格式
    if "." in code and len(code) == 9:
        return code
    # 处理 sh/sz 前缀
    if code.startswith("SH"):
        return code[2:] + ".SH"
    if code.startswith("SZ"):
        return code[2:] + ".SZ"
    if code.startswith("BJ"):
        return code[2:] + ".BJ"
    # 纯数字，根据规则判断交易所
    if code.isdigit():
        if code.startswith(("6", "9")):
            return code + ".SH"
        elif code.startswith(("0", "2", "3")):
            return code + ".SZ"
        elif code.startswith(("4", "8")):
            return code + ".BJ"
    return code


def resolve_index_code(code: str) -> str:
    """
    将常见指数名称/代码标准化为 tushare 格式。
    """
    INDEX_MAP = {
        "上证指数": "000001.SH",
        "上证": "000001.SH",
        "深证成指": "399001.SZ",
        "深成指": "399001.SZ",
        "沪深300": "000300.SH",
        "HS300": "000300.SH",
        "创业板指": "399006.SZ",
        "创业板": "399006.SZ",
        "中证500": "000905.SH",
        "中证1000": "000852.SH",
        "科创50": "000688.SH",
        "上证50": "000016.SH",
    }
    code = code.strip()
    if code in INDEX_MAP:
        return INDEX_MAP[code]
    # 已经是标准格式
    if "." in code:
        return code.upper()
    # 纯数字
    if code.isdigit():
        if code.startswith("0"):
            return code + ".SH"
        elif code.startswith("3"):
            return code + ".SZ"
    return code


if __name__ == "__main__":
    # 测试连接
    pro = get_client()
    df = pro.trade_cal(exchange="SSE", start_date="20260101", end_date="20260105")
    print("Tushare 连接成功!")
    print(df.head())
