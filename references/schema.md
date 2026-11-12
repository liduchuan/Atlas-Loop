# Atlas Loop Graph Data Schema (`AtlasGraphData` v2)

`scripts/build_atlas.mjs` consumes a UTF-8 JSON file matching this schema and injects it into `assets/viewer-shell.html` to produce a standalone, zero-CDN offline `.html` file.

## Top-Level Structure

```json
{
  "schemaVersion": "2.0",
  "meta": {
    "title": "Subject Title",
    "subtitle": "One-line scope and core takeaway",
    "subjectTag": "Free-form category tag (e.g. Physics, Craft, Book, CLI Tool, Architecture)",
    "language": "zh-CN",
    "uiLabels": {},
    "generatedByModel": "<Your Exact Active Model Name>",
    "level": 0,
    "drillDownTarget": null,
    "parentMapHtml": null,
    "editor": "vscode",
    "uncoveredScopes": [],
    "unverifiedNotes": []
  },
  "streams": [
    {
      "id": "stream-main",
      "title": "Core Stream Title",
      "summary": "What this thread explains",
      "learningOrder": ["node-1", "node-2"],
      "deepDive": {
        "hoverHint": "Short preview shown on ? hover",
        "askPrompts": [
          {
            "title": "Focused follow-up title",
            "prompt": "Concrete, context-anchored deep-dive question (>= 20 chars)…"
          }
        ],
        "subAtlasPrompt": "Use Atlas Loop to dissect \"<Stream Focus>\" in depth (L1+), with parentMapHtml set to \"<current-output.html>\"."
      }
    }
  ],
  "nodes": [
    {
      "id": "node-1",
      "streamIds": ["stream-main"],
      "role": "entry",
      "title": "Node Title",
      "summary": "Concise 1–2 sentence explanation shown on canvas card and inspector",
      "whyItMatters": "Why a learner must grasp this node",
      "keyFactors": {
        "inputs": "Preconditions, triggers, assumptions, or inputs",
        "outputs": "Resulting state, conclusions, or outputs"
      },
      "mechanismsAndEffects": "How it works internally, side effects, or causal transitions",
      "watchouts": "Common misconceptions, edge cases, or constraints",
      "confidence": "verified",
      "unverifiedReason": null,
      "anchors": [],
      "detailGraph": {
        "nodes": [
          {
            "id": "sub-1",
            "role": "core",
            "title": "Internal Step / Sub-concept",
            "summary": "What happens inside",
            "whyItMatters": "Optional",
            "mechanismsAndEffects": "Optional",
            "watchouts": "Optional",
            "confidence": "verified",
            "anchors": []
          }
        ],
        "edges": []
      },
      "deepDive": {
        "hoverHint": "What deeper nuance lies beneath this node",
        "askPrompts": [
          {
            "title": "Specific Inquiry Angle",
            "prompt": "Detailed prompt referencing exact concepts, mechanisms, or file/chapter anchors…"
          }
        ],
        "subAtlasPrompt": "Use Atlas Loop to dissect \"<Node Focus>\" in depth (L1+), with parentMapHtml set to \"<current-output.html>\"."
      }
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "source": "node-1",
      "target": "node-2",
      "label": "Explicit causal, sequential, or branch condition label"
    }
  ]
}
```

## Field Rules

1. **`meta.language` & `meta.uiLabels`**:
   - Built-in dictionaries automatically localize the UI for `zh*` and `en*`.
   - When `meta.language` is another language (e.g. `ja`, `ko`, `es`, `fr`, `de`), populate `meta.uiLabels` with localized strings for keys (`skipToCanvas`, `modelPrefix`, `backParent`, `levelOverview`, `levelSubPrefix`, `allStreams`, `searchLabel`, `searchPlaceholder`, `zoomIn`, `zoomOut`, `lock`, `unlock`, `fitView`, `reset`, `legend`, `scopeNotes`, `learningPath`, `expandDetail`, `collapseDetail`, `detailEdgeLabel`, `deepDiveModalTitle`, `tabAsk`, `tabRecursive`, `copyBtn`, `copiedBtn`, `openInEditor`, `whatItDoes`, `whyItMatters`, `inputsLabel`, `outputsLabel`, `mechanismsLabel`, `watchoutsLabel`, `anchorsLabel`, `openDeepDiveBtn`, `unverifiedTag`, `verifiedTag`, `close`, and `roles`).
2. **7 Universal Cognitive Roles (`node.role`)**:
   - `entry`: Starting point, user action, core question, or trigger.
   - `core`: Primary mechanism, processing step, or main argument.
   - `branch`: Decision point, trade-off, bifurcation, or classification boundary.
   - `foundation`: Underlying principle, mental model, axiom, data store, or config base.
   - `context`: External system, historical/environmental context, or ecosystem dependency.
   - `extension`: Async effect, advanced variation, downstream consequence, or corollary.
   - `outcome`: Final result, takeaway, or target state.
3. **Polymorphic `anchors` (Optional — Use What Fits the Subject)**:
   - Formula / CLI command / mental checklist / quote (`snippet`):
     `{ "kind": "snippet", "label": "Key Formula / Command", "content": "…" }`
   - Web / documentation reference (`link`):
     `{ "kind": "link", "label": "Official Guide", "url": "https://…" }`
   - Book chapter / paper / factual citation (`source`):
     `{ "kind": "source", "label": "Chapter 4, p.112", "citation": "…" }`
   - Local file jump (`editor` — **only when verified local files exist on disk**):
     `{ "kind": "editor", "label": "Entry handler", "filePath": "src/app.ts", "absPath": "/abs/path/src/app.ts", "line": 42, "symbol": "runApp", "editor": "vscode" }`
     (`build_atlas.mjs` verifies `absPath` and `line` exist on disk and computes the encoded `vscode://file/…` or `zed://file/…` URI automatically.)
4. **Edge Labels**:
   - Every top-level edge MUST carry a non-empty `label` explaining the causal link, sequence, or branch condition.
