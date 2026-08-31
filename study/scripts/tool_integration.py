'''
Description: 
Author: lyq
Date: 2026-08-28 16:44:05
LastEditTime: 2026-08-28 16:48:20
LastEditors: lyq
'''
# 文件路径：scripts/tool_integration.py
import subprocess
import sys
import json

def run_command(cmd: list, timeout: int = 60) -> dict:
    """
    运行外部命令并捕获输出

    参数：
        cmd:     命令列表，如 ["pandoc", "--version"]
        timeout: 超时秒数，默认 60

    返回：
        包含 success、stdout、stderr、returncode 的字典
    """
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,   # 同时捕获 stdout 和 stderr
            text=True,             # 以字符串返回，而非字节
            timeout=timeout
        )
        return {
            "success":    result.returncode == 0,
            "returncode": result.returncode,
            "stdout":     result.stdout.strip(),
            "stderr":     result.stderr.strip()
        }
    except FileNotFoundError:
        return {
            "success":    False,
            "returncode": -1,
            "stdout":     "",
            "stderr":     f"命令不存在：{cmd[0]}，请确认已安装"
        }
    except subprocess.TimeoutExpired:
        return {
            "success":    False,
            "returncode": -1,
            "stdout":     "",
            "stderr":     f"命令执行超时（超过 {timeout} 秒）"
        }

# 示例：用 pandoc 将 Markdown 转换为 HTML
if __name__ == "__main__":
    result = run_command([
        "pandoc",
        "/mnt/user-data/uploads/readme.md",
        "-o", "/mnt/user-data/outputs/readme.html",
        "--standalone"
    ])
    if result["success"]:
        print("转换成功")
    else:
        print(f"转换失败：{result['stderr']}")
        sys.exit(1)
