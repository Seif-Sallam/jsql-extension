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
  <button class="btn btn-primary" data-command="jsqlSyntax.discoverSchemaSources">🔍 Auto-Discover Schemas</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.manageScopes">⚙ Manual Mapping</button>
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
  <h2>Schema Setup</h2>
  <p class="subtitle">JSql reads your SQLAlchemy model files to power coloring, completions, hover docs, warnings, and navigation. Two ways to set it up:</p>

  <!-- Path A: Auto-discover -->
  <div class="card" style="margin-bottom:16px; border-color: #5de3c0;">
    <h3 style="font-size:15px; color:#5de3c0;">⚡ Path A — Auto-discover (recommended)</h3>
    <p style="margin-bottom:14px;">Run <strong>Auto-Discover Schemas</strong> once. JSql scans your repo for files with SQLAlchemy model definitions, validates each one, and suggests prefix mappings automatically.</p>
    <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; padding-left:12px; border-left: 2px solid #44475a;">
      <div><span style="color:#5de3c0; font-weight:600;">1.</span> Finds all <code>tables.py</code> files (or your glob) that contain <code>__tablename__</code> definitions</div>
      <div><span style="color:#5de3c0; font-weight:600;">2.</span> You pick which ones to register — each becomes a named schema source</div>
      <div><span style="color:#5de3c0; font-weight:600;">3.</span> JSql auto-suggests prefix mappings based on folder naming — e.g. <code>liblms/</code> → also map <code>**/applms</code></div>
      <div><span style="color:#5de3c0; font-weight:600;">4.</span> Optionally scans for gateway directories (<code>gateway/lastmile</code>, <code>gateway_lastmile</code>) and suggests specific overrides</div>
    </div>
    <div style="margin-top:14px;">
      <button class="btn btn-primary" data-command="jsqlSyntax.discoverSchemaSources" style="font-size:12px; padding:6px 14px;">🔍 Run Auto-Discover</button>
    </div>
  </div>

  <!-- Path B: Manual -->
  <div class="card" style="border-color: #6272a4;">
    <h3 style="font-size:15px; color:#bd93f9;">🔧 Path B — Manual mapping</h3>
    <p style="margin-bottom:14px;">Full control over exactly which files and directories are linked. Two independent concepts:</p>
    <div class="two-col" style="gap:12px;">
      <div style="background: var(--code-bg); border-radius:6px; padding:12px;">
        <div style="font-size:12px; color:#f4c56e; font-weight:600; margin-bottom:6px;">Schema Sources</div>
        <div style="font-size:12px; color:var(--muted); line-height:1.6;">Named sets of model files.<br>
          <code style="color:#f8f8f2;">liblms → liblms/**/tables.py</code><br>
          One source, many prefixes can share it.</div>
      </div>
      <div style="background: var(--code-bg); border-radius:6px; padding:12px;">
        <div style="font-size:12px; color:#82b1ff; font-weight:600; margin-bottom:6px;">Prefix Mappings</div>
        <div style="font-size:12px; color:var(--muted); line-height:1.6;">Which directories use which source.<br>
          <code style="color:#f8f8f2;">**/applms → liblms</code><br>
          More specific prefixes always win.</div>
      </div>
    </div>
    <p style="margin-top:12px; font-size:12px; color:var(--muted);">
      Right-click any file or folder in the Explorer → <strong>JSql: Add to Schema Scope</strong> for quick setup without the command palette.
    </p>
    <div style="margin-top:12px;">
      <button class="btn btn-secondary" data-command="jsqlSyntax.manageScopes" style="font-size:12px; padding:6px 14px;">⚙ Open Manual Mapping</button>
    </div>
  </div>
</div>

<div class="section">
  <h2>What Schema Powers</h2>
  <p class="subtitle">Once your schema is loaded, every SQL block in the repo gets these features.</p>
  <div class="grid">
    <div class="card">
      <h3>🎨 Semantic coloring</h3>
      <p>Table names, column names, and aliases get distinct colors based on what they actually are — not just their position in the query.</p>
    </div>
    <div class="card">
      <h3>💬 Hover documentation</h3>
      <p>Hover a table → see all columns and types. Hover a qualified column like <code>uc.created_at</code> → see the exact type from that table.</p>
    </div>
    <div class="card">
      <h3>⌨️ Column completions</h3>
      <p>Type <code>uc.</code> to get a dropdown of every column on <code>user_contract</code> with its SQL type — resolved from the alias in the query.</p>
    </div>
    <div class="card">
      <h3>⚠️ Semantic warnings</h3>
      <p>Unknown tables, invalid qualified columns, and ambiguous unqualified columns are flagged in real time with did-you-mean suggestions.</p>
    </div>
  </div>
</div>

<div class="section">
  <h2>Completions</h2>
  <p class="subtitle">Intelligent suggestions as you type — inside any SQL block.</p>

  <div class="two-col" style="gap:16px; margin-bottom:16px;">
    <div class="card">
      <h3>📋 Table name completions</h3>
      <p style="margin-bottom:10px;">Type after <code>FROM</code>, <code>JOIN</code>, <code>INTO</code>, or <code>UPDATE</code> to get suggestions from your loaded schema. Matching works on any part of the name:</p>
      <pre style="font-size:12px;"><span class="kw">FROM</span> history<span style="color:#50fa7b">|</span>
<span class="cmt">→ attendance_log_history</span>
<span class="cmt">→ task_history</span>
<span class="cmt">→ user_shift_history</span></pre>
      <p style="font-size:12px; color:var(--muted); margin-top:6px;">Prefix matches rank first, then suffix, then substring — so typing <code>user_c</code> surfaces <code>user_contract</code> before <code>last_user_contract</code>.</p>
    </div>
    <div class="card">
      <h3>🔁 CTE completions</h3>
      <p style="margin-bottom:10px;">CTEs defined in the current query are suggested first — before schema tables — since they're the most local source:</p>
      <pre style="font-size:12px;"><span class="kw">WITH</span> seal_check_data <span class="kw">AS</span> (...)
<span class="kw">SELECT</span> * <span class="kw">FROM</span> seal_<span style="color:#50fa7b">|</span>
<span class="cmt">→ seal_check_data     CTE (2 cols)</span>
<span class="cmt">→ seal_check          schema table</span></pre>
      <p style="font-size:12px; color:var(--muted); margin-top:6px;">CTE column lists (explicit or inferred from SELECT aliases) are also shown in the detail line.</p>
    </div>
  </div>

  <div class="card">
    <h3>🔤 SQL keyword &amp; function completions</h3>
    <p>Type any SQL word to get keyword and function suggestions. Functions like <code>COUNT</code>, <code>COALESCE</code>, <code>DATE_TRUNC</code> are distinguished from structural keywords like <code>SELECT</code>, <code>WHERE</code>.</p>
    <pre style="font-size:12px; margin-top:8px;"><span class="kw">COUN</span><span style="color:#50fa7b">|</span>  <span class="cmt">→ COUNT  (SQL function)</span>
<span class="kw">COAL</span><span style="color:#50fa7b">|</span>  <span class="cmt">→ COALESCE  (SQL function)</span>
<span class="kw">PART</span><span style="color:#50fa7b">|</span>  <span class="cmt">→ PARTITION  (SQL keyword)</span></pre>
    <p style="font-size:12px; color:var(--muted); margin-top:6px;">BigQuery/Spanner functions (<code>ARRAY_AGG</code>, <code>DATE_TRUNC</code>, <code>FARM_FINGERPRINT</code>…) are included when the block starts with <code>--bq</code> or <code>--spanner</code>.</p>
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
