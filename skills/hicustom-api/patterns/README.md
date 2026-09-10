# patterns/（图案库）

design 流程里「选择图案」的**图案图源**（非排版样稿）。

- 放**可平铺/可印花的图案图**（png/jpg/jpeg/webp）。
- 页面 `design.html` 通过 `GET /api/patterns` 列出本目录（以及 `input/<id>/`）。
- 与 `type-setting-images/`（**排版样稿**，只用于解析文字排版）区分：这里是**图案素材**。
- 文件可任意命名；建议 `主题-风格.jpg`（如 `floral-boho.jpg`）。
