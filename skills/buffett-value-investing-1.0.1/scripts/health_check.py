"""buffett-value-investing Skill 健康检查。

用法: python health_check.py [--fix]
检查项: 文件完整性、frontmatter 格式、章节链接一致性、内容体量。
--fix 目前支持: 自动创建缺失的目录结构。
"""
import sys, os, re

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fix = "--fix" in sys.argv

def main():
    problems = []

    # 目录结构
    for d in ["chapters", "scripts"]:
        p = os.path.join(SKILL_DIR, d)
        if not os.path.isdir(p):
            problems.append(f"目录缺失: {d}/")
            if fix:
                os.makedirs(p, exist_ok=True)
                print(f"[修复] 已创建目录 {d}/")

    # SKILL.md frontmatter
    sm = os.path.join(SKILL_DIR, "SKILL.md")
    if not os.path.exists(sm):
        problems.append("SKILL.md 缺失（致命）")
    else:
        with open(sm, encoding="utf-8") as f:
            content = f.read()
        if not content.startswith("---"):
            problems.append("SKILL.md frontmatter 未以 --- 开头")
        m = re.search(r"version:\s*(\S+)", content)
        if not m:
            problems.append("frontmatter 缺少 version")
        else:
            print(f"[信息] 当前版本: {m.group(1)}")
        # 章节链接 vs 实际文件
        linked = set(re.findall(r"chapters/([\w\-]+\.md)", content))
        ch_dir = os.path.join(SKILL_DIR, "chapters")
        actual = set(os.listdir(ch_dir)) if os.path.isdir(ch_dir) else set()
        for f_ in sorted(linked - actual):
            problems.append(f"SKILL.md 链接了不存在的章节: {f_}")
        for f_ in sorted(actual - linked):
            problems.append(f"章节文件未被 SKILL.md 引用: {f_}")
        print(f"[信息] 章节文件: {len(actual)} 个, SKILL.md 引用: {len(linked)} 个")

    total = sum(os.path.getsize(os.path.join(r, f_))
                for r, _, fs in os.walk(SKILL_DIR) for f_ in fs if f_.endswith(".md"))
    print(f"[信息] Markdown 总量: {total/1024:.1f} KB")

    if problems:
        print(f"\n发现 {len(problems)} 个问题:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("\n健康检查通过 ✓")
    sys.exit(0)

if __name__ == "__main__":
    main()
