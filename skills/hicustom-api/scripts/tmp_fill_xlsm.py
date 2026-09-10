# -*- coding: utf-8 -*-
# tmp_fill_xlsm.py — 把 record.json 回填到「亚马逊原始模板」并输出可上传的 .xlsx（亚马逊只认 xlsx，不认 xlsm）
# 用法: python scripts/tmp_fill_xlsm.py <productId> [模板路径]
# 产物: output/<id>/listing/listing_filled.xlsx（去掉宏的 Excel 工作簿，可直接上传）
import openpyxl, json, shutil, sys, os

PID = sys.argv[1] if len(sys.argv) > 1 else '12664'
# 亚马逊只认这个原始模板（用户指定）
SRC = sys.argv[2] if len(sys.argv) > 2 else r"D:/Documents/xwechat_files/qq303219462_d02e/msg/file/2026-09/PAJAMAS_TOILET_SEAT (1).xlsm"
BASE = r"C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api/output"
REC = os.path.join(BASE, PID, "listing", "record.json")
OUT = os.path.join(BASE, PID, "listing", "listing_filled.xlsx")   # 上传文件 = .xlsx（不带宏）

if not os.path.exists(SRC):
    print("ERR: 模板不存在:", SRC); sys.exit(1)
if not os.path.exists(REC):
    print("ERR: record.json 不存在:", REC); sys.exit(1)

rec = json.load(open(REC, encoding="utf-8"))
name = ((rec.get("item_name") or "") + " " + (rec.get("model_name") or "")).lower()
is_toilet = any(w in name for w in ["toilet", "seat cover", "lid cover", "tank cover", "toilet lid"])

# 从原始模板(xlsm)读取，keep_vba=False → 去掉宏，保存为 .xlsx（亚马逊接受的工作簿格式）
wb = openpyxl.load_workbook(SRC, keep_vba=False)
ws = wb["Template"]
row = 7

# 由第4行(列标签)建 label -> [列号] 映射（处理重复列：Bullet Point/Other Image URL 等）
label_cols = {}
for c in range(1, ws.max_column + 1):
    lab = ws.cell(row=4, column=c).value
    if lab is None: continue
    lab = str(lab).strip()
    label_cols.setdefault(lab, []).append(c)

def setLabel(label, value, occ=1):
    cols = label_cols.get(label)
    if not cols: return False
    if occ - 1 >= len(cols): return False
    col = cols[occ - 1]
    if value is not None and str(value) != "":
        ws.cell(row=row, column=col).value = str(value)
    return True

def setRaw(col, value):
    if value is not None and str(value) != "":
        ws.cell(row=row, column=col).value = str(value)

# —— 读取模板的 Variation Theme 合法值（命名范围变体：<前缀>variation_theme1.name / variation_theme1.value）——
def read_variation_themes():
    themes = []
    import re
    try:
        dnd = wb.defined_names
        items = dnd.items() if hasattr(dnd, 'items') else []
        for k, v in items:
            name = str(k)
            if 'variation_theme' not in name: continue
            target = str(v.attr_text if hasattr(v, 'attr_text') else v)
            m = re.search(r"'([^']+)'!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?", target)
            if not m: continue   # 跳过公式型命名范围，只取真正的单元格范围
            shname, c1, r1 = m.group(1), m.group(2), int(m.group(3))
            r2 = int(m.group(5)) if m.group(5) else r1
            sh = wb[shname]
            for rr in range(r1, r2 + 1):
                val = sh["%s%d" % (c1, rr)].value
                if val: themes.append(str(val).strip())
            break
    except Exception as e:
        pass
    seen = []
    for t in themes:
        if t not in seen: seen.append(t)
    return seen

# —— 变体主题：优先模板合法值里的 SIZE，其次 COLOR/COLOUR，否则取第一个；无则兜底 ——
def pick_variation_theme():
    themes = read_variation_themes()
    if not themes:
        return "Size/Colour"  # 兜底
    for t in themes:
        if t.upper() == "SIZE": return t
    for t in themes:
        if "SIZE" in t.upper(): return t
    for t in themes:
        if "COLOUR" in t.upper() or "COLOR" in t.upper(): return t
    return themes[0]

# —— 上架必填 + 我们有值的字段（label 定位） ——
setLabel("SKU", rec.get("sku") or ("SKU-" + PID + "-UK"))
setLabel("Product Type", rec.get("product_type"))            # PAJAMAS / TOILET_SEAT（自动识别）
setLabel("Listing Action", "Create or Replace (Full Update)")   # record_action 下拉合法值（原"(Default) Create or Replace"无效）
setLabel("Parentage Level", "Parent")
setLabel("Item Name", rec.get("item_name"))
setLabel("Brand Name", rec.get("brand") or "Generic")
setLabel("Variation Theme Name", pick_variation_theme())   # 变体主题：从模板合法值中挑（模板相关，硬编码会错）
setLabel("Model Number", rec.get("model_number"))
setLabel("Model Name", rec.get("model_name"))
setLabel("Manufacturer", rec.get("manufacturer") or rec.get("brand") or "Generic")
setLabel("Main Image URL", rec.get("main_image_url"))
imgs = rec.get("other_image_urls") or []
for i in range(8):
    setLabel("Other Image URL", imgs[i] if i < len(imgs) else "", occ=i + 1)
setLabel("Product Description", rec.get("product_description"))
bl = rec.get("bullet_point") or []
for i in range(5):
    setLabel("Bullet Point", bl[i] if i < len(bl) else "", occ=i + 1)
setLabel("Generic Keywords", rec.get("generic_keyword"))
setLabel("Material", rec.get("material"), occ=1)
setLabel("Fabric Type", rec.get("fabric_type") or "Polyester")
setLabel("Colour Map", (rec.get("color") or "").split(",")[0].strip() if rec.get("color") else "")
setLabel("Colour", rec.get("color"))
setLabel("Size", rec.get("size"))
setLabel("Country of Origin", "China")                   # 国家全名（dropdown 合法值，非代码 CN）
setLabel("Dangerous Goods Regulations", "Not Applicable") # 非危险品必填下拉值
setLabel("Item Condition", "New")

# 价格/数量/配送（英国站点列）
setLabel("List Price with Tax", rec.get("price"))
setLabel("Quantity (UK, DE, IT)", rec.get("quantity") or "1")
setLabel("Fulfillment Channel Code (UK, DE, IT)", rec.get("fulfillment_channel") or "AMAZON_EU")

# 包裹尺寸/重量（按 label 或兜底列）
pkg = rec.get("package") or {}
if pkg.get("weight"):
    setLabel("Item Package Weight", pkg["weight"])
    setLabel("Item Package Weight Unit", "GRAMS")
# 注意：不要用 setRaw(固定列号, ...) —— 不同类目模板列号不同，会填错位；全部走 label 定位 / DEFAULT_FILL。

# —— 防漏：下拉/枚举类必填项的默认值表（最容易漏的字段；record 里没有就从这里补） ——
# 每个值都必须是模板 dropdown/Valid Values 里的合法值，否则上传报错。
# 注意：Variation Theme Name 不写死，由 pick_variation_theme() 按模板合法值挑。
DEFAULT_FILL = {
    "Country of Origin": "China",                # 用国家全名（不是 CN 代码）
    "Dangerous Goods Regulations": "Not Applicable",  # 非危险品必填
    "Item Condition": "New",
    "Item Package Quantity": "1",
    "Number of Items": "1",
    "Number of Pieces": "1",
    "Fabric Type": "Polyester",
    "Fulfillment Channel Code (UK, DE, IT)": "AMAZON_EU",
    "Quantity (UK, DE, IT)": "1",
}
# 仅服饰类(PAJAMAS)补服饰专属下拉；其余类目(如 SLEEP_MASK)不补，避免填错类目字段
pt = rec.get("product_type") or ""
if str(pt).upper() == "PAJAMAS":
    DEFAULT_FILL.update({
        "Target Gender": "Unisex",
        "Department Name": "Men",
        "Apparel Size System": "UK",
        "Apparel Size Class": "Regular",
    })
# 只对"该 label 存在、且当前仍为空(第一列)"的列补默认值；避免覆盖已有真实值
filled_default = []
for label, defval in DEFAULT_FILL.items():
    cols = label_cols.get(label)
    if not cols: continue
    col = cols[0]
    cur = ws.cell(row=row, column=col).value
    if (cur is None or str(cur).strip() == "") and defval:
        setLabel(label, defval, occ=1)
        filled_default.append(label)

# —— 漏填检测：扫一遍，列出"仍为空的必填/关键列"，便于人工补 ——
CRITICAL = ["SKU", "Product Type", "Item Name", "Brand Name", "Variation Theme Name", "Country of Origin",
            "Dangerous Goods Regulations", "Item Condition", "Main Image URL", "Product Description",
            "Bullet Point", "List Price with Tax", "Quantity (UK, DE, IT)"]
missing = []
for label in CRITICAL:
    cols = label_cols.get(label)
    if not cols: continue
    col = cols[0]
    cur = ws.cell(row=row, column=col).value
    if cur is None or str(cur).strip() == "":
        missing.append(label)
if filled_default:
    print("  已补默认下拉值: " + ", ".join(filled_default))
if missing:
    print("  ⚠️ 以下关键/必填列仍为空: " + ", ".join(missing))

try:
    wb.save(OUT)
    print("saved:", OUT)
    print("  category:", "toilet" if is_toilet else "apparel", "| product_type:", rec.get("product_type"))
    print("  main_image:", (rec.get("main_image_url") or "")[:70], "| others:", len(imgs), "| price:", rec.get("price"), rec.get("currency"))
    if not missing:
        print("  ✔ 关键/必填列已全部填写")
except PermissionError:
    print("ERR: 文件被占用(Excel打开?)，请关闭后重试")
