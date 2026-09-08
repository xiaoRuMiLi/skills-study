'use strict';
/**
 * TokenCommand — token:get
 * 获取/刷新 access_token（自动：缓存有效则复用，否则 refresh，再 fetch）。
 * 安全：只打印状态与有效期，绝不明文输出 access_token。
 */
const fs = require('fs');

class TokenCommand {
  constructor(app) { this.app = app; this.signature = 'token:get'; this.description = '获取/刷新 access_token（不打印明文）'; this.usage = ''; }
  async handle() {
    const t = this.app.make('tokenManager');
    const config = this.app.make('config');
    console.log('========== token:get ==========');
    try {
      const token = await t.accessToken();
      const s = t.status();
      console.log('✅ 已取得 access_token');
      console.log('  有效期剩余(s): ' + s.expiresIn);
      console.log('  持有 refresh_token: ' + (s.hasRefresh ? '是' : '否'));
      console.log('  缓存文件: ' + config.tokenCachePath);
    } catch (e) {
      console.log('❌ 获取 access_token 失败: ' + e.message);
      console.log('\n请在 .env 填 HICUSTOM_APP_KEY + HICUSTOM_APP_SECRET（首次），或 HICUSTOM_REFRESH_TOKEN（刷新）。');
      process.exitCode = 1;
    }
  }
}
module.exports = { TokenCommand };
