'use strict';
/**
 * AppServiceProvider.js — 集中注册绑定（Laravel 式）。
 * 组装：tokenManager(<-> rawHttp) / http(业务客户端) / gallery(图库服务)。
 * 依赖环处理：tokenManager 用 "rawHttp"(auth=false) 调用鉴权端点，避免回环。
 */
const { ServiceProvider } = require('../../core/ServiceProvider');
const { HttpClient } = require('../Http/HttpClient');
const { TokenManager } = require('../Auth/TokenManager');
const { GalleryService } = require('../Services/GalleryService');
const { ProductService } = require('../Services/ProductService');
const { DesignService } = require('../Services/DesignService');
const { OrderService } = require('../Services/OrderService');
const { TradeService } = require('../Services/TradeService');
const { ShippingService } = require('../Services/ShippingService');
const { ProductRepository } = require('../Support/ProductRepository');
const { ZhipuService } = require('../Services/ZhipuService');
const { ZhipuClient } = require('../Services/ZhipuClient');
const { PatternService } = require('../Services/PatternService');

class AppServiceProvider extends ServiceProvider {
  register(app) {
    // rawHttp：仅用于 token/refresh（auth=false，不需要 access_token 本身）
    app.singleton('rawHttp', (a) => {
      const config = a.make('config');
      return new HttpClient(config, { accessToken: async () => { throw new Error('rawHttp 不可用于业务调用'); } });
    });
    app.singleton('tokenManager', (a) => new TokenManager(a.make('config'), a.make('rawHttp')));
    // 业务 http：注入 tokenManager 自动加 access_token
    app.singleton('http', (a) => new HttpClient(a.make('config'), a.make('tokenManager')));
    // 业务服务
    app.singleton('gallery', (a) => new GalleryService(a.make('http')));
    app.singleton('product', (a) => new ProductService(a.make('http')));
    app.singleton('design', (a) => new DesignService(a.make('http')));
    app.singleton('order', (a) => new OrderService(a.make('http')));
    app.singleton('trade', (a) => new TradeService(a.make('http')));
    app.singleton('shipping', (a) => new ShippingService(a.make('config')));
    // CSV 类数据库仓储
    app.singleton('productRepo', (a) => new ProductRepository(a.make('config')));
    // 智谱 AI（文生图 + 图片理解）
    app.singleton('zhipu', (a) => new ZhipuService(a.make('config')));
    // 图案生成（AI 文生图 → 去水印 → input/<id>/）
    app.singleton('pattern', (a) => new PatternService(a.make('config'), a.make('product'), a.make('zhipu')));
    // 智谱统一客户端（文本/视觉/图像；模型名统一从 config.zhipu 读）—— 所有 LLM 调用的唯一入口
    app.singleton('zhipuClient', (a) => new ZhipuClient(a.make('config')));
  }
}

module.exports = { AppServiceProvider };
