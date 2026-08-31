"""buffett-value-investing Skill 全文搜索。

用法: python search_content.py "关键词" [--context N]
在所有章节文件中搜索关键词，输出文件名+行号+上下文。
"""
import sys, os

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    keyword = args[0]
    ctx = 2
    for i, a in enumerate(sys.argv):
        if a == "--context" and i + 1 < len(sys.argv):
            ctx = int(sys.argv[i + 1])

    hits = 0
    for root, _, files in os.walk(SKILL_DIR):
        if "scripts" in root:
            continue
        for fn in sorted(files):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(root, fn)
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                if keyword in line:
                    hits += 1
                    rel = os.path.relpath(path, SKILL_DIR)
                    print(f"\n--- {rel}:{i+1} ---")
                    start = max(0, i - ctx)
                    end = min(len(lines), i + ctx + 1)
                    for j in range(start, end):
                        marker = ">>" if j == i else "  "
                        print(f"{marker} {j+1:4d}| {lines[j].rstrip()}")
    print(f"\n共 {hits} 处匹配「{keyword}」")
    sys.exit(0 if hits else 1)

if __name__ == "__main__":
    main()
