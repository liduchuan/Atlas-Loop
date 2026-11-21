# Atlas Loop (`@liduchuan/atlas-loop`)

[简体中文](README.md) | [English](README.en.md)

一个面向持续学习者的通用递归学习地图 Agent Skill：把**任何陌生主题**——科学概念、手艺、商业模式、书籍、软件工具或代码库——拆解为**独立、零 CDN 的离线交互式 HTML 地图**，随学习者的成长轨迹自适应调整知识深度（2–6 阶），并为每个节点配上 `↳` 追问提示与递归子图提示。

## 为什么需要 Atlas Loop

学习陌生主题时通常会撞上两堵墙：**还没看清全局，就先迷失在平铺直叙的细节里**；以及**弄懂基础之后，不知道接下来该问什么**。更深一层的问题是：随着你不断学习、量变积累与质变跃迁，静态的“同一份教程”很快要么嫌浅、要么跨度太大读不下去。

`Atlas Loop` 用嵌套的进化闭环同时解决这些问题：

1. **深浅随人伸缩、知识持续累积**：地图讲多深取决于学习者已经累积到哪一阶，不取决于主题有多大。`Atlas Loop` 把每次学完后的五档体感定档（`2/4/6/8/10`）与已学地图版图记进私有档案 `~/.atlas-loop/profile.json`，按 `领域/职业/职业精分` 分层、按模型分开统计；下次画同一领域时不仅据此设定认知阶梯深度（`2–6 阶`），还会承接你已经掌握的核心概念、以旧带新。还可随时生成离线单文件 **个人成长总览页（`dashboard`）**，看见自己的认知阶梯曲线、知识书架与待探索线索队列。
2. **L0 概览 → 原地钻取细节**：在 `@xyflow/react` + `Dagre` 自动布局画布上呈现知识脉络与推荐学习路径，支持显式标注 `feedback` 反馈回路边。复杂节点内嵌 `detailGraph`，展开时动态重新布局，不与相邻节点重叠。
3. **逐节点 `↳` 循环提示**：每条脉络与每个核心节点都带有独立的 `↳` 徽标（悬停预览微妙之处，点击打开可一键复制的提示）：
   - **定向追问提示**：锚定上下文的精准问题，直指真实的权衡、质变拐点或尚未验证的边界——绝不写「详细解释 X」之类的泛泛填充。
   - **递归子图提示（`L1` / `L2+`）**：可直接运行的提示，把当前节点提升为一张独立的子 HTML 地图，通过 `link` 自动回写父图并互相跳转。
4. **动态语言嗅探**：自动匹配用户请求与目标材料的主导语言（有歧义时先询问），据此本地化画布 UI 控件，并原样保留技术标识符、专有名词、命令与文件名。
5. **多态依据与如实标注**：明确区分 `verified` 事实与 `unverified` 推断（附明确原因）。支持与主题相称的锚点——可复制的公式/命令/代码（`snippet`，代码按 `language` 按需高亮，不进入首屏）、章节/论文引用（`source`）、外部 URL（`link`），或在存在本地文件时经行号校验的 `vscode://` / `zed://` 跳转（`editor`）。
6. **合成与无头验证解耦**：内置预编译的离线查看器外壳（可直接以 `file://` 打开，零外部请求），让模型专注于深入研究与结构化 JSON，并在交付前由无头 Playwright 端到端验证。

## 可以拆解什么

`Atlas Loop` 不限定领域：

- **学科、思维模型与手艺**：例如*意式浓缩萃取物理*、*宏观经济利率传导*、*Raft 共识*
- **书籍与长篇论文**：核心论点、逐章论证结构、关键思维模型与反例
- **软件与 CLI 工具**：按用户意图组织的工作流、关键参数/配置、命令组合与排障分支
- **系统架构与代码库**：端到端业务流程、内部调用链、状态流转，以及一键跳转到已验证本地文件行的编辑器链接

## 安装

```bash
# 使用通用的 Agent Skills CLI 安装到当前项目
npx skills add liduchuan/Atlas-Loop

# 全局安装（写入各 Agent 的用户级 skills 目录）
npx skills add liduchuan/Atlas-Loop -g

# 或通过内置 CLI 直接安装（默认安装到 ~/.agents/skills/atlas-loop）
npx @liduchuan/atlas-loop install

# 或指定任意自定义 skills 目录
npx @liduchuan/atlas-loop install --dir /path/to/skills
```

## 示例提示

- **L0 概览**：
  - `用 Atlas Loop 梳理《思考，快与慢》的核心论证结构`
  - `用 Atlas Loop 讲解 Kubernetes Pod 网络的工作原理`
  - `用 Atlas Loop 为这个项目生成一张交互式学习地图`
- **L1+ 递归深入**：
  - 打开生成的 `.html` 文件 → 点击任一核心节点上的 `↳` → 切换到**递归生成子地图**，复制后发送给你的 Agent，即可生成一张与父图相互链接的子地图。

## 本地模板运行时（样式与 UI 调试）

`template/` 中包含未压缩的 React 源码（`app.jsx`）、样式表（`styles.css`）、示例数据集（`sample-data.json`），以及一个用于迭代视觉设计的实时重载预览服务器：

```bash
# 1. 安装一次开发依赖
npm install

# 2. 启动实时重载预览服务器：http://localhost:5179
#    - 编辑 template/styles.css 会原地热替换 CSS，不丢失画布状态
#    - 编辑 template/app.jsx 或 sample-data.json 会自动重新构建并刷新
npm run dev

# 可选：预览浅图（depth <= 2，自动收起搜索与小地图、含反馈回路边）
node template/dev-server.mjs --data template/sample-data-simple.json

# 可选：用你自己的 AtlasGraphData JSON 文件或自定义端口预览
node template/dev-server.mjs --data /path/to/graph-data.json --port 5180

# 3. 把模板改动写入 assets/viewer-shell.html
npm run build:shell

# 4. 跑学习者档案与构建打包管线的回归测试
npm test

# 5. 验证全部示例地图（build_atlas + verify_atlas）与 Playwright E2E
npm run verify:samples
npm run test:e2e
```

## CLI 用法

Agent 会在系统临时目录中自动调用内置的合成与验证工具，不会污染你的工作目录。你也可以直接运行它们：

```bash
# 1. 校验 AtlasGraphData JSON 并合成独立的离线 HTML 文件
npx @liduchuan/atlas-loop build --data /tmp/graph-data.json --out ./topic-atlas.html

# 2. 运行无头 Playwright 断言（深度徽标、读者档位、存储边界、布局、锁定/拖拽、Fit View vs Reset、↳ 提示、全图 PNG 导出）
npx @liduchuan/atlas-loop verify --html ./topic-atlas.html

# 3. 将 L1+ 子图链接回写父图并重新编译父图
npx @liduchuan/atlas-loop link --parent ./topic-atlas.html --child ./sub-atlas.html --node n-core

# 4. 从磁盘离线打包父图与所有递归子图为 ZIP（完整保留代码高亮资产）
npx @liduchuan/atlas-loop pack --entry ./topic-atlas.html --out ./topic-bundle.zip

# 5. 查看学习档案、归档地图或生成离线「个人成长总览」HTML
npx @liduchuan/atlas-loop profile list
npx @liduchuan/atlas-loop dashboard --out ~/.atlas-loop/dashboard.html
```

验证所强制的画布语义：

- **Fit View（适配全图）**：只调整视口的平移与缩放——保留用户拖拽后的节点位置和当前的脉络过滤器。
- **Reset（重置）**：独立的按钮，恢复初始 Dagre 坐标、初始视口、默认折叠状态、全部脉络视图与默认锁定，同时清空搜索、收起缩览图并关闭弹窗。
- **Lock（锁定位置）**：画布默认锁定节点拖拽。解锁后才可拖动节点；平移、缩放、节点查看与 `↳` 提示复制始终可用。
- **导出 PNG**：导出当前流图全部节点的完整包围盒画布（自动临时适配并还原用户当前视口，不丢失浏览视角）。
- **导出 ZIP**：在 HTTP 预览下可递归抓包父子图；本地 `file://` 下受浏览器安全策略限制仅打包当前图并给出非阻塞提示，多图离线合包请使用 `atlas-loop pack`。

## 仓库结构

```text
Atlas-Loop/
├── package.json              # @liduchuan/atlas-loop 包清单与开发脚本
├── bin/
│   └── atlas-loop.mjs        # CLI（install、dev、build、verify、link、pack、profile、dashboard）
├── SKILL.md                  # 触发规则、语言嗅探、认知阶梯与执行流程
├── template/
│   ├── app.jsx               # 未压缩的 React + @xyflow/react UI 源码
│   ├── styles.css            # 设计令牌与克制的单色样式表
│   ├── snippet-highlight.js  # 按需 highlight.js 模块加载器
│   ├── snippet-lang.mjs      # 代码片段语言启发式判断（查看器与构建器共用）
│   ├── sample-data.json      # 示例数据集（深图，3 阶，含 detailGraph 与子图链接）
│   ├── sample-data-simple.json # 浅图示例（2 阶，紧凑画布 + feedback 反馈回路边）
│   ├── sample-data-child.json  # L1 子图示例（3 阶）
│   ├── sample-data-highlight.json # 代码高亮示例
│   ├── dev-server.mjs        # 实时重载 HTTP 服务器（CSS 热替换 + JS 重新构建）
│   └── build-shell.mjs       # 将模板编译为 assets/viewer-shell.html
├── references/
│   └── schema.md             # AtlasGraphData v2 JSON schema、反馈边与多态锚点规范
├── assets/
│   ├── viewer-shell.html     # 预编译的独立离线外壳（React + @xyflow/react + Dagre）
│   └── hljs/                 # 拆分的 highlight.js 核心与单语言按需语法包
└── scripts/
    ├── build_atlas.mjs       # schema 校验、认知阶梯深度校验、行号核验、密钥扫描与 HTML 合成
    ├── verify_atlas.mjs      # 无头 Playwright 验证套件
    ├── link_child.mjs        # 将子图链接写回父图并重编译
    ├── pack_atlas.mjs        # 离线多图 ZIP 打包器
    ├── profile.mjs           # 学习者档案与知识版图读写、catalog 与个人成长总览生成
    ├── test_profile.mjs      # profile.mjs 的回归测试
    └── test_pipeline.mjs     # 构建/链接/打包/安装态兼容性测试
```

## 许可证

MIT
