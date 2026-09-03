'use strict';
// @ts-nocheck
/**
 * errors.js — 统一错误类型。让业务层能用结构化方式处理/上报。
 */
class CliError extends Error {
  constructor(message, { code = 'CLI_ERROR' } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

// 规范中找不到操作
class NotFoundError extends CliError {
  constructor(opId) {
    super(`规范中未找到操作: ${opId}。用 \`list-ops\` 查可用 operationId，不要猜测。`, { code: 'NOT_FOUND' });
    this.name = 'NotFoundError';
    this.opId = opId;
  }
}

module.exports = { CliError, NotFoundError };
