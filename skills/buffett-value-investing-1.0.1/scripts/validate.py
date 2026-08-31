"""buffett-value-investing Skill 完整性校验。

用法: python validate.py [--verbose]
退出码: 0=通过 1=警告 2=错误
"""
import sys, os, re

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL_MD = os.path.join(SKILL_DIR, "SKILL.md")
CHAPTERS_DIR = os.path.join(SKILL_DIR, "chapters")

REQUIRED_CHAPTERS = [
    "way-ch01-five-sigma.md", "way-ch02-education.md",
    "way-ch03-twelve-criteria.md", "way-ch04-nine-cases.md",
    "way-ch05-portfolio.md", "way-ch06-psychology.md",
    "way-ch07-patience.md", "way-ch08-greatest.md",
    "essays-ch00-owner-principles.md", "essays-ch01-governance.md",
    "essays-ch02-investing.md", "essays-ch03-alternatives.md",
    "essays-ch04-common-stocks.md", "essays-ch05-ma.md",
    "essays-ch06-valuation.md", "essays-ch07-accounting-tax.md",
]
REQUIRED_FM = ["name", "slug", "displayName", "version", "description", "trigger"]
RECOMMENDED_SECTIONS = ["How to Use", "能力边界", "核心框架", "12个坚定准则",
                        "对话示例", "常见误区", "常见问题", "故障排除", "版本历史"]

errors, warnings = [], []
verbose = "--verbose" in sys.argv or "-v" in sys.argv

def log(msg, level="INFO"):
    if verbose:
        p = {"OK": "  OK ", "WARN": "  WARN", "ERR": "  ERR "}.get(level, "  ·   ")
        print(f"{p} {msg}")

def check_file(path, label):
    if os.path.exists(path):
        size = os.path.getsize(path)
        if size < 500:
            warnings.append(f"{label} 文件过小 ({size}B): {path}")
            log(f"{label}: {os.path.basename(path)} ({size}B) — 过小", "WARN")
        else:
            log(f"{label}: {os.path.basename(path)} ({size}B)", "OK")
        return True
    errors.append(f"{label} 缺失: {path}")
    log(f"{label} 缺失: {os.path.basename(path)}", "ERR")
    return False

# 1. SKILL.md
if check_file(SKILL_MD, "SKILL.md"):
    with open(SKILL_MD, encoding="utf-8") as f:
        content = f.read()
    # frontmatter
    m = re.match(r"^---\n(.*?)\n---", content, re.S)
    if not m:
        errors.append("SKILL.md 缺少 YAML frontmatter")
    else:
        fm = m.group(1)
        for key in REQUIRED_FM:
            if re.search(rf"^{key}:", fm, re.M):
                log(f"frontmatter.{key} 存在", "OK")
            else:
                errors.append(f"frontmatter 缺少字段: {key}")
        if 'name: buffett-value-investing' in fm:
            log("name 正确", "OK")
        else:
            errors.append("frontmatter name 应为 buffett-value-investing")
    # sections
    for sec in RECOMMENDED_SECTIONS:
        if sec in content:
            log(f"章节「{sec}」存在", "OK")
        else:
            warnings.append(f"SKILL.md 缺少推荐章节: {sec}")
    # 章节链接检查
    for ch in REQUIRED_CHAPTERS:
        if ch in content:
            log(f"SKILL.md 引用了 {ch}", "OK")
        else:
            warnings.append(f"SKILL.md 未引用章节文件: {ch}")

# 2. chapters
if not os.path.isdir(CHAPTERS_DIR):
    errors.append("chapters/ 目录缺失")
else:
    for ch in REQUIRED_CHAPTERS:
        check_file(os.path.join(CHAPTERS_DIR, ch), "chapter")

# 3. 结果
print(f"\n校验结果: {len(errors)} 错误, {len(warnings)} 警告")
for e in errors:
    print(f"  [错误] {e}")
for w in warnings:
    print(f"  [警告] {w}")
sys.exit(2 if errors else (1 if warnings else 0))
