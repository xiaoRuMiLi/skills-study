# 文件路径：scripts/tests/test_clean_data.py
import pytest
import os
import tempfile
import csv

# 被测试的模块
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from clean_data import remove_duplicates, fill_nulls, strip_whitespace

#  测试：去重 
def test_remove_duplicates_basic():
    """正常情况：有重复行时应删除"""
    rows = [
        {"name": "runoob", "score": "90"},
        {"name": "runoob", "score": "90"},   # 重复行
        {"name": "RUNOOB", "score": "80"},
    ]
    result = remove_duplicates(rows)
    assert len(result) == 2, "应删除 1 条重复行"

def test_remove_duplicates_empty():
    """边界情况：空列表不应报错"""
    result = remove_duplicates([])
    assert result == []

#  测试：空值填充 
def test_fill_nulls_numeric():
    """数值列的空值应填充为 0"""
    rows = [{"value": "10"}, {"value": ""}, {"value": "20"}]
    result = fill_nulls(rows, col="value", fill_with="0")
    assert result[1]["value"] == "0"

#  测试：去空格 
def test_strip_whitespace():
    """字符串首尾空格应被清除"""
    rows = [{"name": "  runoob  "}, {"name": "RUNOOB"}]
    result = strip_whitespace(rows, col="name")
    assert result[0]["name"] == "runoob"
    assert result[1]["name"] == "RUNOOB"

#  集成测试：读取真实文件 
def test_process_real_file():
    """创建临时 CSV 文件并测试完整处理流程"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv",
                                    delete=False, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "score"])
        writer.writeheader()
        writer.writerow({"name": "  runoob  ", "score": "90"})
        writer.writerow({"name": "  runoob  ", "score": "90"})  # 重复
        writer.writerow({"name": "RUNOOB",     "score": ""})    # 空值
        tmp_path = f.name

    try:
        from clean_data import process_file
        result = process_file(tmp_path)
        assert result["removed_rows"] == 1
        assert result["fixed_values"] == 1
    finally:
        os.unlink(tmp_path)
