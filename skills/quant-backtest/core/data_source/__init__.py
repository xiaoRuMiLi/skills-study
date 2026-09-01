# -*- coding: utf-8 -*-
"""数据源工厂：通过名称实例化数据源，支持热注册新数据源。

用法:
    from core.data_source import get_datasource, register_datasource
    # 默认内置 sina
    ds = get_datasource("sina")
    df = ds.fetch("sh600519", "2022-06-01", "2026-08-31")

    # 用户可通过 register_datasource 动态接入自定义数据源
    register_datasource("my_src", MyDataSource())
"""
from .base import DataSource, DataSourceError  # noqa: F401
from .sina import SinaDataSource  # noqa: F401

# 内置数据源注册表
_REGISTRY = {}


def _register_builtin():
    if SinaDataSource.name not in _REGISTRY:
        _REGISTRY[SinaDataSource.name] = SinaDataSource()


def register_datasource(name: str, instance: DataSource):
    """注册/覆盖一个数据源实例。用户新增数据源时调用。
    注意: 需在获取数据源前调用。
    """
    if not isinstance(instance, DataSource):
        raise TypeError("instance 必须是 DataSource 子类实例")
    _REGISTRY[name] = instance


def get_datasource(name: str = "sina") -> DataSource:
    """按名称获取数据源实例。若未注册则报错。"""
    _register_builtin()  # 确保内置已注入
    if name not in _REGISTRY:
        raise DataSourceError(f"未注册的数据源: {name}（可选: {list(_REGISTRY)}）")
    return _REGISTRY[name]


def list_datasources():
    _register_builtin()
    return {k: v.display_name for k, v in _REGISTRY.items()}
