'use strict';
// @ts-nocheck
/**
 * messaging — 买家消息（Messaging API，官方）。
 *   getMessagingActionsForOrder : 查某订单可用的消息类型（GET /messaging/v1/orders/{amazonOrderId}）
 *   send(按类型)                : 发送特定类型消息（如 sendInvoice/createConfirmOrderDetails，POST）
 * 合规注意：Messaging API 无通用 sendMessage，而是"消息类型专用"端点。
 *   多数发送操作是【受限操作】，需要 Restricted Data Token (RDT)（Tokens API 额外换取，涉及 PII）
 *   且需买家许可；纯营销消息被亚马逊禁止。受限操作需额外安全审核。
 */
module.exports = function createMessagingModule(ctx) {
  const { callOp, env, format } = ctx;
  const { hr } = format;

  const ACTIONS_OP = 'getMessagingActionsForOrder';

  async function actions(opts) {
    hr('订单可用消息类型 (getMessagingActionsForOrder)');
    const orderId = opts.orderId || opts.id;
    const mp = opts.marketplace || env.marketplace();
    if (!orderId || !mp) { console.log('需要 --orderId <id> --marketplace <X>。'); return; }
    const r = await callOp(ACTIONS_OP, { pathParams: { amazonOrderId: orderId }, query: { marketplaceIds: mp } });
    const payload = ctx.unwrap(r.data);
    const list = payload.actions || [];
    console.log('订单 ' + orderId + ' 可用消息类型 ' + list.length + ' 种：');
    for (const a of list) {
      const msg = (a.embeddedType || a.name || 'N/A');
      console.log('  - ' + msg + '    (uri: ' + (a.path || a.uri || '?') + ')');
    }
    console.log('\n⚠️ 若查看受限操作列表（涉及买家 PII）可能需 Restricted Data Token (RDT)。');
  }

  async function send(opts) {
    hr('发送买家消息 (Messaging 按类型)');
    const orderId = opts.orderId || opts.id;
    const mp = opts.marketplace || env.marketplace();
    const type = opts.type;                          // 如 sendInvoice / createConfirmOrderDetails
    const bodyJson = opts.body;                      // --body '{"text":"..."}'
    if (!orderId || !mp || !type) { console.log('需要 --orderId <id> --marketplace <X> --type <opId> [--body <json>]。'); return; }
    // 消息类型专用端点：opId 即 sendInvoice 等；body 按该消息类型的 schema
    let body = null;
    if (bodyJson) { try { body = JSON.parse(bodyJson); } catch (e) { console.log('--body 不是合法 JSON。'); return; } }
    const r = await callOp(type, { pathParams: { amazonOrderId: orderId }, query: { marketplaceIds: mp }, body });
    console.log('消息类型 ' + type + ' -> HTTP ' + r.status + (r.status < 300 ? ' 已发送' : ' 失败'));
    if (r.status >= 400) console.log(JSON.stringify(r.data, null, 2).slice(0, 1200));
    else console.log(JSON.stringify(ctx.unwrap(r.data), null, 2).slice(0, 800));
    console.log('\n⚠️ 受限消息操作需 RDT + 买家许可，且禁纯营销；请按官方 Messaging 规范执行。');
  }

  async function types() {
    hr('可用的消息类型 opId（来自本地规范）');
    const list = ['getMessagingActionsForOrder', 'sendInvoice', 'createConfirmOrderDetails', 'createConfirmDeliveryDetails', 'createDigitalAccessKey', 'createLegalDisclosure', 'confirmCustomizationDetails', 'createUnexpectedProblem', 'CreateWarranty', 'GetAttributes', 'createConfirmServiceDetails'];
    console.log(list.join('\n'));
    console.log('\n精确校验用 `system spec "<opId>"`；多数发送操作需 RDT。');
  }

  return {
    name: 'messaging',
    title: '买家消息',
    describe: 'Messaging：查可用消息类型 / 按类型发送',
    commands: {
      actions: { usage: '--orderId <id> --marketplace X', run: actions },
      send: { usage: '--orderId <id> --marketplace X --type <opId> [--body <json>]', run: send },
      types: { usage: '', run: types },
    },
  };
};
