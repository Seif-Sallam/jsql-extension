## JSql Syntax Highlighting (VS Code)

SQL + Jinja2 highlighting, formatting, and keyword diagnostics for **JSql-style SQL blocks embedded in Python**.

### What it does

- **Highlights SQL inside Python triple-quoted strings** (`'''...'''` / `"""..."""`) when the content looks like SQL (e.g., starts with `SELECT`, `WITH`, `INSERT`, etc.).
- **Highlights Jinja2** inside those SQL blocks (`{# ... #}`, `{% ... %}`, `{{ ... }}`).
- **Warns on likely-misspelled ALL-CAPS SQL keywords**, with a “did you mean …?” suggestion.
- **Formats SQL in-place** (uppercase keywords, splits clauses to lines, expands long `SELECT` lists, formats `CASE` blocks, and more).
- **Includes a small set of highlight themes** you can switch between.

### Install (local/dev)

This repo is a minimal local extension (no publishing workflow included here). To run it:

1. Open the folder in VS Code.
2. Press `F5` to launch an **Extension Development Host** window.
3. In the dev host, open a Python file and add a JSql block (examples below).

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

### Build a `.vsix` (GitHub Actions)

This repo includes a workflow at `.github/workflows/package-vsix.yml` that packages a `.vsix` on every push and PR.

Steps:

1. Push your changes to GitHub.
2. Open your repo in GitHub → **Actions** tab → select **Package VSIX**.
3. Open the latest run and download the artifact named **`jsql-syntax-vsix`**.
4. Extract it to get `jsql-syntax.vsix`, then install it via **Extensions: Install from VSIX...** in VS Code.

### Usage

Create a Python triple-quoted string whose contents start with SQL:

```python
query = """
WITH users AS (
    SELECT id, email
    FROM app.users
)
SELECT u.id, u.email
FROM users u
WHERE u.email ILIKE :email
  {% if condition %}
  AND u.condition = :condition
  {% endif %}
"""
```

The extension recognizes SQL blocks by scanning triple-quoted strings and checking whether the string (optionally after leading comments) begins with one of:

- `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- `WITH`
- `CREATE`, `ALTER`, `DROP`

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
- **Triple-quoted strings only**: it highlights SQL inside `'''...'''` and `"""..."""` blocks.
- **Heuristic detection**: a block is treated as SQL only if it “looks like SQL” at the start (after optional leading comments). If your SQL begins with something else, it won’t activate.
- **Not a full SQL parser**: highlighting/formatting are pragmatic and optimized for readability in embedded-query workflows.

### Repo contents

- `extension.js`: the VS Code extension implementation (decorations, diagnostics, formatter, theme picker).
- `syntaxes/sql-jinja.tmLanguage.json`: a TextMate grammar for SQL + Jinja (currently not wired via `package.json` contributions).
- `syntaxes/injection.tmLanguage.json`: a sample injection grammar targeting Python multi-line strings.

### License

Unlicensed / internal use (add a LICENSE file if you plan to share or publish).
