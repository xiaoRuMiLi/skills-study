# 产品画像 Schema（product.json 里的 profile 字段）

`ProductProfile.parseProduct(raw)` 把 `product:detail` 的原始 data 解析为结构化画像。存于 `output/<id>/product.json` 的 `profile` 字段。

```jsonc
{
  "meta": { "parsedAt": "ISO时间" },
  "identity": { "id", "spuCode", "cnName", "enName", "alias", "factory", "releaseTime" },
  "attributes": {
    "technology", "materialCn", "materialEn", "description",   // description = detail_info_desc（上架文案素材）
    "designStyle": { "recommendStyle", "themeElement" },
    "materialExplain": [ { "title", "value" } ],
    "productFeatures": [ { "title", "value" } ]
  },
  "designFaces": [ { "id", "name", "width", "height" } ],        // ← 可设计面/印刷区尺寸（处理图片用）
  "colors":   [ { "id", "cnName", "enName", "tone1", "tone2" } ],
  "sizes":    [ { "id", "name" } ],
  "variants": [ { "id", "code", "colorId", "sizeId", "length", "width", "height", "volume", "weight" } ],  // 包装/重量
  "pricing": {
    "minPrice", "defaultColorId", "defaultColorName", "defaultSizeId", "defaultSizeName",
    "accumulatedQuarter", "membership",
    "tiers": [ { "stockInfo": [...], "retail", "gold", "platinum", "diamond", "blackDiamond", "starDiamond" } ]
  },
  "images": {
    "renderings": [ { "colorId", "colorName", "renderings": ["url"] } ],
    "detailImg": [ "url" ]
  }
}
```

## 关键字段用途
- `designFaces` → 决定每张图处理的 targetW/targetH（cover 填满）。
- `variants` → 上架规格、包装长宽高、重量、FBA 装箱。
- `pricing.tiers` → 不同数量档售价（零售/黄金/铂金/钻石/黑钻/星钻）。
- `attributes.description` / `productFeatures` / `materialExplain` → 生成上架文案。
- `images.renderings` / `detailImg` → 默认效果图/细节图（可作 listing 副图）。

## 辅助
- `defaultFace(profile)` → 取最大的可设计面（作为默认图片尺寸）。
