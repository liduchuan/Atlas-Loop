---
name: atlas-loop
description: Dissect any unfamiliar subject—a discipline, mental model, craft, book, software tool, protocol, business model, or local project—into a standalone offline interactive HTML learning map (Atlas Loop) with overview-to-detail drill-down and per-node "?" deep-dive & recursive sub-atlas prompts. Trigger whenever the user wants to learn, break down, map out, or recursively explore any topic or codebase as an interactive visual map.
---

# Atlas Loop

Turn any subject worth learning into a single-file, zero-CDN interactive `@xyflow/react` HTML atlas that pairs **big-picture causal structure** with **drill-down internals**, **verifiable anchors**, and **per-node `?` recursive inquiry prompts**.

## 1. Sniff Language & Clarify Scope

1. **Sniff Language Dynamically (Never Hardcode)**:
   - Use the language the user explicitly requests.
   - Otherwise, sniff the dominant language of the user's prompt and target material; when they align, use that language for all explanations and UI labels while keeping technical identifiers, proper nouns, commands, and original filenames intact.
   - **Ask When Ambiguous**: If the user's request language conflicts with the target material or is too terse to tell, ask the user which output language they prefer before generating.
2. **Unrestricted Subject Matter**:
   - A target can be any unfamiliar subject: a scientific concept, craft, historical event, book, paper, CLI/software workflow, system architecture, or local project.
   - Focus strictly on the subject's domain concepts, causal mechanisms, and primary source materials—never collect or mention version-control repository state.
3. **Determine Recursion Level (`L0` vs `L1+`)**:
   - **L0 Overview** (no `drillDownTarget`): Map the subject's primary streams end-to-end (`entry → core mechanisms → branches/trade-offs → foundations/context → outcomes`), including important failure modes, counterexamples, or exceptions. List omitted areas honestly in `meta.uncoveredScopes`.
   - **L1+ Focused Sub-Atlas** (`drillDownTarget` specified): Root the entire map on that specific node or sub-topic, unpacking its internal states, edge cases, step-by-step mechanics, and boundary contracts. Set `meta.level` (`1`, `2`, ...) and `meta.parentMapHtml` (if known) so the header renders a clickable back-link to the parent atlas.

## 2. Research & Author `AtlasGraphData` JSON

Read [`references/schema.md`](references/schema.md) for exact field rules before writing JSON.

1. **Ground Every Claim**:
   - Inspect primary evidence first (actual files when local files exist; authoritative docs, text, or domain principles otherwise).
   - Mark solidly supported nodes `"confidence": "verified"`. Whenever a relationship, runtime binding, edition nuance, or cross-chapter inference cannot be 100% confirmed from available evidence, set `"confidence": "unverified"`, populate `unverifiedReason`, and summarize in `meta.unverifiedNotes`. Never fabricate paths, line numbers, citations, or URLs.
   - Attach polymorphic `anchors` only as appropriate to the subject: `snippet` (formulas, commands, checklists), `source` (citations, chapters), `link` (reference URLs), or `editor` (verified local `absPath` + `line` for `vscode` or `zed`, never plain `file://`).
2. **Design Two-Layer Clarity**:
   - Keep the overview readable by grouping flows into `streams` with an ordered `learningOrder`.
   - Place finer internal steps, sub-arguments, or call chains inside each complex node's `detailGraph` (`nodes` + `edges`) so learners can expand into internals and collapse back.
3. **Author High-Signal `?` Loop Prompts (`deepDive`)**:
   - Attach `deepDive` to streams and core/complex nodes so learners never get stuck wondering *what to ask next*:
     - `hoverHint`: 1 short sentence naming the hidden complexity or nuance beneath this node.
     - `askPrompts`: 1–2 razor-sharp follow-up questions anchored to the node's exact mechanisms, edge cases, trade-offs, or `unverified` items (with exact file:line, command, or chapter anchors when applicable). **Never write generic filler like "Explain X in detail."**
     - `subAtlasPrompt`: A ready-to-copy recursive prompt naming this node as the new `drillDownTarget` and referencing the current output HTML filename as `parentMapHtml`.
4. **Embed Active Model Name**:
   - Set `meta.generatedByModel` directly to your own active model name—never add config flags or environment-probing code for it.

## 3. Build & Verify in Isolated `/tmp` Workspace

Run all intermediate files in `/tmp/atlas-loop-<timestamp>/` so the user's working directory stays completely clean:

1. **Compile Standalone HTML**:
   ```bash
   node <skill_dir>/scripts/build_atlas.mjs --data /tmp/atlas-loop-<ts>/graph-data.json --out <output_html>
   ```
   - Default filename when `--out` is omitted: `<safe-subject>-atlas.html` (L0) or `<safe-subject>-sub-<safe-target>-atlas.html` (L1+).
   - Fix any schema, line-number, or secret-scan error reported by `build_atlas.mjs`.
2. **Run Headless Playwright Verification**:
   ```bash
   node <skill_dir>/scripts/verify_atlas.mjs --html <output_html>
   ```
   - Must pass all checks: zero `pageerror`, non-zero bounding boxes, zero severe node overlaps, zoom/pan, lock/unlock drag protection, `detailGraph` expand/collapse, `?` tooltip + dual-tab prompt copy, and strict separation between **Fit View** (viewport-only) and **Reset** (full restore to initial positions, filters, and collapsed state).
3. **Clean Up & Deliver**:
   - Remove the temporary `/tmp/atlas-loop-<ts>/` folder.
   - Deliver the generated `.html` file and report concisely: output path, language & level (`L0` or `L1+`), active model, covered streams, representative `?` deep-dive directions, Playwright verification result (if `editor` anchors were generated without desktop launch testing, note that OS editor launch itself was not desktop-tested), and any `uncoveredScopes` or `unverifiedNotes`.

*(For UI customization or stylesheet debugging on the canvas template itself, run `node <skill_dir>/template/dev-server.mjs` for live reload and `node <skill_dir>/template/build-shell.mjs` to rebuild `assets/viewer-shell.html`.)*
