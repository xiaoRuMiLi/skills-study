import openpyxl, json, shutil, sys
PID = sys.argv[1] if len(sys.argv) > 1 else '12664'
SRC = r"D:/Downloads/PAJAMAS_TOILET_SEAT (1).xlsm"
REC = r"C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api/output/" + PID + "/listing/record.json"
OUT = r"C:/Users/Administrator/.openclaw/workspace-dev/skills/hicustom-api/output/" + PID + "/listing/listing_filled.xlsm"

rec = json.load(open(REC, encoding="utf-8"))
name = ((rec.get("item_name") or "") + " " + (rec.get("model_name") or "")).lower()
is_toilet = any(w in name for w in ["toilet", "seat cover", "lid cover", "tank cover", "toilet lid"])

shutil.copyfile(SRC, OUT)
wb = openpyxl.load_workbook(OUT, keep_vba=True)
ws = wb["Template"]
row = 7
def setc(col, val):
    if val is not None and str(val) != "":
        ws.cell(row=row, column=col).value = str(val)

# ---- 通用字段 ----
setc(1, "SKU-" + PID + "-UK-BK")
setc(4, "Parent")
setc(7, rec.get("item_name"))
setc(9, rec.get("brand"))
setc(12, "228166")                      # recommended_browse_nodes (参考)
setc(17, "MODEL-" + PID + "-UK")
setc(18, rec.get("model_name"))
setc(21, "Generic")
# 图片
setc(27, rec.get("main_image_url"))
imgs = rec.get("other_image_urls") or []
for i in range(8):
    setc(28 + i, imgs[i] if i < len(imgs) else "")
# 文案
setc(37, rec.get("product_description"))
bl = rec.get("bullet_point") or []
for i in range(5):
    setc(38 + i, bl[i] if i < len(bl) else "")
setc(43, rec.get("generic_keyword"))
setc(60, rec.get("material"))
setc(64, "1")                           # number_of_items
setc(69, "Black")                       # colour map
setc(70, rec.get("color"))
setc(72, "2")                           # number_of_pieces

# 自动补的可填项
setc(63, rec.get("fabric_type"))        # fabric_type
setc(239, rec.get("country_of_origin")) # country_of_origin
setc(199, rec.get("fulfillment_channel")) # fulfillment_channel_code
setc(200, rec.get("quantity"))          # quantity
setc(238, rec.get("number_of_boxes"))   # number_of_boxes
pkg = rec.get("package") or {}
if pkg.get("weight"):
    setc(236, pkg["weight"])            # item_package_weight value
    setc(237, "GRAMS")                  # item_package_weight unit
# product_id (col10/11) 留空 → 缺失清单提示

if is_toilet:
    # 马桶垫类目：seat 相关
    setc(2, "")                          # product_type 需人工按账号类目填
    setc(160, rec.get("material"))       # seat material_type
    setc(151, rec.get("size"))           # size
else:
    # 服饰类目
    setc(2, "SHIRT")
    setc(54, "UK"); setc(55, "Regular"); setc(56, "S-5XL" if rec.get("size") else "One Size")
    setc(58, "Regular"); setc(59, "Regular"); setc(68, "Standard")
    setc(151, rec.get("size"))

try:
    wb.save(OUT)
    print("saved:", OUT, "| category:", "toilet" if is_toilet else "apparel")
except PermissionError:
    print("ERR: 文件被占用(Excel打开?), 先关闭再试")
