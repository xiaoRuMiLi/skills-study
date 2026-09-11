'use strict';
const path = require('path');
const { bootstrap } = require('../../core/bootstrap');
(async () => {
  const app = bootstrap().app;
  const f = path.join(__dirname, 'out', 'final-design-12659-v1-chest.jpg');
  const up = await app.make('gallery').upload({ image: f, cn_name: 'FINAL-12659', en_name: 'FINAL-12659' });
  console.log('upload 返回:', JSON.stringify(up).slice(0, 600));
})();
