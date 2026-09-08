'use strict';
/**
 * ServiceProvider.js — 服务提供者基类（Laravel 风）。
 * register(app): 向容器注册绑定；boot(app): 容器 ready 后的钩子（可选）。
 * 子类实现 register，把服务/单例绑定进容器。
 */
class ServiceProvider {
  constructor(app) { this.app = app; }
  register() { throw new Error('服务提供者必须实现 register(app)'); }
  boot() { /* 可选钩子 */ }
}
module.exports = { ServiceProvider };
