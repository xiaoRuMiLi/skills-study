---
name: python-name 命名规范技能
descripton: 当用户要求重构、审查或者编写Python代码时，参考该规范
---

# Python 命名规范

## 指令
1. 所有内部函数必须以' _intenal_'前缀命名
2. 如果发现不符合该规范的代码， 请自行提出修改建议
3. 在执行 `claude commit` 前，必须检查此规范。

## 参考实例
- 正确: 'def _intenal_call_back()'
- 错误: 'def call_back()'

