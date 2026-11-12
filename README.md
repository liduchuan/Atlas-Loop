# Atlas Loop (`@liduchuan/atlas-loop`)

A universal recursive learning-map Agent Skill that dissects **any unfamiliar subject**—a scientific concept, craft, business model, book, software tool, or codebase—into a **standalone, zero-CDN offline interactive HTML atlas**, complete with per-node `?` follow-up and recursive sub-atlas prompts.

## Why Atlas Loop

Learners tackling an unfamiliar topic usually hit two walls: **getting lost in flat walls of detail before grasping the big picture**, and **not knowing what to ask next once the basics make sense**.

`Atlas Loop` closes both gaps in one repeatable loop:

1. **L0 Overview → Inline Detail Drill-Down**: Renders causal streams and a recommended learning path on an `@xyflow/react` + `Dagre` auto-layout canvas. Complex nodes encapsulate an internal `detailGraph` that expands and re-layouts dynamically without overlapping neighbors.
2. **Per-Node `?` Loop Prompts**: Every stream and core node carries an isolated `?` badge (hover to preview nuances, click to open one-click copyable prompts):
   - **Targeted Follow-Up Prompts**: Sharp, context-anchored questions targeting real trade-offs, edge cases, or unverified boundaries—never generic *"Explain X in detail"* filler.
   - **Recursive Sub-Atlas Prompt (`L1` / `L2+`)**: Ready-to-run prompt that promotes the current node into a dedicated child HTML atlas with a header back-link to its parent map.
3. **Dynamic Language Sniffing**: Automatically matches the dominant language of the user's request and target material (or asks first when ambiguous), localizes canvas UI controls accordingly, and preserves technical identifiers, proper nouns, commands, and filenames intact.
4. **Polymorphic Grounding & Honesty**: Clearly distinguishes `verified` facts from `unverified` inferences (with explicit reasons). Supports subject-appropriate anchors—copyable formulas/commands (`snippet`), chapter/paper citations (`source`), external URLs (`link`), or line-verified `vscode://` / `zed://` jumps (`editor`) when local files exist.
5. **Decoupled Synthesis & Headless Verification**: Bundles a pre-compiled offline viewer shell (`file://` ready, zero external requests) so the model focuses purely on deep research and structured JSON, verified end-to-end by headless Playwright before delivery.

## What You Can Dissect

`Atlas Loop` imposes no domain lock-in:

- **Disciplines, Mental Models & Crafts**: e.g., *Espresso Extraction Physics*, *Macroeconomic Rate Transmission*, *Raft Consensus*
- **Books & Long-Form Papers**: Core theses, chapter-by-chapter argument structure, key mental models, and counterexamples
- **Software & CLI Tools**: User-intent workflows, key flags/configs, command compositions, and troubleshooting branches
- **System Architecture & Codebases**: End-to-end business flows, internal call chains, state transitions, and one-click editor jumps to verified local file lines

## Installation

```bash
# Install with the universal Agent Skills CLI
npx skills add @liduchuan/atlas-loop

# Or install directly via the bundled CLI (defaults to ~/.agents/skills/atlas-loop)
npx @liduchuan/atlas-loop install

# Or specify any custom skills directory
npx @liduchuan/atlas-loop install --dir /path/to/skills
```

## Example Prompts

- **L0 Overview**:
  - `Use Atlas Loop to map out the core argument structure of Thinking, Fast and Slow`
  - `Use Atlas Loop to explain how Kubernetes Pod networking works`
  - `Use Atlas Loop to generate an interactive learning map for this project`
- **L1+ Recursive Deep Dive**:
  - Open the generated `.html` file → click `?` on any core node → switch to **Recursive Sub-Atlas**, copy, and send it to your agent to generate a linked child atlas.

## Local Template Runtime (Style & UI Debugging)

`template/` contains the unminified React source (`app.jsx`), stylesheet (`styles.css`), sample dataset (`sample-data.json`), and a live-reload preview server for iterating on visual design:

```bash
# 1. Install dev dependencies once
npm install

# 2. Start the live-reload preview server at http://localhost:5179
#    - Editing template/styles.css hot-swaps CSS in place without losing canvas state
#    - Editing template/app.jsx or sample-data.json rebuilds and reloads automatically
npm run dev

# Optional: preview with your own AtlasGraphData JSON file or custom port
node template/dev-server.mjs --data /path/to/graph-data.json --port 5180

# 3. Bake your template changes into assets/viewer-shell.html
npm run build:shell
```

## CLI Usage

The agent invokes the bundled synthesis and verification tools automatically inside `/tmp` without touching your working tree. You can also run them directly:

```bash
# 1. Validate AtlasGraphData JSON and synthesize a standalone offline HTML file
npx @liduchuan/atlas-loop build --data /tmp/graph-data.json --out ./topic-atlas.html

# 2. Run headless Playwright assertions (layout, lock/drag, Fit View vs Reset, ? prompts)
npx @liduchuan/atlas-loop verify --html ./topic-atlas.html
```

Canvas semantics enforced by verification:

- **Fit View**: Adjusts viewport pan/zoom only—preserves user-dragged node positions and active stream filters.
- **Reset**: Dedicated button that restores initial Dagre coordinates, initial viewport, collapsed defaults, and all-streams view while clearing search and modals.
- **Lock**: Prevents accidental node dragging while keeping pan, zoom, node inspection, and `?` prompt copying active.

## Repository Layout

```text
Atlas-Loop/
├── package.json              # @liduchuan/atlas-loop manifest & dev scripts
├── bin/
│   └── atlas-loop.mjs        # CLI (install, dev, build, verify)
├── SKILL.md                  # Trigger rules, language sniffing, grounding rules, and execution workflow
├── template/
│   ├── app.jsx               # Unminified React + @xyflow/react UI source
│   ├── styles.css            # Design tokens & restrained monochrome stylesheet
│   ├── sample-data.json      # Rich sample dataset for local preview
│   ├── dev-server.mjs        # Live-reload HTTP server (CSS hot-swap + JS rebuild)
│   └── build-shell.mjs       # Compiles template into assets/viewer-shell.html
├── references/
│   └── schema.md             # AtlasGraphData v2 JSON schema and polymorphic anchor specification
├── assets/
│   └── viewer-shell.html     # Pre-compiled standalone React + @xyflow/react + Dagre offline shell
└── scripts/
    ├── build_atlas.mjs       # Schema validation, local file/line verification, URI encoding, secret scan & HTML synthesis
    └── verify_atlas.mjs      # Isolated /tmp headless Playwright verification suite
```

## License

MIT
