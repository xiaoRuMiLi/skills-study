'''
Description: 
Author: king
Date: 2026-08-30 17:24:58
LastEditTime: 2026-08-30 17:46:59
LastEditors: king
'''
#! /usr/bin/env python3
"""
pdf 文本提取脚本
依赖: pip install pdfplumber
运行: python extract_pdf.py <pdf文件路径> 
"""
import sys
import pdfplumber

def extract_text_from_pdf(input_pdf_path: str) -> str:
    
    """ 从pdf中提取文本内容 """

    with pdfplumber.open(input_pdf_path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() + "\n"

    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python extract_pdf.py <pdf文件路径>")
        sys.exit(1)

    input_pdf_path = sys.argv[1]
    extracted_text = extract_text_from_pdf(input_pdf_path)
    print(extracted_text)