# AtlasLoop

A universal recursive learning-map Agent Skill that dissects **any unfamiliar subject**—a scientific concept, craft, business model, book, software tool, or codebase—into a **standalone, zero-CDN offline interactive HTML atlas**, complete with per-node `?` follow-up and recursive sub-atlas prompts.

## Why AtlasLoop

Learners tackling an unfamiliar topic usually hit two walls: **getting lost in flat walls of detail before grasping the big picture**, and **not knowing what to ask next once the basics make sense**.

`AtlasLoop` closes both gaps in one repeatable loop:

1. **L0 Overview → Inline Detail Drill-Down**: Renders causal streams and a recommended learning path on an `@xyflow/react` + `Dagre` auto-layout canvas. Complex nodes encapsulate an internal `detailGraph` that expands and re-layouts dynamically without overlapping neighbors.
2. **Per-Node `?` Loop Prompts**: Every stream and core node carries an isolated `?` badge (hover to preview nuances, click to open one-click copyable prompts):
   - **Targeted Follow-Up Prompts**: Sharp, context-anchored questions targeting real trade-offs, edge cases, or unverified boundaries—never generic *"Explain X in detail"* filler.
   - **Recursive Sub-Atlas Prompt (`L1` / `L2+`)**: Ready-to-run prompt that promotes the current node into a dedicated child HTML atlas with a header back-link to its parent map.
3. **Dynamic Language Sniffing**: Automatically matches the dominant language of the user's request and target material (or asks first when ambiguous), localizes canvas UI controls accordingly, and preserves technical identifiers, proper nouns, commands, and filenames intact.
4. **Polymorphic Grounding & Honesty**: Clearly distinguishes `verified` facts from `unverified` inferences (with explicit reasons). Supports subject-appropriate anchors—copyable formulas/commands (`snippet`), chapter/paper citations (`source`), external URLs (`link`), or line-verified `vscode://` / `zed://` jumps (`editor`) when local files exist.
5. **Decoupled Synthesis & Headless Verification**: Bundles a pre-compiled offline viewer shell (`file://` ready, zero external requests) so the model focuses purely on deep research and structured JSON, verified end-to-end by headless Playwright before delivery.

## What You Can Dissect

`AtlasLoop` imposes no domain lock-in:

- **Disciplines, Mental Models & Crafts**: e.g., *Espresso Extraction Physics*, *Macroeconomic Rate Transmission*, *Raft Consensus*
- **Books & Long-Form Papers**: Core theses, chapter-by-chapter argument structure, key mental models, and counterexamples
- **Software & CLI Tools**: User-intent workflows, key flags/configs, command compositions, and troubleshooting branches
- **System Architecture & Codebases**: End-to-end business flows, internal call chains, state transitions, and one-click editor jumps to verified local file lines

## Repository Layout

```text
Atlas-Loop/
├── SKILL.md                  # Trigger rules, language sniffing, grounding rules, and execution workflow
├── references/
│   └── schema.md             # AtlasGraphData v2 JSON schema and polymorphic anchor specification
├── assets/
│   └── viewer-shell.html     # Pre-compiled standalone React + @xyflow/react + Dagre offline shell
└── scripts/
    ├── build_atlas.mjs       # Schema validation, local file/line verification, URI encoding, secret scan & HTML synthesis
    └── verify_atlas.mjs      # Isolated /tmp headless Playwright verification suite
```

## Installation & Usage

### 1. Install the Skill

**Enconvo**

```bash
git clone https://github.com/liduchuan/Atlas-Loop.git ~/.enconvo/skills/atlas-loop
```

*(For Claude Code, Codex, or other `SKILL.md`-compatible agents, clone into the corresponding `skills/atlas-loop` directory.)*

### 2. Example Prompts

- **L0 Overview**:
  - `Use AtlasLoop to map out the core argument structure of Thinking, Fast and Slow`
  - `Use AtlasLoop to explain how Kubernetes Pod networking works`
  - `Use AtlasLoop to generate an interactive learning map for this project`
- **L1+ Recursive Deep Dive**:
  - Open the generated `.html` file → click `?` on any core node → switch to **Recursive Sub-Atlas Prompt**, copy, and send it to your agent to generate a linked child atlas.

## CLI Scripts

The agent runs these scripts automatically inside `/tmp` without touching your working tree, and you can also invoke them directly:

```bash
# 1. Validate AtlasGraphData JSON and synthesize a standalone offline HTML file
node scripts/build_atlas.mjs --data /tmp/graph-data.json --out ./topic-atlas.html

# 2. Run headless Playwright assertions (layout, lock/drag, Fit View vs Reset, ? prompts)
node scripts/verify_atlas.mjs --html ./topic-atlas.html
```

Canvas semantics enforced by verification:

- **Fit View**: Adjusts viewport pan/zoom only—preserves user-dragged node positions and active stream filters.
- **Reset**: Dedicated button that restores initial Dagre coordinates, initial viewport, collapsed defaults, and all-streams view while clearing search and modals.
- **Lock Nodes**: Prevents accidental node dragging while keeping pan, zoom, node inspection, and `?` prompt copying active.
