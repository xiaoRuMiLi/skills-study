# -*- coding: utf-8 -*-
"""quant-backtest 核心库。

模块结构:
    core.config       — 统一配置（交易成本/市场规则/默认参数，支持环境变量覆盖）
    core.data_source  — 数据源工厂（可扩展，统一 schema）
    core.strategy     — 策略包（可扩展，自动发现，signal 契约统一）
    core.engine       — 回测执行器（真实 A 股规则）
    core.metrics      — 绩效指标计算
    core.render       — ECharts K线 HTML 渲染（买卖箭头/净值/成交量）
"""
from . import config, data_source, strategy, engine, metrics, render  # noqa: F401

__all__ = ["config", "data_source", "strategy", "engine", "metrics", "render"]
