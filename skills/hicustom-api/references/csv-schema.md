# CSV 报告 Schema（product.csv 列定义）

`CsvReport.writeCsv(file, profile, customization, meta)` 输出带 BOM 的 CSV（Excel 无乱码）。

## 列
| 列 | 说明 |
|----|------|
| `product_id` | 空白产品 id |
| `spu_code` | SPU 编码 |
| `cn_name` / `en_name` / `alias` | 中/英名 / 别名 |
| `factory` | 工厂 |
| `technology` | 生产工艺 |
| `material` | 材质 |
| `min_price` | 最低单价（1件） |
| `default_color` / `default_size` | 默认颜色 / 尺码 |
| `design_face_w` / `design_face_h` | 印刷区宽/高（px） |
| `design_face_count` | 可设计面数 |
| `variants_count` | 变体数 |
| `colors` / `sizes` | 颜色 / 尺码（/ 分隔） |
| `package_L_cm` / `package_W_cm` / `package_H_cm` | 包装长宽高（第一个变体） |
| `volume_cm3` / `weight_g` | 包装体积 / 重量 |
| `gallery_codes` | 已上传图库的图码（\| 分隔） |
| `composite_product_code` | 合成后的定制产品码 |
| `effect_image_count` | 合成效果图数量 |
| `effect_image_urls` | 效果图 URL（\| 分隔） |
| `detail_img_count` | 细节图数量 |
| `release_time` | 发布时间 |
| `generated_at` | 生成时间 |

> 建议：用 Excel / WPS 打开，作为选品、对上架、溯源参考。
