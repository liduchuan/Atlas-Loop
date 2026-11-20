---
name: atlas-loop
description: 将任何陌生主题——学科、思维模型、手艺、书籍、软件工具、协议、商业模式或本地项目——拆解为独立离线交互式 HTML 学习地图（Atlas Loop）。地图按学习者已测评的能力自动调整认知阶梯深度（2–6 阶），支持从全景概览到细节的逐层钻取，以及每个节点上的「↳」深入探究与递归子图提示。Use when the user asks for an interactive learning map, knowledge graph, concept map, codebase map, or recursive drill-down to learn, break down, or explore any topic or repository.
---

# Atlas Loop

把任何值得学习的主题转化为单文件、零 CDN 的交互式 `@xyflow/react` HTML 地图，将**全局认知结构**与**可钻取的内部细节**、**可验证锚点**以及**逐节点 `↳` 递归提问提示**结合在一起。地图画多深不取决于主题，取决于**读者已经累积到哪一阶**——讲浅了浪费时间，讲深了跨度太大读不下去。

## 1. 嗅探语言并澄清范围

1. **动态嗅探语言（绝不硬编码）**:
   - 使用用户明确要求的语言。
   - 否则，嗅探用户提问与目标材料的主导语言；两者一致时，所有解释与 UI 标签均使用该语言，但技术标识符、专有名词、命令与原始文件名保持原样。
   - **歧义时询问**：如果用户的请求语言与目标材料冲突，或表述过于简略无法判断，在生成前询问用户偏好哪种输出语言。
2. **主题不受限**:
   - 目标可以是任何陌生主题：科学概念、手艺、历史事件、书籍、论文、CLI/软件工作流、系统架构或本地项目。
   - 严格聚焦于该主题的领域概念、演化机制与一手资料——绝不收集或提及版本控制仓库状态。
3. **确定递归层级（`L0` 与 `L1+`）**:
   - **L0 概览**（无 `drillDownTarget`）：只画理解该主题所必需的主干脉络。`入口 → 核心机制 → 分支/权衡 → 基础/背景 → 结果` 是可供参照的骨架，不是必须填满的清单；失败模式、反例或例外只在主题确实存在且影响理解时才画。在 `meta.uncoveredScopes` 中如实列出被略去的范围。
   - **L1+ 聚焦子图**（指定了 `drillDownTarget`）：整张图以该特定节点或子主题为根，拆解其内部状态、边界情况、演化机理与边界契约。设置 `meta.level`（`1`、`2`……）与 `meta.parentMapHtml`（如已知），使页头渲染出指向父图的可点击返回链接。

## 2. 先读学习者的版图与深度，再搭认知阶梯

**深浅不按主题分档，按人分。** 知识是一层层累积起来的：既有量变的逐级铺垫，也有质变的跃迁突破。同一个主题，对新手要停在「这是什么、为什么重要」，对熟手要一路推到第一性原理与深层边界。衡量深浅的只有一个量：**主干认知阶梯**必须推进的阶数（从入口到高阶洞察的最长递进边数），主干以外的分支与反馈回路不算。

- `meta.depth`：主干认知阶梯必须连出的阶数，`2`–`6` 的整数。**必填。**
- `meta.depthReason`：一句话写明凭什么选这个阶数——读者当前能自己补足多少前置、图需要把洞察推到哪一阶。
- `meta.audience`：一句话写明这张图假设读者已经会什么。它显示在页头，让读者一眼判断这张图是不是给自己看的。

深度与评分互为反函数：`depth = 分数 / 2 + 1`。2 分→2 阶，4 分→3 阶，6 分→4 阶，8 分→5 阶，10 分→6 阶。

**节点数不是难度。** 二十个互不相干的卡片串不起来，仍然是 2 阶；五个节点层层推进直抵机理或跃迁拐点，可以是 4 阶或 6 阶。阶数越多，越要求图往「为什么会这样、边界在何处、何时发生质变」推进，而不是把入门概念摊大饼。

### 2.1 读取学习者的历史评分与知识版图

在学习者私有档案 `~/.atlas-loop/profile.json` 中按 `领域/职业/职业精分` 三级键记录评分（如 `餐饮/厨师/粤菜`）与已学地图版图，并按模型分层。动笔前先列出已有领域树避免同义切碎，再读取目标领域：

```bash
node <skill_dir>/scripts/profile.mjs list
node <skill_dir>/scripts/profile.mjs read --domain "餐饮/厨师/粤菜" --model "<当前模型>"
```

- **复用已有领域树**：先看 `list`（或未命中时 `read` 返回的 `similarKeys`），同一领域的分支必须复用已有 key，绝不另起同义名称（例如已有 `软件开发/AI/SKILL` 时不要再建 `编程/AI/Agent Skill`）。
- **以旧带新**：`read` 返回关联历史地图与 `knownConcepts` 时，在 `meta.audience` 中承接读者已学过的核心概念，用类比或对比迁移，不重复铺垫已经掌握的基础。
- **按建议阶数定 `meta.depth`**：
  - 输出「估计 N 分，建议知识深度 D 阶」就按 `D` 写 `meta.depth`。
  - 输出「没有记录」时按 **3 阶**起步，并在 `depthReason` 里写明这是首次。
- **key 的职责是让观测累积，不是精确描述这张图。** 同一个本领，不管这次画的是哪个具体项目，都必须落进同一个 key；否则每张图都从零开始，追踪成长这件事就不存在了。
- **推断 key 的三条规矩**：
  1. **末段必须是众所周知的分支**——能在招聘网站、课程目录或图书馆书架上找到的名字（`粤菜`、`Raft`、`SKILL`）。为了描述当前这张图而临时拼出来的名字不算。
  2. **绝不用项目名、产品名、文件名或图的标题当精分。** 把本技能用在这个项目上，key 是 `软件开发/AI/SKILL`；写成 `软件开发/开发者工具/Atlas-Loop` 就废了——下一张关于这个项目的图会落到另一个叶子，历史全丢。
  3. **宁可粗，不可细。** 粗一档的代价是估计略糊；细一档的代价是每次从零开始。拿不准就少写一层（`餐饮` 或 `餐饮/厨师`）。
- 检验方法：想一下同一领域里的**下一张**图，它会得到同一个 key 吗？会不同，就是切得太细了。
- 主动推断，**不要为此发起提问**——把推断出的 key 写进交付时的评分提醒里，用户看到不对会纠正。
- 档案是按模型分层的：换了模型，同一领域的历史评分不能直接搬过来。`read` 会优先取当前模型的观测，没有时回退到全部。

### 2.2 把认知阶梯落到图上

1. **每一阶都要有真实的认知递进**：推进边说的是「基于 A 的积累/机理，跃迁或推导出 B」，而不是「A 之后顺便说 B」。凑不出真实递进就说明此主题到此为止，下调 `meta.depth`。
2. **每个节点都要挣得自己的位置**：删掉它读者就理解不了这一阶的跨越，才值得画。能用 5 个节点讲清楚，就不要画 12 个。
3. **高阶图压缩已知基础、向纵深延长**：当 `meta.depth >= 5` 时，不要把入门扫盲内容铺成前 2 阶再往下画，而是将已知前置默认收在 `meta.audience` 中，把有限的 5–6 阶全部用来推进更深层的机理、耦合权衡、质变临界点或第一性原理，使图上实实在在连出 `>= meta.depth` 阶推进边。
4. **用 `kind: "feedback"` 如实表达反馈闭环**：当系统存在真实的循环反馈、负反馈稳态或迭代回流时，直接在该边标注 `"kind": "feedback"`，不要为了过 DAG 校验而强行拆断真实回路。`feedback` 边不计入 `meta.depth` 的最长推进阶数。
5. **不为凑满模板而注水**：`whyItMatters`、`keyFactors`、`mechanismsAndEffects`、`watchouts`、`anchors` 都是可选字段，只在确有内容时填写；不要为浅图硬造分支、失败模式或第二条脉络。
6. **自重而外扩**：顶层节点超过 20 个时，把内部实现收进 `detailGraph`，或留给 L1+ 子图。宽度不提升深度，只会稀释视线。
7. **L1+ 子图重新评估**：子图的深度取决于被钻取的节点本身与读者的同一份档案，与父图的深度无关。
8. **用户的要求优先**：用户明确要求更详尽或更精简时照做，并在 `depthReason` 中注明。

`build_atlas.mjs` 会算出顶层推进边（排除 `kind: "feedback"`）的最长认知阶梯：短于 `meta.depth` 直接报错（阶梯未推到底），推进边自身成环也报错（推进主干必须是 DAG）。深度是可证伪的，节点数不是。

## 3. 研究并编写 `AtlasGraphData` JSON

编写 JSON 前，先阅读 [`references/schema.md`](references/schema.md) 了解精确的字段规则。

1. **每个论断都要有依据**:
   - 先检视一手证据（本地文件存在时查看实际文件；否则查阅权威文档、文本或领域原理）。
   - 对证据充分的节点标记 `"confidence": "verified"`。凡某关系、运行时绑定、版本差异或跨章节推断无法从现有证据 100% 确认时，设置 `"confidence": "unverified"`，填写 `unverifiedReason`，并在 `meta.unverifiedNotes` 中汇总。绝不编造路径、行号、引用或 URL。
   - 仅在适合主题时附加多态 `anchors`：`snippet`（公式、命令、清单、代码）、`source`（引用、章节）、`link`（参考 URL），或 `editor`（已验证的本地 `absPath` + `line`，仅用于 `vscode` 或 `zed`，绝不使用裸 `file://`）。代码片段要写 `language`（如 `python`、`ts`、`bash`）；查看器会按这个语言按需加载高亮，公式和清单不要填 `language`。
2. **按深度设计清晰度**:
   - 通过将脉络归入带有有序 `learningOrder` 的 `streams`，保持概览可读；浅图（`depth <= 2`）只需一条脉络，画布会自动收起搜索与小地图。
   - 深图里，把更细的内部步骤、子论证或调用链放入复杂节点的 `detailGraph`（`nodes` + `edges`），让学习者能展开内部、再折叠返回。`detailGraph` 是「同一认知阶下往内部再展开一层」，不是把顶层阶数硬塞进去；内部没有真实步骤的节点不要加。
3. **连线文案写短，长度由你判断**:
   - 每条顶层边和 `detailGraph` 里的边都要有 `label`，说明推进关系、反馈机制或分支条件。
   - 文案画在两张节点卡片之间的空隙中央，写过长会伸到旁边的卡片底下。整句尽量精炼在空隙内，一般控制在十来字以内。
4. **编写高信噪比的 `↳` 循环提示（`deepDive`）**:
   - 为最值得追问的节点与脉络附加 `deepDive`（至少一个），让学习者永远不会卡在「接下来该问什么」上：
     - `hoverHint`：一句简短的话，点明此节点之下隐藏的复杂性、质变临界点或微妙之处。
     - `askPrompts`：1–2 个精准的追问，锚定该节点的具体机制、边界情况、权衡或 `unverified` 项（适用时附精确的 file:line、命令或章节锚点）。**绝不写「详细解释 X」之类的泛泛填充。**
     - `subAtlasPrompt`：一段可直接复制的递归提示，将该节点命名为新的 `drillDownTarget`，并以当前输出的 HTML 文件名作为 `parentMapHtml`。子图生成后，用 `scripts/link_child.mjs` 将 `childAtlasUrl` 写回父图并重编译；UI 会自动以"进入子图"链接替代此生成提示词。
     - `childAtlasUrl`：子图已生成后填入其 HTML 文件名（如 `espresso-pressure-curve-atlas.html`）。与 `subAtlasPrompt` 共存时，UI 优先显示"进入子图"链接并隐藏生成提示词。
   - 主干推进到 `meta.depth` 就停，剩下的复杂度全部压在这里——这是深图不靠堆节点也能继续深入的方式。
5. **嵌入当前模型名称**:
   - 将 `meta.generatedByModel` 直接设置为你自己的当前模型名称——绝不为此添加配置开关或环境探测代码。这个字段也是评分分层的依据。

### UI 模板与状态边界

普通地图生成只编写符合 schema 的 `AtlasGraphData`，再用现有 `assets/viewer-shell.html` 构建。`template/app.jsx`、`template/styles.css` 和查看器外壳是固定的 UI 模板；除非用户明确要求修改模板，否则不得改动或另造页面结构、样式、控件、提示区、页脚、装饰文案，也不得在生成后手工改 HTML。`meta.uiLabels` 只用于所需语言的控件翻译，不用来塞主题说明或新增 UI 内容。

查看器单文件仅允许在浏览器中缓存纯 UI 浏览态（`atlas-state:*` 视口、展开状态、抽屉滚动记忆与 URL query），**学习评分、能力档案与提示词记录绝不写入页面或浏览器存储**——成长档案只存于本地私有 `~/.atlas-loop/profile.json`。

## 4. 在隔离的临时工作区中构建、验证与归档

所有中间 JSON 文件都放在系统临时目录（macOS/Linux 为 `/tmp/atlas-loop-<timestamp>/`，Windows 为 `%TEMP%\atlas-loop-<timestamp>\`）中处理，保持用户工作目录完全干净：

1. **编译独立 HTML**:
   ```bash
   node <skill_dir>/scripts/build_atlas.mjs --data /tmp/atlas-loop-<ts>/graph-data.json --out <output_html>
   ```
   - 省略 `--out` 时的默认文件名：`<safe-subject>-atlas.html`（L0）或 `<safe-subject>-sub-<safe-target>-atlas.html`（L1+）。
   - 修复 `build_atlas.mjs` 报告的任何 schema、认知阶梯长度、行号或密钥扫描错误；输出中的 `warnings`（如过长、节点过宽）逐条处理或说明理由。
2. **如为 L1+ 子图且父图存在，自动回写链接并重编父图**:
   ```bash
   node <skill_dir>/scripts/link_child.mjs --parent <parent_html> --child <output_html> --node "<node-id-or-title>"
   ```
   （若是针对整条脉络下钻，将 `--node` 换为 `--stream`。）
3. **运行无头 Playwright 验证**:
   ```bash
   node <skill_dir>/scripts/verify_atlas.mjs --html <output_html>
   ```
   （若用 `link_child.mjs` 重建了父图，也一并验证父图或确保父图仍通过校验。）
   - 必须通过全部检查：零 `pageerror`、深度徽标与数据一致、读者档位一致、未写入未授权浏览器存储、非零包围盒、零严重节点重叠、反馈回路边渲染一致、缩放/平移、锁定/解锁拖拽保护、`detailGraph` 展开/折叠（如有）、`↳` 提示气泡与双标签提示复制、全图 PNG 导出（且不破坏当前视口），以及 **Fit View** 与 **Reset** 的严格区分。
4. **归档到个人知识版图**:
   ```bash
   node <skill_dir>/scripts/profile.mjs catalog --domain "<领域key>" --html <output_html>
   ```
   （如用户希望查看自己的历史积累与成长轨迹，可随时运行 `node <skill_dir>/scripts/profile.mjs dashboard` 生成离线总览页 `~/.atlas-loop/dashboard.html`；如需把父子图合并打包为可离线的 ZIP，可运行 `node <skill_dir>/scripts/pack_atlas.mjs --entry <root_html>`。）
5. **交付并邀请体感自评**:
   - 删除临时的 `/tmp/atlas-loop-<ts>/` 文件夹。
   - 交付生成的 `.html` 文件并简明汇报：输出路径、语言与层级、知识深度（`N 阶`）及 `depthReason`、读者档位、当前模型、覆盖的脉络、代表性的 `↳` 深入方向、Playwright 验证结果（若生成了 `editor` 锚点但未做桌面启动测试，需注明操作系统编辑器启动本身未经过桌面实测），以及任何 `uncoveredScopes` 或 `unverifiedNotes`。
   - 可附 **1 个极轻量的迁移自检微问题**（锚定本图最关键的跃迁或反直觉边界，帮学习者检验自己是否真的吃透而不只是看顺眼）。
   - **最后必须单独用一句话请用户做体感定档**，明确写明推断出的领域 key、提示“**这不是给地图质量打分，而是告诉系统你在这条认知阶梯上的位置**”，并原样列出以下五个体感档位供选：
     - **2 分**：有前置概念卡壳，需要退一阶补基础
     - **4 分**：刚好吃透且有收获，当前深度正合适
     - **6 分**：全看懂了，想往底层机理或边界再深挖一阶
     - **8 分**：偏浅，中间铺垫我自己能推出来，下次可跳过基础直接推深
     - **10 分**：已很熟，下次请直奔第一性原理与前沿权衡
   - 不要用按钮、表单或任何页面内交互控件来收分。用户回了数字就立刻落盘，并告诉他下张图的建议深度：

     ```bash
     node <skill_dir>/scripts/profile.mjs record --domain "餐饮/厨师/粤菜" \
       --score <2|4|6|8|10> --depth <meta.depth> --model "<当前模型>" --html <output_html>
     ```

   - 用户不回应就继续，不要重复催促；同一主题下次再来时 `read` 会自己接上。

`scripts/profile.mjs` 与构建打包管线的行为由 `npm test`（`node scripts/test_profile.mjs && node scripts/test_pipeline.mjs`）覆盖，改动前先跑一遍。

*(用户明确要求画布模板的 UI 定制或样式调试时，运行 `node <skill_dir>/template/dev-server.mjs` 获得实时重载，运行 `node <skill_dir>/template/build-shell.mjs` 重建 `assets/viewer-shell.html`。)*
