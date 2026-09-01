# -*- coding: utf-8 -*-
"""数据源抽象基类 + 统一 schema 规范。

所有数据源必须实现 DataSource.fetch(symbol, start, end)，
返回统一结构的 pandas.DataFrame，列固定为：
    date, open, high, low, close, volume

这样回测引擎和渲染层无需关心数据来自哪家。
"""
import abc
import json
import os
import time
from datetime import datetime

import pandas as pd

# 数据源返回的统一列名（固定顺序）
UNIFIED_COLUMNS = ["date", "open", "high", "low", "close", "volume"]

# 个股信息缓存：默认缓存 7 天（TTL 秒）
DEFAULT_INFO_CACHE_TTL = 7 * 24 * 3600


class DataSourceError(Exception):
    """数据源错误。"""


class DataSource(abc.ABC):
    """数据源抽象基类。新数据源继承此类并实现 fetch()。"""

    name = "base"
    display_name = "Base"

    @abc.abstractmethod
    def fetch(self, symbol: str, start: str, end: str, **kwargs) -> pd.DataFrame:
        """拉取某只股票的日线数据。

        Args:
            symbol: 带市场前缀的代码，如 sh600519 / sz000858
            start/end: ISO 日期 YYYY-MM-DD

        Returns:
            DataFrame，列固定为 UNIFIED_COLUMNS。
        Raises:
            DataSourceError: 数据获取失败。
        """

    def validate(self, df: pd.DataFrame) -> pd.DataFrame:
        """统一校验并规范化返回数据。子类可调用，保证 schema 一致。"""
        if df is None or df.empty:
            raise DataSourceError(f"[{self.name}] 未获取到数据")
        for col in UNIFIED_COLUMNS:
            if col not in df.columns:
                raise DataSourceError(f"[{self.name}] 返回数据缺少列: {col}")
        df = df[UNIFIED_COLUMNS].copy()
        df["date"] = pd.to_datetime(df["date"])
        for col in UNIFIED_COLUMNS[1:]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna(subset=["close"]).sort_values("date").reset_index(drop=True)
        return df

    def get_stock_info(self, symbol: str) -> dict:
        """获取个股基本信息（名称/行业/板块等）。返回统一 dict。

        子类可覆盖；未实现时返回空 dict（不影响回测功能）。
        约定返回字段: name, industry, region, concepts, pe, price, change_pct
        """
        return {}

    # ---- 个股信息缓存（通用，子类复用）----
    @staticmethod
    def _cache_dir():
        """缓存目录：优先 skill 根下 .cache，回退当前目录。"""
        # core/data_source/base.py -> 上溯到 skill 根 (quant-backtest)
        here = os.path.dirname(os.path.abspath(__file__))
        skill_root = os.path.abspath(os.path.join(here, "..", ".."))
        cache_dir = os.path.join(skill_root, ".cache")
        try:
            os.makedirs(cache_dir, exist_ok=True)
            return cache_dir
        except Exception:  # noqa: BLE001
            return os.getcwd()

    @classmethod
    def _cache_path(cls, symbol: str):
        safe = symbol.replace("/", "_").replace(":", "_")
        return os.path.join(cls._cache_dir(), f"stock_info_{safe}.json")

    @classmethod
    def _read_info_cache(cls, symbol: str) -> dict:
        """读缓存；未命中或过期返回空 dict。"""
        path = cls._cache_path(symbol)
        try:
            with open(path, "r", encoding="utf-8") as f:
                rec = json.load(f)
            if time.time() - rec.get("ts", 0) < DEFAULT_INFO_CACHE_TTL:
                return rec.get("info", {})
        except Exception:  # noqa: BLE001
            pass
        return {}

    @classmethod
    def _write_info_cache(cls, symbol: str, info: dict):
        """写缓存（带时间戳）。"""
        path = cls._cache_path(symbol)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"ts": time.time(), "info": info}, f, ensure_ascii=False)
        except Exception:  # noqa: BLE001
            pass

    def __repr__(self):
        return f"<DataSource {self.name}>"
