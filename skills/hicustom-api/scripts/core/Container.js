'use strict';
/**
 * Container.js — 依赖注入容器（Laravel 风）。
 * bind(工厂) 每次 new；singleton(工厂) 只实例化一次；instance(预置实例)。
 * 工厂接收容器本身，可 make 出其它依赖，实现装配，避免硬 new。
 */
class Container {
  constructor() {
    this.bindings = new Map();
    this.instances = new Map();
  }
  bind(name, factory) { this.bindings.set(name, { factory, singleton: false }); }
  singleton(name, factory) { this.bindings.set(name, { factory, singleton: true }); }
  instance(name, value) { this.instances.set(name, value); }
  bound(name) { return this.bindings.has(name) || this.instances.has(name); }
  make(name) {
    if (this.instances.has(name)) return this.instances.get(name);
    const b = this.bindings.get(name);
    if (!b) throw new Error('未绑定到容器: ' + name);
    const obj = b.factory(this);
    if (b.singleton) this.instances.set(name, obj);
    return obj;
  }
}
module.exports = { Container };
