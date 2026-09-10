'use strict';
/**
 * bootstrap.js — 应用引导（Laravel 风 bootstrap）。
 * 组装：Config -> Container -> 注册 Providers -> 注册 Commands -> 返回 { app, router }。
 */
const { Container } = require('./Container');
const { Router } = require('./Router');
const Config = require('./Config');

const PROVIDERS = [require('../app/Providers/AppServiceProvider').AppServiceProvider];
const COMMANDS = [
  require('../app/Console/Commands/TokenCommand').TokenCommand,
  require('../app/Console/Commands/ErrorCommand').ErrorCommand,
  require('../app/Console/Commands/GalleryUploadCommand').GalleryUploadCommand,
  require('../app/Console/Commands/GalleryCategoriesCommand').GalleryCategoriesCommand,
  require('../app/Console/Commands/GalleryBatchCommand').GalleryBatchCommand,
  require('../app/Console/Commands/GalleryListCommand').GalleryListCommand,
  require('../app/Console/Commands/GalleryDetailCommand').GalleryDetailCommand,
  require('../app/Console/Commands/GalleryEditCommand').GalleryEditCommand,
  require('../app/Console/Commands/ProductListCommand').ProductListCommand,
  require('../app/Console/Commands/ProductCategoriesCommand').ProductCategoriesCommand,
  require('../app/Console/Commands/ProductDetailCommand').ProductDetailCommand,
  require('../app/Console/Commands/ProductRemovedCommand').ProductRemovedCommand,
  require('../app/Console/Commands/DesignListCommand').DesignListCommand,
  require('../app/Console/Commands/DesignDetailCommand').DesignDetailCommand,
  require('../app/Console/Commands/DesignPreviewCommand').DesignPreviewCommand,
  require('../app/Console/Commands/DesignCompositeCommand').DesignCompositeCommand,
  require('../app/Console/Commands/ListingGenerateCommand').ListingGenerateCommand,
  require('../app/Console/Commands/DbCommand').DbCommand,
  require('../app/Console/Commands/DesignAreaCommand').DesignAreaCommand,
  require('../app/Console/Commands/OrderCreateCommand').OrderCreateCommand,
  require('../app/Console/Commands/OrderListCommand').OrderListCommand,
  require('../app/Console/Commands/OrderDetailCommand').OrderDetailCommand,
  require('../app/Console/Commands/OrderByOutIdCommand').OrderByOutIdCommand,
  require('../app/Console/Commands/OrderItemProductionCommand').OrderItemProductionCommand,
  require('../app/Console/Commands/TradeListCommand').TradeListCommand,
  require('../app/Console/Commands/ShippingQuoteCommand').ShippingQuoteCommand,
  require('../app/Console/Commands/ShippingBackfillCommand').ShippingBackfillCommand,
  require('../app/Console/Commands/PricingCommand').PricingCommand,
  require('../app/Console/Commands/PricingBackfillCommand').PricingBackfillCommand,
  require('../app/Console/Commands/ListingTranslateCommand').ListingTranslateCommand,
  require('../app/Console/Commands/ListingTableCommand').ListingTableCommand,
  require('../app/Console/Commands/StampCommand').StampCommand,
  require('../app/Console/Commands/SampleListCommand').SampleListCommand,
];

function bootstrap() {
  const config = Config.loadConfig();
  const app = new Container();
  app.instance('config', config);
  app.instance('app', app);

  // 注册服务提供者
  for (const P of PROVIDERS) {
    const provider = new P(app);
    provider.register(app);
  }
  for (const P of PROVIDERS) { const provider = new P(app); provider.boot(app); }

  // 注册命令
  const router = new Router();
  for (const C of COMMANDS) {
    const instance = new C(app);
    router.register(instance.signature, {
      description: instance.description,
      usage: instance.usage,
      run: (opts, rest) => instance.handle(opts, rest),
    });
    // 别名：error:list = error:describe 无 --code 时输出列表
    if (instance.signature === 'error:describe') {
      router.register('error:list', { description: '错误码列表', usage: '[--grep key]', run: (opts) => instance.handle(opts) });
    }
  }

  return { app, router, config };
}

module.exports = { bootstrap };
