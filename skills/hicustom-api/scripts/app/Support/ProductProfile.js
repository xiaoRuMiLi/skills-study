'use strict';
/**
 * ProductProfile.js — 把「空白产品详情」原始 JSON 解析成结构化「产品画像」。
 * 画像用于：上架文案素材、图片处理尺寸、CSV 报告、HTML 渲染、合成参数。
 */
function parseProduct(raw) {
  const d = raw || {};
  const pd = d.product_description || {};
  const pr = d.prices || {};
  const faces = (pd.print_areas || []).map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height }));
  const colors = (d.colors || []).map((c) => ({
    id: c.id, cnName: c.cn_name || c.name, enName: c.en_name, tone1: c.tone1, tone2: c.tone2,
  }));
  // 商品尺寸（宽/高 cm）——来自 size_attr_map + size_attr_info
  const dimMap = {};
  (d.size_attr_map || []).forEach((m) => { dimMap[m.id] = m.cn_name || m.name; });
  const dimsOf = {};
  (d.size_attr_info || []).forEach((i) => {
    const k = dimsOf[i.size_id] || (dimsOf[i.size_id] = {});
    const label = dimMap[i.attr_id];
    const num = (String(i.attr_value || '').match(/[\d.]+/) || [])[0];
    if (label && num) k[label] = Number(num);
  });
  const sizes = (d.sizes || []).map((s) => ({
    id: s.id, name: s.name,
    width: (dimsOf[s.id] && dimsOf[s.id].宽度) || (dimsOf[s.id] && dimsOf[s.id].Width) || null,
    height: (dimsOf[s.id] && dimsOf[s.id].高度) || (dimsOf[s.id] && dimsOf[s.id].Height) || null,
  }));
  const variants = (d.stock_info || []).map((v) => ({
    id: v.id, code: v.code, colorId: v.color_id, sizeId: v.size_id,
    length: v.length, width: v.width, height: v.height, volume: v.volume, weight: v.weight,
  }));

  // 每档批发价（retail/gold/platinum/diamond/black_diamond/star_diamond）
  const tiers = (pr.wholesale_price || []).map((w) => ({
    stockInfo: (w.stock_info || []).map((s) => ({ id: s.id, colorId: s.color_id, colorName: s.color_name, sizeId: s.size_id, sizeName: s.size_name })),
    retail: w.retail_price, gold: w.gold, platinum: w.platinum, diamond: w.diamond,
    blackDiamond: w.black_diamond, starDiamond: w.star_diamond,
  }));

  const images = {
    renderings: (d.renderings_info || []).map((r) => ({ colorId: r.colors && r.colors.id, colorName: r.colors && r.colors.color_name, renderings: r.renderings || [] })),
    detailImg: d.detail_img || [],
  };

  return {
    meta: { parsedAt: new Date().toISOString(), hotStars: d.hot_stars, timeliness: d.product_timeliness || {} },
    identity: {
      id: d.id, spuCode: d.spu_code, cnName: d.cn_name, enName: d.en_name, alias: d.alias_name,
      factory: d.factory_name, releaseTime: d.release_time,
    },
    attributes: {
      technology: d.product_technology,
      materialCn: pd.product_material && pd.product_material.cn_name,
      materialEn: pd.product_material && pd.product_material.en_name,
      description: pd.detail_info_desc,
      designStyle: pd.design_style ? { recommendStyle: pd.design_style.recommend_style, themeElement: pd.design_style.theme_element } : {},
      materialExplain: (pd.material_explain || []).map((m) => ({ title: m.title, value: m.value })),
      productFeatures: (pd.product_features || []).map((m) => ({ title: m.title, value: m.value })),
    },
    designFaces: faces,
    colors, sizes, variants,
    pricing: {
      minPrice: pr.price, defaultColorId: pr.default_color_id, defaultColorName: pr.default_color_name,
      defaultSizeId: pr.default_size_id, defaultSizeName: pr.default_size_name,
      accumulatedQuarter: pr.accumulated_quarter_price, membership: pr.membership_price,
      tiers,
    },
    images,
    specs: buildSpecs({ colors, sizes, variants, pricing: { tiers } }),
  };
}

// 把 变体 + 颜色 + 尺码 + 售价档 合并成「每个规格一个对象」的 specs[]
// 每个 spec：变体id/code + 颜色 + 尺码 + 包装(长宽高/体积) + 重量 + 各档售价(带数量区间)
function buildSpecs(profile) {
  const colors = profile.colors || [], sizes = profile.sizes || [], variants = profile.variants || [];
  const tiers = (profile.pricing && profile.pricing.tiers) || [];
  return variants.map((v) => {
    const color = colors.find((c) => c.id === v.colorId) || {};
    const size = sizes.find((s) => s.id === v.sizeId) || {};
    const tier = tiers.find((t) => (t.stockInfo || []).some((si) => si.id === v.id)) || {};
    return {
      variantId: v.id, code: v.code,
      colorId: v.colorId, colorName: color.cnName || '',
      sizeId: v.sizeId, sizeName: size.name || '',
      dims: { width: size.width != null ? size.width : null, height: size.height != null ? size.height : null },
      package: { L: v.length, W: v.width, H: v.height, volume: v.volume }, weight: v.weight,
      prices: { retail: tier.retail, gold: tier.gold, platinum: tier.platinum, diamond: tier.diamond, blackDiamond: tier.blackDiamond, starDiamond: tier.starDiamond },
    };
  });
}

// 便捷：取默认（最大或第一个）可设计面，作为图片处理的标准尺寸
function defaultFace(profile) {
  const faces = profile.designFaces || [];
  if (!faces.length) return { id: 1, name: 'A面', width: 1000, height: 1000 };
  return faces.reduce((a, b) => ((a.width * a.height) >= (b.width * b.height) ? a : b));
}

module.exports = { parseProduct, defaultFace, buildSpecs };
