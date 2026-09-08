# 设计器 SDK 对接（前端 iframe）

当需要让用户在浏览器里「设计」产品（而非后端自动合成）时，嵌入 hicustom 设计器 SDK。

## 引用代码（iframe 嵌入）
```html
<iframe id="zw-sdk" src="https://zwstatic.hicustom.com/static/sdk.html?customer_code=<用户ID>&store_id=<店铺ID>&origin=<真实域名>&t=<timestamp>" style="width:100%;height:100%"></iframe>
```
- `origin` **必须替换成当前页真实可访问域名**（zwstatic 会校验，未登记可能不初始化）。
- 可在 URL 追加参数快速引用指定数据：
  - `external_customer_id`：自定义会员编码（区分"我的图片"）
  - `product_type_id`：空白产品 id（打开即指定产品）
  - `gallery_code`：图片编码（引用 1 张图到设计区，仅专业版）
  - `template_code`：设计模板编码
  - `product_code`：定制产品编码（引用 1 个定制产品，仅专业版）

## 事件（window.message）
| type | 说明 |
|------|------|
| `ZW_INIT` | 初始化完成。可 postMessage `SET_GALLERY_SEARCH_DATA` / `LOGIN` |
| `LOGIN` | 登录（在 ZW_INIT 之后调用），参数 `external_customer_id` |
| `ZW_LOGIN` | 登录成功回调 |
| `ZW_ADD_SHOP_CAR` | 加入购物车 → 返回定制产品数据（`product_code`/`stock_item_infos[].image_url`/`cfg[].gallery_code`）|
| `ZW_PRODUCT_SAVE` | 保存产品回调 |
| `ZW_BUY_NOW` | 立即购买回调 |

## 示例（初始化 + 登录 + 捕获加购数据）
```js
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'ZW_INIT') {
    const gw = document.querySelector('#zw-sdk');
    gw.contentWindow.postMessage({ type: 'SET_GALLERY_SEARCH_DATA', data: {} }, 'https://zwstatic.hicustom.com');
    gw.contentWindow.postMessage({ type: 'LOGIN', external_customer_id: 'V1P102' }, 'https://www.hicustom.com');
  } else if (d.type === 'ZW_ADD_SHOP_CAR') {
    console.log(d.data); // 定制产品数据，含效果图 image_url
  }
});
```

> 配套本地 demo 页面：`imgtool/designer-demo.html`（可直接在浏览器打开看事件日志）。
> 拿到 `ZW_ADD_SHOP_CAR` 的定制产品数据后，可再走 `order:create` 同步订单到指纹 ERP。
