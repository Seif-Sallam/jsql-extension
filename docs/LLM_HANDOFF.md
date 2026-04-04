# LLM Handoff

This file is a focused handoff for another LLM that already knows the project at a high level and needs the current post-refactor map of the codebase.

## Summary

The extension started as one large `extension.js` file. The code has now been split into smaller modules under `src/`, but the root [extension.js](../extension.js) remains the published entrypoint so `package.json` did not need to change.

Root entrypoint today:

```js
module.exports = require('./src/extension');
```

The split was done to:

- preserve the extension entrypoint expected by VS Code
- move pure SQL logic into testable modules
- separate formatting, semantic analysis, and shared lexical helpers
- keep the test harness independent from the full VS Code runtime

## Where To Start

If you are trying to understand the active runtime, start here in this order:

1. [src/extension.js](../src/extension.js)
2. [src/sql/formatter.js](../src/sql/formatter.js)
3. [src/sql/semantic.js](../src/sql/semantic.js)
4. [src/sql/diagnostics.js](../src/sql/diagnostics.js)
5. [src/sql/shared.js](../src/sql/shared.js)
6. [src/sql/highlighting.js](../src/sql/highlighting.js)
7. [src/schema/metadata.js](../src/schema/metadata.js)
8. [scripts/load-formatter.js](../scripts/load-formatter.js)

## Active Module Map

### Entry points

- [package.json](../package.json)
  - `main` still points to root `extension.js`.
- [extension.js](../extension.js)
  - thin wrapper only
- [src/extension.js](../src/extension.js)
  - real runtime entrypoint
  - owns activation, command/provider registration, diagnostics, schema refresh logic, and imports the welcome webview HTML from `src/ui/welcome.js`

### SQL logic

- [src/sql/shared.js](../src/sql/shared.js)
  - low-level reusable helpers
  - source of truth for:
    - `ALL_SQL_KEYWORDS`
    - `levenshtein`
    - `findClosestKeyword`
    - `matchKeyword`
    - `splitTopLevelCommas`
    - `isJinjaControlTag`
    - `buildOpaqueMask`

- [src/sql/formatter.js](../src/sql/formatter.js)
  - pure formatting and SQL-block helpers
  - source of truth for:
    - `formatSQL`
    - `findSQLRanges`
    - `buildFormattedSQLBlock`
    - `detectUnionCommentAdjacency`
    - `findMatchingBracket`
    - `findUnmatchedBrackets`

- [src/sql/highlighting.js](../src/sql/highlighting.js)
  - regex tables used for token coloring
  - source of truth for:
    - `SPECIFIC_PATTERNS_SQL`
    - `SPECIFIC_PATTERNS_BQ`
    - `IDENT_RE`
    - `CAPS_WORD_RE`

- [src/sql/semantic.js](../src/sql/semantic.js)
  - schema-aware query analysis and semantic entity range detection
  - source of truth for:
    - `findCTENames`
    - `findTableReferences`
    - `findQualifiedReferences`
    - `findSemanticWarnings`
    - `findSemanticEntityRanges`
    - `rangeOverlapsOpaque`

- [src/sql/diagnostics.js](../src/sql/diagnostics.js)
  - structural diagnostics and query-shape checks
  - source of truth for:
    - `detectAmbiguousColumns`
    - `detectDuplicateAliases`
    - `detectMissingSelectCommas`

### Schema logic

- [src/schema/metadata.js](../src/schema/metadata.js)
  - parses Python model files and builds schema metadata
  - source of truth for:
    - `createEmptySchemaMetadata`
    - `isWorkspaceRelativeGlobPattern`
    - `findClosestName`
    - `mergeSchemaMetadata`
    - `parseTableDefinitionFile`

### Theme / UI helpers

- [src/theme.js](../src/theme.js)
  - active theme/decorations source of truth
  - exports `THEMES`, `buildDecorations(vscode, themeName)`, and `createBracketDecorations(vscode)`

- [src/ui/welcome.js](../src/ui/welcome.js)
  - contains `createWelcomeHtml(nonce)`
  - active source of truth for the welcome webview markup

## Current Dependency Shape

- `src/extension.js`
  - imports from `sql/formatter`
  - imports from `sql/highlighting`
  - imports from `sql/diagnostics`
  - imports from `sql/semantic`
  - imports from `sql/shared`
  - imports from `schema/metadata`
  - imports from `theme`

- `src/sql/formatter.js`
  - imports from `sql/shared`

- `src/sql/highlighting.js`
  - pure constants only

- `src/sql/diagnostics.js`
  - imports from `sql/shared`
  - imports from `sql/semantic`
  - imports from `schema/metadata`

- `src/sql/semantic.js`
  - imports from `sql/shared`
  - imports from `schema/metadata`

- `src/schema/metadata.js`
  - imports `levenshtein` from `sql/shared`

`src/sql/shared.js` is intentionally the low-level dependency that many modules build on.

## Important Symbol Locations

- `formatSQL`: [src/sql/formatter.js](../src/sql/formatter.js)
- `findSQLRanges`: [src/sql/formatter.js](../src/sql/formatter.js)
- `buildFormattedSQLBlock`: [src/sql/formatter.js](../src/sql/formatter.js)
- `findMatchingBracket`: [src/sql/formatter.js](../src/sql/formatter.js)
- `findUnmatchedBrackets`: [src/sql/formatter.js](../src/sql/formatter.js)
- `buildOpaqueMask`: [src/sql/shared.js](../src/sql/shared.js)
- `splitTopLevelCommas`: [src/sql/shared.js](../src/sql/shared.js)
- `isJinjaControlTag`: [src/sql/shared.js](../src/sql/shared.js)
- `ALL_SQL_KEYWORDS`: [src/sql/shared.js](../src/sql/shared.js)
- `CAPS_WORD_RE`: [src/sql/highlighting.js](../src/sql/highlighting.js)
- `IDENT_RE`: [src/sql/highlighting.js](../src/sql/highlighting.js)
- `SPECIFIC_PATTERNS_SQL`: [src/sql/highlighting.js](../src/sql/highlighting.js)
- `SPECIFIC_PATTERNS_BQ`: [src/sql/highlighting.js](../src/sql/highlighting.js)
- `findSemanticWarnings`: [src/sql/semantic.js](../src/sql/semantic.js)
- `findSemanticEntityRanges`: [src/sql/semantic.js](../src/sql/semantic.js)
- `detectAmbiguousColumns`: [src/sql/diagnostics.js](../src/sql/diagnostics.js)
- `detectDuplicateAliases`: [src/sql/diagnostics.js](../src/sql/diagnostics.js)
- `detectMissingSelectCommas`: [src/sql/diagnostics.js](../src/sql/diagnostics.js)

## Runtime Flow In `src/extension.js`

The activation flow still looks like this:

1. build token/bracket decorations
2. create a diagnostic collection
3. initialize schema metadata state:
   - `globalMetadata`
   - `scopedMetadataMap`
   - refresh version/timer bookkeeping
4. register schema config readers and metadata loading helpers
5. define `applyDecorations(editor)`
6. register commands
7. register formatting/definition/hover/rename/completion providers
8. subscribe to configuration/editor/document events
9. apply initial decorations and schedule schema refresh

The core runtime work still happens in `applyDecorations(editor)`:

- detect SQL ranges inside Python documents
- apply regex-based highlighting patterns
- overlay semantic table/column/alias ranges
- create diagnostics
- compute bracket match/error decorations

## Test Surface

The tests no longer need to load the whole extension runtime.

- [scripts/load-formatter.js](../scripts/load-formatter.js)
  - pulls pure helpers directly from the extracted modules
  - this is the compatibility layer for tests and the formatter playground

- [scripts/test.js](../scripts/test.js)
  - formatter/helper regression suite

- [scripts/playground.js](../scripts/playground.js)
  - lightweight CLI playground for `formatSQL`

If pure-module exports change, update `scripts/load-formatter.js` too.

## Installer Script

- [scripts/install-extension.sh](../scripts/install-extension.sh)
  - local development installer
  - installs into VS Code, Cursor, or both using a VSIX package
  - can use a CI-built/prebuilt VSIX artifact
  - can build a fresh VSIX locally with `vsce`
  - skips missing editors
  - passes `--force` through to the editor CLI when requested

This is both a local-dev installer and a lightweight packaging helper.

How it works internally:

1. enables `set -euo pipefail` so failures are surfaced immediately
2. reads CLI arguments:
   - `vscode`
   - `cursor`
   - `both` (default)
   - `--force` / `-f`
   - `--build`
   - `--package-only`
   - `--vsix <path>`
3. resolves `SCRIPT_DIR` and `REPO_DIR` so it can be run from any working directory
4. reads `name` and `version` from `package.json`
5. resolves a VSIX in this order:
   - explicit `--vsix <path>`
   - common prebuilt artifact locations in `dist/` or repo root
   - local `vsce` build if `--build` was requested or no artifact exists
6. in package-only mode, prints the VSIX path and exits
7. otherwise dispatches installation to `code` and/or `cursor` using:
   - `--install-extension <path-to-vsix>`
   - plus `--force` when requested

Important behavior:

- it installs a real packaged extension, not a symlinked checkout
- users without npm can still install if a CI-built `.vsix` is already available
- local developers can force a fresh package build with `--build`
- `--package-only` turns the same script into a packaging helper

## Known Drift / Cleanup Candidates

- [src/extension.js](../src/extension.js)
  - still carries a lot of runtime wiring in one file
  - good next split targets are commands, providers, and schema-refresh orchestration

Natural next cleanup steps:

1. keep splitting `src/extension.js` into command/provider-focused modules
2. separate schema-refresh/state management from editor decoration flow
3. consider moving command registration into dedicated modules

## Practical Edit Guide

If you want to change formatting behavior:

- start in [src/sql/formatter.js](../src/sql/formatter.js)
- then check [src/sql/shared.js](../src/sql/shared.js) for lexical helpers

If you want to change schema warnings or semantic token classification:

- start in [src/sql/semantic.js](../src/sql/semantic.js)
- then [src/sql/diagnostics.js](../src/sql/diagnostics.js)
- then [src/schema/metadata.js](../src/schema/metadata.js)

If you want to change highlight regexes or token classifications:

- regex/token sets: [src/sql/highlighting.js](../src/sql/highlighting.js)
- theme colors / decoration types: [src/theme.js](../src/theme.js)

If you want to change commands, hover, rename, completion, or schema loading:

- start in [src/extension.js](../src/extension.js)

If you want to adjust the pure-function test surface:

- [scripts/load-formatter.js](../scripts/load-formatter.js)
- [scripts/test.js](../scripts/test.js)

## Verification After Refactors

Minimum useful check:

```bash
npm test
```

Quick syntax checks:

```bash
node -c src/extension.js
node -c src/sql/formatter.js
node -c src/sql/semantic.js
node -c src/sql/diagnostics.js
```
