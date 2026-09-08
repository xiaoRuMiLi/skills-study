# HTML 模板说明（可扩展 section 组件化）

`ListingRenderer.render({ profile, customization, options, htmlDir })` 把产品画像渲染成自包含的本地 `index.html`。

## 设计
- **JSON-driven + section 组件化**：页面由一组 section 渲染器按顺序拼装。
- section 渲染器注册在 `SECTIONS` 对象里（`scripts/app/Support/ListingRenderer.js`）。
- 渲染顺序由 `options.sections` 决定（未传则用 `DEFAULT_ORDER`）。

## 内置 section
| key | 内容 |
|-----|------|
| `links` | 顶部入口按钮（商户后台编辑空白商品 / 我的定制商品列表），读 `options.links` |
| `identity` | 商品身份（id/spu/中英名/工厂/发布） |
| `attributes` | 属性（工艺/材质/推荐风格/描述/卖点） |
| `designFaces` | 可设计面（印刷区尺寸表） |
| `pricing` | 售价（最低价 + 各档批发价） |
| `variants` | 规格变体（包装/重量表） |
| `images` | 默认效果图 / 细节图 |
| `customization` | 本流程产出（图库编码/合成产品码/效果图） |
| `report` | 报表（CSV 路径） |

## 如何扩展新功能
1. 在 `SECTIONS` 里新增一个 `key(p, c, opts)` 渲染函数，返回 HTML 字符串；
2. 把该 key 加进 `options.sections` 数组（或 `DEFAULT_ORDER`）。

示例：
```js
SECTIONS.order = (p, c) => '<h2 class="sec-title">订单</h2>' + '<p>' + (c.orderId || '未同步') + '</p>';
// 调用时 options.sections = ['identity','images','order']
```

## 输出
- `htmlDir` 传路径时，写出 `<htmlDir>/index.html` 并返回该路径。
- 引用图片：远程效果图用完整 URL；本地处理图在 `images/` 相对路径。
