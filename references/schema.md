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
    "complexity": "moderate",
    "complexityReason": "一句话写明复杂度判断依据",
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
        "hoverHint": "悬停在 ? 上时显示的简短预览",
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
      "label": "明确的因果、顺序或分支条件标签"
    }
  ]
}
```

上面的示例值仅用于说明各字段的含义；实际内容使用嗅探到的输出语言编写。

## 字段规则

1. **`meta.complexity` 与 `meta.complexityReason`（必填）**：
   - 先评估主题复杂度，再决定地图规模。`complexity` 取 `simple`、`moderate` 或 `complex`，`complexityReason` 用一句话写明判断依据。
   - `build_atlas.mjs` 按档位校验规模预算：

     | 档位 | 顶层节点上限 | 脉络上限 | 超出时 |
     | --- | --- | --- | --- |
     | `simple` | 6 | 1 | 报错 |
     | `moderate` | 12 | 3 | 报错 |
     | `complex` | 20 | 5 | 警告：把细节收进 `detailGraph` 或留给 L1+ 子图 |

   - 档位明显偏高时（`moderate` 少于 5 个顶层节点、`complex` 少于 8 个）输出警告，提示下调。
   - 画布在页头显示档位与顶层节点数，悬停可见 `complexityReason`；`simple` 档收起搜索与小地图，只有一条脉络时不显示脉络过滤器，图例只列出实际用到的角色。
   - 除 `id`、`title`、`role`、`streamIds` 外，节点的说明性字段（`whyItMatters`、`keyFactors`、`mechanismsAndEffects`、`watchouts`、`anchors`、`detailGraph`、`deepDive`）都是可选的，只在确有内容时填写；整张图至少要有一个节点带 `deepDive`。
2. **`meta.language` 与 `meta.uiLabels`**：
   - 内置词典会自动为 `zh*` 与 `en*` 本地化 UI。
   - 当 `meta.language` 是其他语言（如 `ja`、`ko`、`es`、`fr`、`de`）时，在 `meta.uiLabels` 中为以下键填入本地化字符串（`skipToCanvas`、`modelPrefix`、`backParent`、`levelOverview`、`levelSubPrefix`、`allStreams`、`searchLabel`、`searchPlaceholder`、`zoomIn`、`zoomOut`、`lock`、`unlock`、`fitView`、`reset`、`legend`、`scopeNotes`、`learningPath`、`expandDetail`、`collapseDetail`、`detailEdgeLabel`、`deepDiveModalTitle`、`tabAsk`、`tabRecursive`、`copyBtn`、`copiedBtn`、`openInEditor`、`whatItDoes`、`whyItMatters`、`inputsLabel`、`outputsLabel`、`mechanismsLabel`、`watchoutsLabel`、`anchorsLabel`、`openDeepDiveBtn`、`unverifiedTag`、`verifiedTag`、`close`、`complexityPrefix`、`nodeCountUnit`，以及 `roles` 与 `complexityTiers` 两个对象）。
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
   - 每条顶层边都必须带有非空的 `label`，说明因果联系、先后顺序或分支条件。
