# Atlas Loop (`@liduchuan/atlas-loop`)

[简体中文](README.md) | [English](README.en.md)

Atlas Loop is a general-purpose recursive learning-map Agent Skill for lifelong learners. It breaks down **any unfamiliar topic**—a scientific concept, craft, business model, book, software tool, or codebase—into a **standalone, interactive HTML map that works offline without a CDN**. It adapts the depth of the material to the learner's progress (2–6 levels) and gives every node a `↳` follow-up prompt and a prompt for generating a recursive submap.

## Why Atlas Loop?

Learning an unfamiliar topic often presents two obstacles: **getting lost in details before seeing the whole picture**, and **not knowing what to ask next after understanding the basics**. As your knowledge grows, a static tutorial soon becomes either too shallow or too large a leap.

`Atlas Loop` addresses these problems through nested learning loops:

1. **Depth adapts to you, and knowledge carries forward**: How deeply a map explains a topic depends on the learner's accumulated level, rather than the topic's size. `Atlas Loop` records a five-point post-learning self-assessment (`2/4/6/8/10`) and a catalog of completed maps in a private profile at `~/.atlas-loop/profile.json`. It organizes progress by `domain/profession/specialization` and tracks each model separately. When you create another map in the same domain, it uses that history to set the depth of the learning ladder (`2–6 levels`) and build on concepts you already know. You can also generate a standalone, offline **personal progress dashboard** (`dashboard`) at any time to see your learning curve, knowledge shelf, and queue of topics to explore.
2. **L0 overview → drill down in place**: An automatically laid out `@xyflow/react` + `Dagre` canvas shows the structure of a topic and a recommended learning path, including explicitly marked `feedback` loop edges. Complex nodes contain a `detailGraph` that relayouts dynamically when expanded so it does not overlap neighboring nodes.
3. **A `↳` learning loop for each node**: Every learning thread and core node has its own `↳` badge. Hover to preview a subtle point; click to open a prompt you can copy in one step:
   - **Targeted follow-up prompt**: A precise question grounded in context that points to a real trade-off, a turning point in understanding, or an unverified boundary—never generic filler such as “Explain X in detail.”
   - **Recursive submap prompt (`L1` / `L2+`)**: A ready-to-use prompt that turns the current node into its own HTML map. The `link` command writes the submap link back to the parent map so you can navigate between them.
4. **Dynamic language detection**: Matches the dominant language of the user's request and source material, asking when it is ambiguous. Canvas controls are localized while technical identifiers, proper names, commands, and filenames are preserved.
5. **Evidence in multiple forms, labeled honestly**: Distinguishes `verified` facts from `unverified` inferences and states why an inference is unverified. Depending on the topic, anchors can be copyable formulas, commands, or code (`snippet`, with lazy syntax highlighting based on `language`); chapter or paper citations (`source`); external URLs (`link`); or `vscode://` / `zed://` links to line-verified local files (`editor`).
6. **Separate synthesis and headless verification**: A prebuilt offline viewer shell opens directly with `file://` and makes no external requests. This lets the model focus on research and structured JSON. Headless Playwright then runs end-to-end checks before delivery.

## What can it map?

`Atlas Loop` is not limited to a particular field:

- **Subjects, mental models, and crafts**: For example, *espresso extraction physics*, *interest-rate transmission in macroeconomics*, or *Raft consensus*.
- **Books and long papers**: Core arguments, chapter-by-chapter reasoning, key mental models, and counterexamples.
- **Software and CLI tools**: Workflows organized by user intent, important options and configuration, command combinations, and troubleshooting paths.
- **System architectures and codebases**: End-to-end business flows, internal call chains, state transitions, and editor links that jump to verified lines in local files.

## Installation

```bash
# Install into the current project with the general Agent Skills CLI
npx skills add liduchuan/Atlas-Loop

# Install globally (into each Agent's user-level skills directory)
npx skills add liduchuan/Atlas-Loop -g

# Or install directly with the built-in CLI (defaults to ~/.agents/skills/atlas-loop)
npx @liduchuan/atlas-loop install

# Or specify a custom skills directory
npx @liduchuan/atlas-loop install --dir /path/to/skills
```

## Example prompts

- **L0 overview**:
  - `Use Atlas Loop to map the core arguments of Thinking, Fast and Slow`
  - `Use Atlas Loop to explain how Kubernetes Pod networking works`
  - `Use Atlas Loop to make an interactive learning map for this project`
- **L1+ recursive exploration**:
  - Open the generated `.html` file → click `↳` on any core node → switch to **Generate a recursive submap**, copy the prompt, and send it to your Agent. The resulting submap will link back to its parent.

## Local template runtime (styling and UI development)

`template/` contains unminified React source (`app.jsx`), a stylesheet (`styles.css`), sample datasets (`sample-data.json`), and a live-reload preview server for visual design work:

```bash
# 1. Install development dependencies once
npm install

# 2. Start the live-reload preview server: http://localhost:5179
#    - Changes to template/styles.css are hot-replaced without losing canvas state
#    - Changes to template/app.jsx or sample-data.json rebuild and refresh automatically
npm run dev

# Optional: preview a shallow map (depth <= 2, search and minimap collapsed, feedback loop edge)
node template/dev-server.mjs --data template/sample-data-simple.json

# Optional: preview your own AtlasGraphData JSON file or use a custom port
node template/dev-server.mjs --data /path/to/graph-data.json --port 5180

# 3. Compile template changes into assets/viewer-shell.html
npm run build:shell

# 4. Run regression tests for the learner profile and build/pack pipeline
npm test

# 5. Verify all sample maps (build_atlas + verify_atlas) and run Playwright E2E tests
npm run verify:samples
npm run test:e2e
```

## CLI usage

The Agent automatically runs the built-in synthesis and verification tools in the system temporary directory, leaving your working directory clean. You can run them directly as well:

```bash
# 1. Validate AtlasGraphData JSON and build a standalone offline HTML file
npx @liduchuan/atlas-loop build --data /tmp/graph-data.json --out ./topic-atlas.html

# 2. Run headless Playwright assertions (depth badge, reader level, storage boundaries,
#    layout, lock/drag, Fit View vs Reset, ↳ prompts, and full-map PNG export)
npx @liduchuan/atlas-loop verify --html ./topic-atlas.html

# 3. Write an L1+ submap link back into the parent and recompile the parent
npx @liduchuan/atlas-loop link --parent ./topic-atlas.html --child ./sub-atlas.html --node n-core

# 4. Package a parent and all recursive submaps from disk into an offline ZIP
#    (preserving all syntax-highlighting assets)
npx @liduchuan/atlas-loop pack --entry ./topic-atlas.html --out ./topic-bundle.zip

# 5. Inspect the learner profile, catalog maps, or generate an offline personal progress dashboard
npx @liduchuan/atlas-loop profile list
npx @liduchuan/atlas-loop dashboard --out ~/.atlas-loop/dashboard.html
```

Canvas behavior enforced by the verifier:

- **Fit View**: Adjusts only viewport pan and zoom, preserving dragged node positions and the current thread filter.
- **Reset**: A separate button restores initial Dagre coordinates, the initial viewport, default collapsed state, all-thread view, and default lock. It also clears search, collapses the minimap, and closes dialogs.
- **Lock**: Node dragging is locked by default. Unlock to drag nodes; panning, zooming, viewing nodes, and copying `↳` prompts are always available.
- **Export PNG**: Exports a canvas containing the full bounding box of every node in the current flow. It temporarily fits the view and then restores your previous viewport.
- **Export ZIP**: In an HTTP preview, it can recursively collect parent and child maps. Under local `file://`, browser security restrictions limit it to the current map and show a nonblocking notice. Use `atlas-loop pack` for an offline bundle with multiple maps.

## Repository structure

```text
Atlas-Loop/
├── package.json              # @liduchuan/atlas-loop manifest and development scripts
├── bin/
│   └── atlas-loop.mjs        # CLI (install, dev, build, verify, link, pack, profile, dashboard)
├── SKILL.md                  # Trigger rules, language detection, learning ladder, and workflow
├── template/
│   ├── app.jsx               # Unminified React + @xyflow/react UI source
│   ├── styles.css            # Design tokens and restrained monochrome stylesheet
│   ├── snippet-highlight.js  # Lazy highlight.js module loader
│   ├── snippet-lang.mjs      # Snippet language heuristics shared by viewer and builder
│   ├── sample-data.json      # Deep sample map (3 levels, detailGraph and submap links)
│   ├── sample-data-simple.json # Shallow sample map (2 levels, compact canvas and feedback edge)
│   ├── sample-data-child.json  # L1 submap sample (3 levels)
│   ├── sample-data-highlight.json # Syntax highlighting sample
│   ├── dev-server.mjs        # Live-reload HTTP server (CSS hot replacement + JS rebuild)
│   └── build-shell.mjs       # Compile the template into assets/viewer-shell.html
├── references/
│   └── schema.md             # AtlasGraphData v2 JSON schema, feedback edges, and anchor types
├── assets/
│   ├── viewer-shell.html     # Prebuilt standalone offline shell (React + @xyflow/react + Dagre)
│   └── hljs/                 # Split highlight.js core and on-demand language modules
└── scripts/
    ├── build_atlas.mjs       # Schema/depth validation, line verification, secret scan, HTML synthesis
    ├── verify_atlas.mjs      # Headless Playwright verification suite
    ├── link_child.mjs        # Write a submap link into the parent and rebuild it
    ├── pack_atlas.mjs        # Offline multi-map ZIP packer
    ├── profile.mjs           # Learner profile, knowledge catalog, and dashboard generation
    ├── test_profile.mjs      # Regression tests for profile.mjs
    └── test_pipeline.mjs     # Build/link/pack/installation compatibility tests
```

## License

MIT
