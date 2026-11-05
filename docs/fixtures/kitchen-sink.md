---
title: MarkdownProMax 全语法测试文档
author: markdownpromax
tags: [markdown, gfm, katex, mermaid]
created: 2026-11-04
---

# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

Setext 一级标题
===============

Setext 二级标题
---------------

---

## 行内样式

**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`、<kbd>Ctrl</kbd> + <kbd>S</kbd>

转义字符：\*不是斜体\*、\`不是代码\`、\\反斜杠、\_下划线\_

HTML 实体：&copy; &amp; &lt; &gt; &nbsp; &mdash;

行内链接：[示例链接](https://example.com "链接标题")、[引用式链接][ref-1]、自动链接 <https://example.com>、裸链接 https://example.com

图片：![本地图片](./assets/demo.png) 与 ![远程图片](https://www.rust-lang.org/logos/rust-logo-512x512.png "远程图片标题")

## 列表

无序列表：

- 第一项
- 第二项
  - 嵌套项
    - 更深一层
- 第三项

有序列表：

1. 第一步
2. 第二步
   1. 子步骤一
   2. 子步骤二
3. 第三步

任务列表：

- [x] 已完成的任务
- [ ] 未完成的任务

混合嵌套：

1. 有序项
   - 其中嵌套无序项
     > 引用嵌在列表里

## 引用

> 一级引用
>
> > 二级引用
> >
> > > 三级引用

> 引用里的代码：
>
> ```js
> console.log('quoted')
> ```

## 代码

行内代码 `const answer = 42` 结束。

```rust
fn main() {
    println!("你好，MarkdownProMax");
}
```

```javascript
const sum = (a, b) => a + b
console.log(sum(1, 2))
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}"
```

```json
{ "name": "markdownpromax", "version": "0.1.0" }
```

```bash
pnpm install && pnpm tauri dev
```

```diff
- 旧内容
+ 新内容
```

缩进代码块：

    indented code block
    second line here

## 表格

| 左对齐 | 居中 | 右对齐 |
| :----- | :--: | -----: |
| 苹果   |  3   | ¥12.50 |
| 香蕉   |  12  |  ¥3.20 |
| `代码` | **粗体** | [链接](https://example.com) |

## 分割线

---

***

___

## 脚注

带脚注的句子[^1]，以及第二个脚注[^note]。

[^1]: 第一个脚注的内容。
[^note]: 第二个脚注，支持 **Markdown** 与 `代码`。

## 数学公式

行内公式：$E = mc^2$，以及 $\int_0^1 x^2\,\mathrm{d}x = \frac{1}{3}$。

块级公式：

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0
\end{aligned}
$$

## Mermaid 图表

### 流程图

```mermaid
flowchart TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
```

### 时序图

```mermaid
sequenceDiagram
    participant 用户
    participant 前端
    participant 后端
    用户->>前端: 点击保存
    前端->>后端: POST /api/save
    后端-->>前端: 200 OK
    前端-->>用户: 显示"已保存"
```

### 类图

```mermaid
classDiagram
    class Editor {
        +String path
        +open()
        +save()
    }
    class Document {
        +String text
    }
    Editor --> Document : 持有
```

### 状态图

```mermaid
stateDiagram-v2
    [*] --> 空闲
    空闲 --> 编辑中 : 输入
    编辑中 --> 空闲 : 停止输入
    编辑中 --> 已保存 : Ctrl+S
    已保存 --> [*]
```

### ER 图

```mermaid
erDiagram
    USER ||--o{ DOCUMENT : owns
    DOCUMENT ||--|{ ASSET : contains
    USER {
        string id
        string name
    }
    DOCUMENT {
        string id
        string title
    }
```

### 甘特图

```mermaid
gantt
    title 项目排期
    dateFormat YYYY-MM-DD
    section 设计
    需求分析 :a1, 2026-01-01, 7d
    原型设计 :a2, after a1, 10d
    section 开发
    前端实现 :b1, after a2, 20d
    后端实现 :b2, after a2, 15d
```

### 饼图

```mermaid
pie title 时间分配
    "写代码" : 45
    "写文档" : 20
    "调试" : 25
    "会议" : 10
```

### 用户旅程

```mermaid
journey
    title 打开文档的旅程
    section 启动
      点击图标: 5: 用户
      看到窗口: 4: 用户
    section 编辑
      输入文字: 5: 用户
      看到渲染: 5: 用户
```

### Git 图

```mermaid
gitGraph
    commit id: "init"
    branch feature
    checkout feature
    commit id: "feat-render"
    checkout main
    merge feature
    commit id: "release-0.1"
```

### 思维导图

```mermaid
mindmap
  root((MarkdownProMax))
    编辑器
      Live Preview
      快捷键
    渲染
      KaTeX
      Mermaid
    文件
      编码
      行尾
```

### 时间线

```mermaid
timeline
    title 版本历史
    2026 Q1 : M0 骨架
    2026 Q2 : M2 Live Preview
    2026 Q3 : M3 富内容
```

### 象限图

```mermaid
quadrantChart
    title 优先级矩阵
    x-axis 低收益 --> 高收益
    y-axis 低成本 --> 高成本
    quadrant-1 优先做
    quadrant-2 谨慎做
    quadrant-3 不做
    quadrant-4 顺手做
    暗色主题: [0.8, 0.3]
    插件系统: [0.3, 0.9]
```

### XY 图

```mermaid
xychart-beta
    title "编辑器性能"
    x-axis ["1MB", "2MB", "5MB", "10MB"]
    y-axis "帧率" 0 --> 60
    line [60, 58, 45, 30]
    bar [59, 57, 44, 29]
```

### 需求图

```mermaid
requirementDiagram
    requirement markdown_req {
        id: 1
        text: "支持 Markdown 渲染"
        risk: high
        verifymethod: test
    }
    element editor {
        type: simulation
    }
    editor - satisfies -> markdown_req
```

### 桑基图

```mermaid
sankey-beta
Markdown,HTML,10
HTML,PDF,5
Markdown,PDF,3
```

## HTML

<div align="center">
  <strong>HTML 块级内容</strong>
</div>

行内 HTML：<span style="color: #e11d48">红色文字</span>

## 换行

两个空格结尾换行  
这一行是第二行

反斜杠换行\
这一行也是第二行

## 引用式链接定义

[ref-1]: https://example.com/ref "引用标题"

## 结束

文档到这里结束。
