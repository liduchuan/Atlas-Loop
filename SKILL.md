---
name: atlas-loop
description: 将任何陌生主题——学科、思维模型、手艺、书籍、软件工具、协议、商业模式或本地项目——拆解为独立离线交互式 HTML 学习地图（Atlas Loop），支持从概览到细节的逐层钻取，以及每个节点上的「?」深入探究与递归子图提示。当用户希望以交互式可视地图的形式学习、拆解、梳理或递归探索任何主题或代码库时触发。
---

# Atlas Loop

把任何值得学习的主题转化为单文件、零 CDN 的交互式 `@xyflow/react` HTML 地图，将**全局因果结构**与**可钻取的内部细节**、**可验证锚点**以及**逐节点 `?` 递归提问提示**结合在一起。

## 1. 嗅探语言并澄清范围

1. **动态嗅探语言（绝不硬编码）**:
   - 使用用户明确要求的语言。
   - 否则，嗅探用户提问与目标材料的主导语言；两者一致时，所有解释与 UI 标签均使用该语言，但技术标识符、专有名词、命令与原始文件名保持原样。
   - **歧义时询问**：如果用户的请求语言与目标材料冲突，或表述过于简略无法判断，在生成前询问用户偏好哪种输出语言。
2. **主题不受限**:
   - 目标可以是任何陌生主题：科学概念、手艺、历史事件、书籍、论文、CLI/软件工作流、系统架构或本地项目。
   - 严格聚焦于该主题的领域概念、因果机制与一手资料——绝不收集或提及版本控制仓库状态。
3. **确定递归层级（`L0` 与 `L1+`）**:
   - **L0 概览**（无 `drillDownTarget`）：端到端绘制主题的主要脉络（`入口 → 核心机制 → 分支/权衡 → 基础/背景 → 结果`），并包含重要的失败模式、反例或例外。在 `meta.uncoveredScopes` 中如实列出被略去的范围。
   - **L1+ 聚焦子图**（指定了 `drillDownTarget`）：整张图以该特定节点或子主题为根，拆解其内部状态、边界情况、逐步机制与边界契约。设置 `meta.level`（`1`、`2`……）与 `meta.parentMapHtml`（如已知），使页头渲染出指向父图的可点击返回链接。

## 2. 研究并编写 `AtlasGraphData` JSON

编写 JSON 前，先阅读 [`references/schema.md`](references/schema.md) 了解精确的字段规则。

1. **每个论断都要有依据**:
   - 先检视一手证据（本地文件存在时查看实际文件；否则查阅权威文档、文本或领域原理）。
   - 对证据充分的节点标记 `"confidence": "verified"`。凡某关系、运行时绑定、版本差异或跨章节推断无法从现有证据 100% 确认时，设置 `"confidence": "unverified"`，填写 `unverifiedReason`，并在 `meta.unverifiedNotes` 中汇总。绝不编造路径、行号、引用或 URL。
   - 仅在适合主题时附加多态 `anchors`：`snippet`（公式、命令、清单）、`source`（引用、章节）、`link`（参考 URL），或 `editor`（已验证的本地 `absPath` + `line`，仅用于 `vscode` 或 `zed`，绝不使用裸 `file://`）。
2. **设计双层清晰度**:
   - 通过将流程归入带有有序 `learningOrder` 的 `streams`，保持概览可读。
   - 将更细的内部步骤、子论证或调用链放入每个复杂节点的 `detailGraph`（`nodes` + `edges`），让学习者能展开内部、再折叠返回。
3. **编写高信噪比的 `?` 循环提示（`deepDive`）**:
   - 为核心/复杂节点与脉络附加 `deepDive`，让学习者永远不会卡在「接下来该问什么」上：
     - `hoverHint`：一句简短的话，点明此节点之下隐藏的复杂性或微妙之处。
     - `askPrompts`：1–2 个精准的追问，锚定该节点的具体机制、边界情况、权衡或 `unverified` 项（适用时附精确的 file:line、命令或章节锚点）。**绝不写「详细解释 X」之类的泛泛填充。**
     - `subAtlasPrompt`：一段可直接复制的递归提示，将该节点命名为新的 `drillDownTarget`，并以当前输出的 HTML 文件名作为 `parentMapHtml`。
4. **嵌入当前模型名称**:
   - 将 `meta.generatedByModel` 直接设置为你自己的当前模型名称——绝不为此添加配置开关或环境探测代码。

## 3. 在隔离的 `/tmp` 工作区中构建与验证

所有中间文件都放在 `/tmp/atlas-loop-<timestamp>/` 中处理，保持用户工作目录完全干净：

1. **编译独立 HTML**:
   ```bash
   node <skill_dir>/scripts/build_atlas.mjs --data /tmp/atlas-loop-<ts>/graph-data.json --out <output_html>
   ```
   - 省略 `--out` 时的默认文件名：`<safe-subject>-atlas.html`（L0）或 `<safe-subject>-sub-<safe-target>-atlas.html`（L1+）。
   - 修复 `build_atlas.mjs` 报告的任何 schema、行号或密钥扫描错误。
2. **运行无头 Playwright 验证**:
   ```bash
   node <skill_dir>/scripts/verify_atlas.mjs --html <output_html>
   ```
   - 必须通过全部检查：零 `pageerror`、非零包围盒、零严重节点重叠、缩放/平移、锁定/解锁拖拽保护、`detailGraph` 展开/折叠、`?` 提示气泡与双标签提示复制，以及 **Fit View**（仅调整视口）与 **Reset**（完整恢复到初始位置、过滤器与折叠状态）之间的严格区分。
3. **清理与交付**:
   - 删除临时的 `/tmp/atlas-loop-<ts>/` 文件夹。
   - 交付生成的 `.html` 文件并简明汇报：输出路径、语言与层级（`L0` 或 `L1+`）、当前模型、覆盖的脉络、代表性的 `?` 深入方向、Playwright 验证结果（若生成了 `editor` 锚点但未做桌面启动测试，需注明操作系统编辑器启动本身未经过桌面实测），以及任何 `uncoveredScopes` 或 `unverifiedNotes`。

*(若需对画布模板本身做 UI 定制或样式调试，运行 `node <skill_dir>/template/dev-server.mjs` 获得实时重载，运行 `node <skill_dir>/template/build-shell.mjs` 重建 `assets/viewer-shell.html`。)*
