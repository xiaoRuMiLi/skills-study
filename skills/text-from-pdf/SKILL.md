<!--
 * @Description: 
 * @Author: lyq
 * @Date: 2026-08-30 16:57:03
 * @LastEditTime: 2026-08-30 17:24:25
 * @LastEditors: lyq
-->
---
name: text-from-pdf
description: 从PDF中提取文本，表格等内容。使用场景： 提取PDF文本、读取PDF内容、PDF转文本、用户提及「PDF 提取」「读取 PDF」「PDF 文字」「PDF 内容」等关键词时使用。
compatibility: 需要 python 3.10+
metadata: 
    author: king
    version: "1.0"
---

# pdf文本操作

## pdf文本提取

使用脚本提取PDF文件中的文本:

```base
python scripts/extract_pdf.py input.ptf
```

输出的是提取的纯文本内容。

如果需要保存到文件中：

```base
python scripts/extract_pdf.py input.pdf > output.txt
```

## 填写pdf表单

使用json数据填写pdf表单:

```base
python scripts/fill_form.py input.pdf data.json output.pdf
```
data.json格式:

```json
{
    "field_name": "value",
    "another_field_name": "value"
}
```

## 合并pdf

将多个pdf文件合并为一个文件:

```base
python scripts/merge.py output.pdf input1.pdf input2.pdf input3.pdf
```

## 依赖安装

需要安装 pdfplumber 和 PyPDF2：

```base
pip install pdfplumber PyPDF2
```









