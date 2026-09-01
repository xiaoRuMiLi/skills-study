# -*- coding: utf-8 -*-
"""策略注册表 + 自动发现（无缝接入自定义策略）。

用法:
    内置/注册的策略通过 get_strategy("ma") 获取。

    用户自定义策略（无缝接入）两种方式:
    1. 代码注册:
        from core.strategy import register_strategy
        register_strategy("my_boll", MyBollStrategy())
    2. 文件自动发现（推荐）:
        在 core/strategy/custom/ 下建一个 .py 文件，定义继承 Strategy 的类，
        模块级定义 STRATEGIES = {"name": Instance()} 或在文件底部调用
        register_strategy。程序启动时自动扫描该目录并加载。
"""
import importlib.util
import os
from pathlib import Path

from .base import Strategy  # noqa: F401
from .builtin import MAStrategy, RSIStrategy, MACDStrategy  # noqa: F401

# 内置策略
_REGISTRY = {
    MAStrategy.name: MAStrategy(),
    RSIStrategy.name: RSIStrategy(),
    MACDStrategy.name: MACDStrategy(),
}

# 自定义策略目录（自动发现）
CUSTOM_DIR = Path(__file__).parent / "custom"


def register_strategy(name: str, instance: Strategy, display_name: str = None):
    """注册/覆盖一个策略。name 用于命令行 --strategy 或 get_strategy 查询。"""
    if not isinstance(instance, Strategy):
        raise TypeError("instance 必须是 Strategy 子类实例")
    instance.name = name
    if display_name:
        instance.display_name = display_name
    _REGISTRY[name] = instance


def _load_custom():
    """扫描 custom/ 目录，自动加载所有策略模块。"""
    if not CUSTOM_DIR.is_dir():
        return
    for py in sorted(CUSTOM_DIR.glob("*.py")):
        if py.name.startswith("_"):
            continue
        mod_name = f"custom_{py.stem}"
        spec = importlib.util.spec_from_file_location(mod_name, py)
        if spec is None or spec.loader is None:
            continue
        try:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            # 若模块定义了 register() 函数则调用，或允许模块内直接调用 register_strategy
            if hasattr(mod, "register"):
                mod.register()
        except Exception as e:  # noqa: BLE001
            # 不因单个自定义策略错误而中断整体
            print(f"[strategy] 加载自定义策略失败 {py.name}: {e}", file=os.sys.stderr)


def get_strategy(name: str) -> Strategy:
    """按名称获取策略实例。若未注册则报错。"""
    _load_custom()
    if name not in _REGISTRY:
        raise ValueError(f"未注册的策略: {name}（可选: {list(_REGISTRY)}）")
    return _REGISTRY[name]


def list_strategies():
    _load_custom()
    return {k: getattr(v, "display_name", v.name) for k, v in _REGISTRY.items()}
