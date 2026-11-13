# Atlas Loop 图数据 Schema（`AtlasGraphData` v2）

`scripts/build_atlas.mjs` 读取一个符合本 schema 的 UTF-8 JSON 文件，将其注入 `assets/viewer-shell.html`，生成独立、零 CDN 的离线 `.html` 文件。

## 顶层结构

```json
{
  "schemaVersion": "2.0",
  "meta": {
    "title": "主题标题",
    "subtitle": "一句话说明范围与核心要点",
    "subjectTag": "自由填写的类别标签（如 物理、手艺、书籍、CLI 工具、架构）",
    "language": "zh-CN",
    "uiLabels": {},
    "generatedByModel": "<你当前使用的确切模型名称>",
    "level": 0,
    "depth": 3,
    "depthReason": "一句话写明深度判断依据：学习者能自己补上几跳中间环节",
    "audience": "一句话写明这张图假设读者已经会什么",
    "drillDownTarget": null,
    "parentMapHtml": null,
    "editor": "vscode",
    "uncoveredScopes": [],
    "unverifiedNotes": []
  },
  "streams": [
    {
      "id": "stream-main",
      "title": "核心脉络标题",
      "summary": "这条脉络解释了什么",
      "learningOrder": ["node-1", "node-2"],
      "deepDive": {
        "hoverHint": "悬停在 ↳ 上时显示的简短预览",
        "askPrompts": [
          {
            "title": "聚焦的追问标题",
            "prompt": "具体、锚定上下文的深入追问（不少于 20 个字符）…"
          }
        ],
        "subAtlasPrompt": "使用 Atlas Loop 深入拆解「<脉络焦点>」（L1+），并将 parentMapHtml 设为 \"<current-output.html>\"。"
      }
    }
  ],
  "nodes": [
    {
      "id": "node-1",
      "streamIds": ["stream-main"],
      "role": "entry",
      "title": "节点标题",
      "summary": "显示在画布卡片与检视面板上的 1–2 句简明解释",
      "whyItMatters": "学习者为什么必须掌握这个节点",
      "keyFactors": {
        "inputs": "前置条件、触发因素、假设或输入",
        "outputs": "结果状态、结论或输出"
      },
      "mechanismsAndEffects": "内部如何运作、副作用或因果转变",
      "watchouts": "常见误解、边界情况或约束",
      "confidence": "verified",
      "unverifiedReason": null,
      "anchors": [],
      "detailGraph": {
        "nodes": [
          {
            "id": "sub-1",
            "role": "core",
            "title": "内部步骤 / 子概念",
            "summary": "内部发生了什么",
            "whyItMatters": "可选",
            "mechanismsAndEffects": "可选",
            "watchouts": "可选",
            "confidence": "verified",
            "anchors": []
          }
        ],
        "edges": []
      },
      "deepDive": {
        "hoverHint": "这个节点之下还藏着哪些更深的微妙之处",
        "askPrompts": [
          {
            "title": "具体的探究角度",
            "prompt": "引用确切概念、机制或文件/章节锚点的详细提示…"
          }
        ],
        "subAtlasPrompt": "使用 Atlas Loop 深入拆解「<节点焦点>」（L1+），并将 parentMapHtml 设为 \"<current-output.html>\"。"
      }
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "source": "node-1",
      "target": "node-2",
      "label": "形成孔隙骨架"
    }
  ]
}
```

上面的示例值仅用于说明各字段的含义；实际内容使用嗅探到的输出语言编写。

## 字段规则

1. **`meta.depth`、`meta.depthReason` 与 `meta.audience`（前两者必填）**：
   - `depth` 是主干因果链必须连出的跳数，取 `2`–`6` 的整数；`depthReason` 用一句话写明判断依据。深度衡量的是读者的位置，不是主题的体积：节点数不参与判断。
   - 评分与深度互为反函数（`depth = 分数 / 2 + 1`：2 分→2 跳，10 分→6 跳）。动笔前用 `scripts/profile.mjs read` 取学习者当前档案，没有记录时从 3 跳起步。
   - `audience` 是可选的一句话，写明这张图假设读者已经会什么；填写后画布页头会显示「读者档位：…」。
   - `build_atlas.mjs` 会算出顶层最长因果链（边数）并校验：

     | 情形 | 结果 |
     | --- | --- |
     | 最长链 < `depth` | 报错：因果链没有连到底 |
     | 最长链 > 8 跳 | 警告：一次跟不完，考虑收进 `detailGraph` |
     | 顶层边成环 | 报错：因果链必须是 DAG |
     | 顶层节点 > 20 | 警告：宽度不提升难度，只会稀释视线 |

   - 画布在页头显示「因果链深度：N 跳」与读者档位；`depth <= 2` 时收起搜索与小地图，只有一条脉络时不显示脉络过滤器，图例只列出实际用到的角色。
   - 除 `id`、`title`、`role`、`streamIds` 外，节点的说明性字段（`whyItMatters`、`keyFactors`、`mechanismsAndEffects`、`watchouts`、`anchors`、`detailGraph`、`deepDive`）都是可选的，只在确有内容时填写；整张图至少要有一个节点或脉络带 `deepDive`。
2. **`meta.language` 与 `meta.uiLabels`**：
   - 内置词典会自动为 `zh*` 与 `en*` 本地化 UI。
   - 当 `meta.language` 是其他语言（如 `ja`、`ko`、`es`、`fr`、`de`）时，在 `meta.uiLabels` 中为以下键填入本地化字符串（`skipToCanvas`、`modelPrefix`、`backParent`、`levelOverview`、`levelSubPrefix`、`allStreams`、`searchLabel`、`searchPlaceholder`、`zoomIn`、`zoomOut`、`lock`、`unlock`、`fitView`、`reset`、`legend`、`exportPng`、`scopeNotes`、`learningPath`、`expandDetail`、`collapseDetail`、`detailEdgeLabel`、`deepDiveBadgeTitle`、`deepDiveModalTitle`、`tabAsk`、`tabRecursive`、`copyBtn`、`copiedBtn`、`copySnippet`、`openInEditor`、`editorConfirmHint`、`recursiveUsageHint`、`whatItDoes`、`whyItMatters`、`inputsLabel`、`outputsLabel`、`mechanismsLabel`、`watchoutsLabel`、`anchorsLabel`、`openDeepDiveBtn`、`unverifiedTag`、`verifiedTag`、`uncoveredTitle`、`unverifiedTitle`、`noSearchMatches`、`nestedBadge`、`depthPrefix`、`hopsUnit`、`audiencePrefix`、`scoreIntent`、`scoreOptions`、`scoreHowto`、`close`，以及 `roles` 一个对象）。
3. **7 种通用认知角色（`node.role`）**：
   - `entry`：起点、用户动作、核心问题或触发因素。
   - `core`：主要机制、处理步骤或主论证。
   - `branch`：决策点、权衡、分岔或分类边界。
   - `foundation`：底层原理、思维模型、公理、数据存储或配置基础。
   - `context`：外部系统、历史/环境背景或生态依赖。
   - `extension`：异步影响、进阶变体、下游后果或推论。
   - `outcome`：最终结果、要点或目标状态。
4. **多态 `anchors`（可选——选用适合主题的类型）**：
   - 公式 / CLI 命令 / 思维清单 / 引文（`snippet`）：
     `{ "kind": "snippet", "label": "关键公式 / 命令", "content": "…" }`
   - 网页 / 文档参考（`link`）：
     `{ "kind": "link", "label": "官方指南", "url": "https://…" }`
   - 书籍章节 / 论文 / 事实引用（`source`）：
     `{ "kind": "source", "label": "第 4 章，第 112 页", "citation": "…" }`
   - 本地文件跳转（`editor`——**仅当磁盘上存在已验证的本地文件时使用**）：
     `{ "kind": "editor", "label": "入口处理函数", "filePath": "src/app.ts", "absPath": "/abs/path/src/app.ts", "line": 42, "symbol": "runApp", "editor": "vscode" }`
     （`build_atlas.mjs` 会核验 `absPath` 与 `line` 在磁盘上确实存在，并自动计算编码后的 `vscode://file/…` 或 `zed://file/…` URI。）
5. **边标签**：
   - 每条顶层边，以及 `detailGraph` 中的边，都必须带有非空的 `label`，说明因果、顺序或分支条件。
   - 标签显示在两张节点卡片之间的空隙中央，查看器不会截断。长度由编写者判断：写长了会被节点盖住，所以用能放进空隙的短词或短句，不设固定字数。
