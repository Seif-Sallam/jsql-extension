'use strict';

function createWelcomeHtml(nonce) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>JSql Syntax</title>
<style nonce="${nonce}">
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border, #333);
    --card: var(--vscode-sideBar-background, #1e1e1e);
    --btn: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --link: var(--vscode-textLink-foreground);
    --code-bg: var(--vscode-textCodeBlock-background, #0d0d0d);
    --keyword: #8be9fd;
    --func: #ff79c6;
    --table: #f4c56e;
    --col: #82b1ff;
    --alias: #5de3c0;
    --col-alias: #d4aaff;
    --string: #50fa7b;
    --boolean: #ff8585;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, system-ui); font-size: 14px; line-height: 1.6; padding: 0 0 60px 0; }

  .hero { background: linear-gradient(135deg, #1a1b26 0%, #282a36 60%, #1a1b26 100%); padding: 48px 40px 40px; border-bottom: 1px solid var(--border); }
  .hero h1 { font-size: 32px; font-weight: 700; color: #f8f8f2; margin-bottom: 8px; }
  .hero h1 span { color: var(--keyword); }
  .hero p { color: var(--muted); font-size: 15px; max-width: 600px; margin-bottom: 24px; }
  .hero-badges { display: flex; gap: 10px; flex-wrap: wrap; }
  .badge { background: #44475a; color: #f8f8f2; font-size: 12px; padding: 4px 10px; border-radius: 12px; }

  .actions { display: flex; gap: 12px; padding: 24px 40px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; border: none; font-family: inherit; }
  .btn-primary { background: var(--btn); color: var(--btn-fg); }
  .btn-secondary { background: transparent; color: var(--link); border: 1px solid var(--link); }
  .btn:hover { opacity: 0.85; }

  .section { padding: 32px 40px; border-bottom: 1px solid var(--border); }
  .section h2 { font-size: 18px; font-weight: 600; color: #f8f8f2; margin-bottom: 6px; }
  .section .subtitle { color: var(--muted); font-size: 13px; margin-bottom: 20px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
  .card h3 { font-size: 14px; font-weight: 600; color: #f8f8f2; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .card p { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .card .tag { font-size: 11px; background: #44475a; color: #f8f8f2; padding: 2px 6px; border-radius: 4px; margin-left: auto; }

  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; overflow-x: auto; line-height: 1.7; margin: 12px 0; }
  .kw { color: var(--keyword); font-weight: bold; }
  .fn { color: var(--func); }
  .tbl { color: var(--table); }
  .col { color: var(--col); }
  .al { color: var(--alias); }
  .cal { color: var(--col-alias); }
  .str { color: var(--string); }
  .bool { color: var(--boolean); font-weight: bold; }
  .cmt { color: #6272a4; font-style: italic; }
  .prm { color: #ffb86c; }
  .num { color: #f1fa8c; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } .actions { flex-direction: column; } }

  .kbd { display: inline-block; background: #44475a; color: #f8f8f2; border-radius: 3px; padding: 1px 6px; font-size: 12px; font-family: monospace; border: 1px solid #6272a4; }
  .shortcut-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .shortcut-row:last-child { border-bottom: none; }
  .shortcut-row span { color: var(--muted); flex: 1; }

  .token-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; font-family: monospace; }
  .dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
</style>
</head>
<body>

<div class="hero">
  <h1>JSql <span>Syntax</span></h1>
  <p>SQL highlighting, schema intelligence, formatting, and navigation for Python — purpose-built for JSql query patterns with Jinja2 templates.</p>
  <div class="hero-badges">
    <span class="badge">MySQL</span>
    <span class="badge">BigQuery</span>
    <span class="badge">Spanner</span>
    <span class="badge">Jinja2</span>
    <span class="badge">SQLAlchemy</span>
  </div>
</div>

<div class="actions">
  <button class="btn btn-primary" data-command="jsqlSyntax.discoverSchemaSources">🔍 Discover Schema Sources</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.manageScopes">⚙ Manage Scopes</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.selectTheme">🎨 Select Theme</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.formatSQL">⌥⇧F Format SQL</button>
</div>

<div class="section">
  <h2>Syntax Highlighting</h2>
  <p class="subtitle">Every token type in your SQL gets its own color. Works inside <code>"""..."""</code> and <code>'''...'''</code> triple-quoted strings.</p>
  <div class="two-col">
    <div>
      <pre><span class="kw">SELECT</span>
    <span class="al">u</span>.<span class="col">name</span> <span class="kw">AS</span> <span class="cal">full_name</span>,
    <span class="fn">COUNT</span>(*) <span class="cal">total</span>,
    <span class="fn">COALESCE</span>(<span class="al">u</span>.<span class="col">email</span>, <span class="str">"unknown"</span>) <span class="cal">email</span>
<span class="kw">FROM</span> <span class="tbl">user</span> <span class="al">u</span>
<span class="kw">WHERE</span> <span class="al">u</span>.<span class="col">is_active</span> = <span class="bool">TRUE</span>
    <span class="kw">AND</span> <span class="al">u</span>.<span class="col">id_role</span> = <span class="prm">:id_role</span>
<span class="kw">ORDER BY</span> <span class="al">u</span>.<span class="col">created_at</span> <span class="kw">DESC</span></pre>
    </div>
    <div>
      <div class="token-row"><div class="dot" style="background:#8be9fd"></div><strong>Keywords</strong> &nbsp;SELECT, FROM, WHERE…</div>
      <div class="token-row"><div class="dot" style="background:#ff79c6"></div><strong>Functions</strong> &nbsp;COUNT, COALESCE…</div>
      <div class="token-row"><div class="dot" style="background:#f4c56e"></div><strong>Tables</strong> &nbsp;user, user_contract…</div>
      <div class="token-row"><div class="dot" style="background:#82b1ff"></div><strong>Columns</strong> &nbsp;name, is_active…</div>
      <div class="token-row"><div class="dot" style="background:#5de3c0"></div><strong>Table aliases</strong> &nbsp;u, uc, scj…</div>
      <div class="token-row"><div class="dot" style="background:#d4aaff"></div><strong>Column aliases</strong> &nbsp;full_name, total…</div>
      <div class="token-row"><div class="dot" style="background:#50fa7b"></div><strong>Strings</strong> &nbsp;'active', "value"…</div>
      <div class="token-row"><div class="dot" style="background:#ff8585"></div><strong>Booleans / NULL</strong> &nbsp;TRUE, FALSE, NULL</div>
      <div class="token-row"><div class="dot" style="background:#ffb86c"></div><strong>Params</strong> &nbsp;:id_user, :email…</div>
    </div>
  </div>
  <p style="margin-top:12px; color: var(--muted); font-size:13px;">Add <code class="str">--bq</code> or <code class="str">--spanner</code> as the first line inside the quotes to switch to BigQuery/Spanner dialect highlighting.</p>
</div>

<div class="section">
  <h2>Schema Intelligence</h2>
  <p class="subtitle">Load your SQLAlchemy model files as named schema sources. JSql parses table and column definitions and uses them everywhere.</p>
  <div class="grid">
    <div class="card">
      <h3>🏷 Named sources <span class="tag">schemaSources</span></h3>
      <p>Give a name to a set of model files, e.g. <em>"liblms" → liblms/**/tables.py</em>. One source can be reused by many scopes.</p>
    </div>
    <div class="card">
      <h3>📁 Prefix mappings <span class="tag">prefixMappings</span></h3>
      <p>Map a directory prefix to a source name. Files under <em>src/applms</em> only see the <em>liblms</em> tables — no cross-service noise.</p>
    </div>
    <div class="card">
      <h3>⚠️ Semantic warnings</h3>
      <p>Unknown table names, invalid qualified columns, ambiguous unqualified columns, and duplicate aliases are flagged in real time.</p>
    </div>
    <div class="card">
      <h3>💬 Hover documentation</h3>
      <p>Hover over a table to see all its columns and types. Hover over a column to see which table it belongs to and its SQL type.</p>
    </div>
  </div>
</div>

<div class="section">
  <h2>SQL Formatter</h2>
  <p class="subtitle">Place the cursor inside a SQL block and run <strong>JSql: Format SQL</strong>. Jinja templates are preserved exactly.</p>
  <div class="two-col">
    <div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:6px;">Before</p>
      <pre style="font-size:12px;">select id_user,name,email from user
where is_active=1 and id_role=:r
order by name asc</pre>
    </div>
    <div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:6px;">After</p>
      <pre style="font-size:12px;"><span class="kw">SELECT</span>
    <span class="col">id_user</span>,
    <span class="col">name</span>,
    <span class="col">email</span>
<span class="kw">FROM</span> <span class="tbl">user</span>
<span class="kw">WHERE</span> <span class="col">is_active</span> = <span class="num">1</span>
    <span class="kw">AND</span> <span class="col">id_role</span> = <span class="prm">:r</span>
<span class="kw">ORDER BY</span> <span class="col">name</span> <span class="kw">ASC</span></pre>
    </div>
  </div>
  <p style="margin-top:12px; font-size:13px; color: var(--muted);">Also handles: CASE expressions · CTEs · subqueries · UNION · INSERT VALUES · UPDATE SET · ON DUPLICATE KEY UPDATE · multi-line Jinja conditionals</p>
</div>

<div class="section">
  <h2>Navigation</h2>
  <p class="subtitle">Jump around your SQL and Python files without leaving the keyboard.</p>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a table name <span>→ jumps to <code>__tablename__</code> in the Python model file</span></div>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a qualified column &nbsp;<code class="al">uc</code><code>.</code><code class="col">created_at</code> <span>→ jumps to the FROM/JOIN line in the query</span></div>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a table alias &nbsp;<code class="al">uc</code> <span>→ jumps to the FROM/JOIN where the alias is defined</span></div>
  <div class="shortcut-row"><kbd class="kbd">F2</kbd> on any alias <span>→ renames it everywhere in the SQL block (table aliases and column aliases)</span></div>
  <div class="shortcut-row"><code class="al">uc</code><code>.</code> <span>→ autocomplete dropdown of all columns on <code class="tbl">user_contract</code> with types</span></div>
</div>

<div class="section">
  <h2>Diagnostics</h2>
  <p class="subtitle">Real-time warnings and errors inside SQL blocks.</p>
  <div class="grid">
    <div class="card"><h3>❌ Unmatched brackets</h3><p>Mismatched <code>(</code>, <code>[</code>, <code>{</code> are highlighted in red.</p></div>
    <div class="card"><h3>⚠️ Missing commas</h3><p>Detects missing commas between SELECT columns, including after CASE expressions and subqueries.</p></div>
    <div class="card"><h3>⚠️ Unknown tables</h3><p>Table names not found in loaded schema are flagged with a did-you-mean suggestion.</p></div>
    <div class="card"><h3>⚠️ Ambiguous columns</h3><p>Unqualified column names that exist in multiple joined tables are flagged as errors.</p></div>
    <div class="card"><h3>⚠️ Duplicate aliases</h3><p>Two columns with the same alias in a SELECT block are flagged.</p></div>
    <div class="card"><h3>⚠️ Keyword typos</h3><p>ALL-CAPS words that look like misspelled keywords get a did-you-mean suggestion.</p></div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-command]');
    if (btn) vscode.postMessage({ command: btn.dataset.command });
  });
</script>
</body>
</html>`;
}

module.exports = { createWelcomeHtml };
