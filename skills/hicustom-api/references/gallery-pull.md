# 拉取「图库 / 图库收藏」图片原图（gallery:pull）

> 用途：把商家后台 **我的图库 / 图库收藏**（花瓣素材等图案）**原图**拉到本地，供 design-area / listing 等流程当设计源图。
> 鉴权：`.env` 的 `HICUSTOM_MERCHANT_COOKIE`（同 `shipping:quote`，商家后台 cookie，非开放平台）。

## 命令

```bash
node scripts/hi.js gallery:pull --list                 # 只看收藏夹与数量（不下载）
node scripts/hi.js gallery:pull                       # 拉「图库收藏」全部 → input/gallery-fav/
node scripts/hi.js gallery:pull --ids 98378293,98378385   # 只拉指定图片
node scripts/hi.js gallery:pull --out input/复活节素材     # 指定输出目录
node scripts/hi.js gallery:pull --scope gallery        # 换成「我的图库」（customerGallery/index）
node scripts/hi.js gallery:pull --no-extract --keep-zip    # 只下 ZIP 不解压 / 保留 ZIP
```

| 参数 | 说明 | 默认 |
|---|---|---|
| `--list` | 仅列出收藏夹与图片清单 | — |
| `--ids a,b,c` | 只拉这些图片（图片 id 或 code 均可） | 全部 |
| `--scope category\|gallery` | `category`=图库收藏；`gallery`=我的图库 | `category` |
| `--out <目录>` | 输出目录 | `input/gallery-fav` |
| `--zip <文件>` | ZIP 落地路径 | `.hicustom/gallery-pull.zip` |
| `--no-extract` | 不下解压（只留 ZIP） | 解压 |
| `--keep-zip` | 解压后保留 ZIP | 删除 |
| `--page-size <n>` | 每次取列表条数 | `200` |
| `--timeout <秒>` | 等待导出完成上限 | `180` |

## 内部流程（服务：`app/Services/CustomerGalleryService.js`）

```
① 列：POST /merchant/customerGallery/customerGalleryCategory   form: page / pageSize
       （--scope gallery 时换成 POST /merchant/customerGallery/index）
② 导：POST /merchant/customerGallery/download                  form: ids=a,b,c   → 建导出任务
③ 等：GET  /merchant/platformExportRecord/index                → 轮询到 status=2「已生成」、export_num=张数
④ 取：GET  /merchant/platformExportRecord/download?code=<code>  → ZIP（**原图**）
⑤ 解：tar -xf（Win10 自带 bsdtar；失败回退 PowerShell Expand-Archive）
⑥ 清单：.hicustom/<tag>-manifest.json（id / code / name / 尺寸 / 大小 / ZIP 内文件名 file）
```

## 关键坑 ⚠️

| 坑 | 说明 / 做法 |
|---|---|
| **列表里的 `imageUrl` 只有 500px** | 改尺寸段（`-500-`→`-2000-`）或加 `?style=` 全是 404；**原图只能走导出 ZIP** |
| 分类（收藏夹）计数常为 0 | 该账号图片多落在「未分类」；`cat_id` 传了也常被服务端忽略，实际按全量拉 |
| 导出是**异步任务** | 必须轮询导出记录到 `status=2` 再下载；`file_path` 恒为空，下载地址靠 `code` 拼 |
| ZIP 内文件名 = **图片 id + 扩展名** | 如 `98378293.jpg`；中文标题在 manifest 的 `name` 字段 |
| 导出记录会累积 | 后台「导出记录」页会留记录，介意可自行清理 |
| **超大图** | 花瓣素材有 `14883×21048`（313MP）这类巨图：sharp 默认像素上限会报错；放宽上限又要整张解码（约 `w*h*4` 字节）。`tools/image.js` 已加 **内存护栏**：可用内存不足时给出可执行错误（`IMAGE_TOO_BIG`），避免拖垮机器。本机（7.9GB/可用~1.4GB）解不动该图，**跳过或用别的方法缩小后再用** |

## 拉到哪 / 怎么用

- 默认落到 `input/gallery-fav/`（`config.inputDir` 下）→ 直接可当设计源图：
  ```bash
  node scripts/hi.js design-area:generate --product-id <id> --image "input/gallery-fav/98378293.jpg"
  node scripts/hi.js listing:generate    --product-id <id> --images "edited/<id>/98378293.jpg"
  ```
- 生成 HTML 管理页（可选）：https://docs 见 `flows.md`。
