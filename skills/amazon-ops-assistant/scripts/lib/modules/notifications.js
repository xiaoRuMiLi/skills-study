'use strict';
// @ts-nocheck
/**
 * notifications — 通知订阅（Notifications API，官方）。
 *   destinations        : 列出目的地
 *   create-destination  : 创建目的地（SQS/SNS/EventBridge，写需 --yes）
 *   subscriptions       : 列出订阅（notificationTypes query）
 *   create-subscription : 创建订阅（path notificationType + body，写需 --yes）
 *   get-subscription    : 查指定类型订阅
 *   delete-subscription : 删除订阅（path notificationType，写需 --yes）
 * create/destination body 遵循官方定义，用 --body-json 传入。
 */
module.exports = function createNotificationsModule(ctx) {
  const { callOp, format } = ctx;
  const { hr } = format;

  function parseBody(json) { try { return json ? JSON.parse(json) : null; } catch (e) { throw new Error('--body-json 不是合法 JSON'); } }

  async function destinations() {
    hr('通知目的地 (getDestinations)');
    const r = await callOp('getDestinations');
    const p = ctx.unwrap(r.data);
    const list = p.destinations || [];
    console.log('目的地 ' + list.length + ' 个:');
    for (const d of list) console.log('  - ' + d.destinationId + '  ' + (d.name || d.destinationId));
  }

  async function createDestination(opts) {
    hr('创建目的地 (createDestination)');
    const body = parseBody(opts.bodyJson);
    if (!body) { console.log('需要 --body-json \'{...官方 CreateDestinationRequest...}\' 与 --yes。'); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('写操作，加 --yes 确认。'); return; }
    const r = await callOp('createDestination', { body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已创建' : '失败'));
    if (r.status < 300) console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1200));
  }

  async function subscriptions(opts) {
    hr('订阅列表 (getSubscriptions)');
    const t = opts.type || opts.notificationType;
    if (!t) { console.log('需要 --type <notificationType>。'); return; }
    const r = await callOp('getSubscriptions', { query: { notificationTypes: t } });
    const p = ctx.unwrap(r.data);
    const list = p.subscriptions || [];
    console.log('类型 ' + t + ' 订阅 ' + list.length + ' 条:');
    for (const s of list) console.log('  - ' + s.subscriptionId + '  dest=' + s.destinationId);
  }

  async function createSubscription(opts) {
    hr('创建订阅 (createSubscription)');
    const t = opts.type || opts.notificationType;
    const body = parseBody(opts.bodyJson);
    if (!t || !body) { console.log('需要 --type <notificationType> --body-json <CreateSubscriptionRequest> --yes。'); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('写操作，加 --yes 确认。'); return; }
    const r = await callOp('createSubscription', { pathParams: { notificationType: t }, body });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已订阅' : '失败'));
    if (r.status < 300) console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1200));
  }

  async function getSubscription(opts) {
    hr('查订阅 (getSubscription)');
    const t = opts.type || opts.notificationType;
    if (!t) { console.log('需要 --type <notificationType>。'); return; }
    const r = await callOp('getSubscription', { pathParams: { notificationType: t } });
    console.log('HTTP ' + r.status);
    console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 1500));
  }

  async function deleteSubscription(opts) {
    hr('删除订阅 (deleteSubscription)');
    const t = opts.type || opts.notificationType;
    if (!t) { console.log('需要 --type <notificationType>。'); return; }
    if (opts.yes !== true && opts.yes !== 'true') { console.log('写操作，加 --yes 确认。'); return; }
    const r = await callOp('deleteSubscription', { pathParams: { notificationType: t } });
    console.log('HTTP ' + r.status + ' -> ' + (r.status < 300 ? '已删除' : '失败'));
  }

  return {
    name: 'notifications',
    title: '通知订阅',
    describe: 'Notifications：目的地 / 订阅管理',
    commands: {
      destinations: { usage: '', run: destinations },
      'create-destination': { usage: '--body-json <json> --yes', run: createDestination },
      subscriptions: { usage: '--type <notificationType>', run: subscriptions },
      'create-subscription': { usage: '--type <notificationType> --body-json <json> --yes', run: createSubscription },
      'get-subscription': { usage: '--type <notificationType>', run: getSubscription },
      'delete-subscription': { usage: '--type <notificationType> --yes', run: deleteSubscription },
    },
  };
};
