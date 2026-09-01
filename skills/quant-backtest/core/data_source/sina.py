# -*- coding: utf-8 -*-
"""新浪财经公开行情数据源（默认，零依赖，仅标准库）。"""
import json
import re
import urllib.request

import pandas as pd

from .base import DataSource, DataSourceError

HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn"}
BASE_URL = (
    "https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_=/CN_MarketDataService"
    ".getKLineData?symbol={symbol}&scale={scale}&ma=no&datalen={datalen}"
)


class SinaDataSource(DataSource):
    """新浪财经接口，日线免费，无需 API key。"""

    name = "sina"
    display_name = "新浪财经（公开，零依赖）"

    def __init__(self, max_len: int = 1023, scale: int = 240):
        self.max_len = max_len
        self.scale = scale  # 240 = 日线

    def fetch(self, symbol: str, start: str, end: str, max_len: int = None, **kwargs) -> pd.DataFrame:
        max_len = max_len or self.max_len
        url = BASE_URL.format(symbol=symbol, scale=self.scale, datalen=max_len)
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            raw = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            raise DataSourceError(f"[sina] 网络请求失败: {e}") from e
        m = re.search(r"\((\[.*\])\)", raw, re.S)
        if not m:
            raise DataSourceError("[sina] 接口返回结构异常，无法解析")
        arr = json.loads(m.group(1))
        if not arr:
            raise DataSourceError(f"[sina] 未获取到 {symbol} 数据")

        df = pd.DataFrame(arr)
        df = df.rename(
            columns={"day": "date", "open": "open", "high": "high",
                     "low": "low", "close": "close", "volume": "volume"}
        )
        df["date"] = pd.to_datetime(df["date"])
        if start:
            df = df[df["date"] >= pd.to_datetime(start)]
        if end:
            df = df[df["date"] <= pd.to_datetime(end)]
        return self.validate(df)

    def get_stock_info(self, symbol: str) -> dict:
        """获取个股基本信息（带本地缓存）。

        名称/最新价/涨跌：来自新浪 hq（稳定必得）。
        行业/概念/PE：尝试东方财富接口（可选，缓存 7 天，避免频繁请求）。
        """
        # 命中缓存直接返回
        cached = self._read_info_cache(symbol)
        if cached:
            return cached

        info = {}
        code = re.sub(r"^(sh|sz|bj)", "", symbol.lower())

        # ---- 名称 + 最新价 + 涨跌（新浪 hq，必得）----
        try:
            hq_url = f"https://hq.sinajs.cn/list={symbol}"
            req = urllib.request.Request(hq_url, headers=HEADERS)
            raw = urllib.request.urlopen(req, timeout=10).read().decode("gbk", "ignore")
            parts = raw.split('"')[1].split(",")
            if parts and parts[0]:
                info["name"] = parts[0]                       # 名称
                if len(parts) > 3:
                    info["price"] = parts[3]                  # 最新价
                    prev = float(parts[2]) if parts[2] else 0
                    cur = float(parts[3]) if parts[3] else 0
                    if prev:
                        info["change_pct"] = round((cur - prev) / prev * 100, 2)  # 涨跌幅%
        except Exception:  # noqa: BLE001
            pass

        # ---- 行业/概念/PE（东财，可选；失败时保留已有 name/price）----
        try:
            market = "1" if symbol.lower().startswith("sh") else "0"
            em_url = ("https://push2.eastmoney.com/api/qt/stock/get"
                      f"?secid={market}.{code}"
                      "&fields=f57,f58,f127,f128,f129,f162")
            ereq = urllib.request.Request(em_url, headers=HEADERS)
            data = json.loads(urllib.request.urlopen(ereq, timeout=10).read().decode("utf-8", "ignore")).get("data", {})
            if data:
                if data.get("f58"):
                    info["name"] = data["f58"]
                if data.get("f127"):
                    info["industry"] = data["f127"]
                if data.get("f128"):
                    info["region"] = data["f128"]
                if data.get("f129"):
                    info["concepts"] = data["f129"]
                if data.get("f162") not in (None, "-", 0):
                    info["pe"] = data["f162"]
        except Exception:  # noqa: BLE001
            pass

        # 只要拿到了 name 就写缓存（行业可能因东财断连缺失，但缓存住已有信息）
        if info.get("name"):
            self._write_info_cache(symbol, info)

        return info
