'use strict';
// @ts-nocheck
/**
 * registry.js — 模块注册表（工厂模式核心）。
 * 一个模块 = 一个工厂 (ctx) => moduleDef。注册后由 createApp 统一「注入依赖并实例化」。
 * 新增模块只需：写 modules/<name>.js 的工厂 + 在 app.js 注册一行。核心零改动（开闭原则）。
 */
class ModuleRegistry {
  constructor() { this.modules = new Map(); }

  // 注册：name(小写)，factory = (ctx) => moduleDef
  register(name, factory) {
    if (this.modules.has(name)) throw new Error('模块已注册: ' + name);
    this.modules.set(name, factory);
  }

  // 依赖注入并实例化全部模块；返回 { name: moduleDef }
  create(ctx) {
    const out = {};
    for (const [name, factory] of this.modules) out[name] = factory(ctx);
    return out;
  }

  list() { return [...this.modules.keys()]; }
}

module.exports = { ModuleRegistry };
