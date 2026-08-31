'''
Description: 
Author: lyq
Date: 2026-08-30 17:48:29
LastEditTime: 2026-08-30 18:18:34
LastEditors: lyq
'''
#! /usr/bin/env python3
"""
pdf 表单填充脚本
依赖: pip install pdfrw
运行: python fill_form.py <pdf模板路径>  <json.data> <输出pdf路径>
"""
import sys
import json
from pdfrw import PdfReader, PdfWriter, PageMerge,PdfDict, PdfString
def fill_form(pdf_template_path: str, output_pdf_path: str, data: dict) -> None:
    template_pdf = PdfReader(pdf_template_path)
    
    # 关键修复：先判断 pages 是否存在且可迭代
    if not template_pdf.pages:
        return  # 或者 raise ValueError("PDF 没有页面或读取失败")
    
    for page in template_pdf.pages:
        annotations = page.Annots
        if annotations:  # 同样：Annots 也可能为 None
            for annotation in annotations:
                if annotation.Subtype == '/Widget' and annotation.T:
                    field_name = annotation.T[1:-1]
                    if field_name in data:
                        value = data[field_name]
                        annotation.V = PdfString.encode(value)
                        annotation.AP = None

    PdfWriter(output_pdf_path, trailer=template_pdf).write()
def validate_json_data(data: dict, required_fields: list) -> bool:
    """验证 JSON 数据是否包含所有必需字段"""
    for field in required_fields:
        if field not in data:
            print(f"缺少必需字段: {field}")
            return False
    return True 
def validate_file_paths(pdf_template_path: str) -> bool:
    """验证文件路径是否存在"""
    import os
    if not os.path.isfile(pdf_template_path):
        print(f"PDF 模板文件不存在: {pdf_template_path}")
        return False
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("用法: python fill_form.py <pdf模板路径> <json.data> <输出pdf路径>")
        sys.exit(1)

    pdf_template_path = sys.argv[1]
    json_data_path = sys.argv[2]
    output_pdf_path = sys.argv[3]
    

    with open(json_data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    fill_form(pdf_template_path, output_pdf_path, data)
    print(f"已生成填充后的PDF: {output_pdf_path}")