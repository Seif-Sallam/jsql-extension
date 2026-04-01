# This entire thing is vibe-coded btw, it may contain some weird stuff, but it is mostly right

# JSql Syntax Highlighting (VS Code)

SQL + Jinja2 highlighting, formatting, and keyword diagnostics for **JSql-style SQL blocks embedded in Python**.

## What it does

- **Highlights SQL inside Python triple-quoted strings** (`'''...'''` / `"""..."""`) when the content looks like SQL (e.g., starts with `SELECT`, `WITH`, `INSERT`, etc.).
- **Highlights Jinja2** inside those SQL blocks (`{# ... #}`, `{% ... %}`, `{{ ... }}`).
- **Warns on likely-misspelled ALL-CAPS SQL keywords**, with a “did you mean …?” suggestion.
- **Formats SQL in-place** (uppercase keywords, splits clauses to lines, expands long `SELECT` lists, formats `CASE` blocks, and more).
- **Includes a small set of highlight themes** you can switch between.

## Install (local/dev)

Run this command in a terminal that has the file: `jsql-syntax.vsix`

```bash
code --install-extension jsql-syntax.vsix
```

or if you have cursor

```bash
cursor --install-extension jsql-syntax.vsix
```

Reload the window if you haven't already!.

### Another way

Use the UI:

1. CMD + SHIFT + P to open the menu, and search for `Extensions: Install From VSIX`
2. Then select the extension file.


### Build a `.vsix` (local)

From the repo root:

```bash
npx --yes @vscode/vsce@3.3.0 package --out jsql-syntax.vsix --allow-star-activation --allow-missing-repository
```

Then install the generated file in VS Code:

- Command Palette → **Extensions: Install from VSIX...** → select `jsql-syntax.vsix`

### Formatter Playground And Tests

From the repo root:

```bash
npm test
npm run playground
```

Useful playground variants:

```bash
npm run playground -- --case union-comments
npm run playground -- --file ./sample.sql
cat ./sample.sql | npm run playground -- --stdin
```

The test runner uses Node's built-in `assert` module and covers formatter regressions such as `UNION` spacing, `SELECT` list expansion, `CASE` formatting, and SQL-range detection inside Python triple-quoted strings.

### Usage

* After putting your cursor on a SQL block, you can use the command `JSql: Format SQL` and it would be formatting it to a nice format.
* You can also change the theme using the command `JSql: Change theme` and choose from the available themes.
* Warnings will come off with these simple errors:
   * Bad keyword spelling
   * Missing commas in the SELECT c1, c2, c3 statements
   * Missing closing brackets

### Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

- **`JSql: Format SQL`** (`jsqlSyntax.formatSQL`)
  - Formats the SQL block **your cursor is currently inside** (inside a recognized triple-quoted SQL string).
- **`JSql: Select Theme`** (`jsqlSyntax.selectTheme`)
  - Previews available highlight themes and saves your selection.

### Configuration

- **`jsqlSyntax.theme`**: `"dracula" | "monokai" | "one-dark"` (default: `"dracula"`)

You can set it in Settings UI or in `settings.json`:

```json
{
  "jsqlSyntax.theme": "one-dark"
}
```

### Notes & limitations

- **Python-only**: the extension currently applies to files where VS Code’s language mode is `python`.
- **Triple-quoted strings only**: it highlights SQL inside `'''...'''` and `"""..."""` blocks, anything smaller than that that fits in one line is not really worth it.
- **Heuristic detection**: a block is treated as SQL only if it “looks like SQL” at the start (after optional leading comments). If your SQL begins with something else, it won’t activate.
- **Not a full SQL parser**: highlighting/formatting are pragmatic and optimized for readability in embedded-query workflows.

### Repo contents

- `extension.js`: the VS Code extension implementation (decorations, diagnostics, formatter, theme picker).
- `syntaxes/sql-jinja.tmLanguage.json`: a TextMate grammar for SQL + Jinja (currently not wired via `package.json` contributions).
- `syntaxes/injection.tmLanguage.json`: a sample injection grammar targeting Python multi-line strings.

### License

MIT (Just because anyone can do anything basically)
