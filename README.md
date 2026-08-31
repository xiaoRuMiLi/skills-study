# 🧠 Skills-study | Skill 学习与创作工坊

> 一个专注于 Skill 开发、学习与实践的开源知识库。  
> 收录优质 Skill 实例、系统学习笔记，以及原创 Skill 作品。

[![GitHub stars](https://img.shields.io/github/stars/xiaoRuMiLi/skills-study?style=social)](https://github.com/xiaoRuMiLi/skills-study)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📖 项目简介

本项目旨在构建一个**可复用、可学习、可扩展**的 Skill 知识库：

- **📝 学习笔记** — 从入门到精通的 Skill 开发方法论与踩坑记录
- **💡 实例解析** — 精选优质 Skill 的源码拆解与原理分析
- **🔧 原创 Skill** — 个人创作的实用 Skill，覆盖日常办公、数据分析、内容创作等场景

无论你是想**学习 Skill 开发**，还是寻找**可直接使用的 Skill 模板**，这里都能找到参考。

---

## 🗂️ 目录结构
skill-lab/
├── 📁 notes/                 # 学习笔记
│   ├── 01-skill-basics.md    # Skill 基础概念
│   ├── 02-prompt-engineering.md
│   ├── 03-tool-integration.md
│   └── 04-best-practices.md
│
├── 📁 examples/              # 精选 Skill 实例（含源码解析）
│   ├── example-01-xxx/
│   │   ├── skill.md          # Skill 定义文件
│   │   ├── README.md         # 使用说明与原理分析
│   │   └── assets/           # 截图、示意图
│   └── example-02-xxx/
│
├── 📁 skills/             # 原创 Skill
│   ├── skill-a/              # Skill 名称
│   │   ├── skill.md
│   │   └── README.md
│   └── skill-b/
│
├── 📁 templates/             # Skill 开发模板
│   └── skill-template.md
│
├── README.md
└── LICENSE
plain

---

## 🚀 快速开始

### 1. 浏览学习笔记

从 [`notes/`](./notes/) 开始，系统学习 Skill 开发的核心概念：

| 笔记 | 内容 | 难度 |
|------|------|------|
| [Skill 基础概念](./notes/01-skill-basics.md) | 什么是 Skill、工作原理、核心组件 | ⭐ 入门 |
| [Prompt 工程技巧](./notes/02-prompt-engineering.md) | 指令设计、上下文管理、输出控制 | ⭐⭐ 进阶 |
| [工具集成指南](./notes/03-tool-integration.md) | 如何接入外部 API、数据库、文件系统 | ⭐⭐⭐ 高级 |
| [最佳实践](./notes/04-best-practices.md) | 性能优化、错误处理、安全规范 | ⭐⭐⭐ 高级 |

### 2. 运行实例 Skill

每个实例都包含完整的 Skill 定义和使用说明：

```bash
# 进入某个实例目录
cd examples/example-01-xxx

# 查看使用说明
cat README.md

# 按照说明部署运行
