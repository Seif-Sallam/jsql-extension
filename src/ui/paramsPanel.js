'use strict';

// Shell HTML + client script for the "Query Parameters" sidebar webview view.
// The extension owns all state; this view just renders what it is told and
// reports input changes / button clicks back.
//
// Extension -> webview messages:
//   { type: 'noBlock' }
//   { type: 'loading' }
//   { type: 'params', items: [{ name, isList, value }] }
//
// Webview -> extension messages:
//   { type: 'ready' }
//   { type: 'change', name, value }
//   { type: 'copy' } | { type: 'copyAsIs' } | { type: 'reset' }
function createParamsPanelHtml(nonce) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family, system-ui);
    font-size: var(--vscode-font-size, 13px);
  }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  button {
    flex: 1 1 auto;
    min-width: 72px;
    padding: 5px 8px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-color: var(--vscode-panel-border, #555);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.06)); }
  .field { margin-bottom: 10px; }
  .field label { display: block; font-size: 12px; margin-bottom: 3px; font-family: var(--vscode-editor-font-family, monospace); }
  .field label .badge {
    margin-left: 6px;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-family: var(--vscode-font-family, system-ui);
  }
  .field input {
    width: 100%;
    padding: 4px 6px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #555));
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  .field input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
  .note, .empty { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
  .empty { padding: 8px 2px; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  function send(type, extra) { vscode.postMessage(Object.assign({ type }, extra || {})); }

  function renderEmpty(text) {
    root.textContent = '';
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    root.appendChild(p);
  }

  function makeButton(label, cls, type) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', () => send(type));
    return b;
  }

  function renderParams(items) {
    root.textContent = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.appendChild(makeButton('Copy', 'primary', 'copy'));
    toolbar.appendChild(makeButton('Copy as is', 'secondary', 'copyAsIs'));
    toolbar.appendChild(makeButton('Reset', 'secondary', 'reset'));
    root.appendChild(toolbar);

    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'No parameters in this query. Use Copy to render it, or Copy as is.';
      root.appendChild(p);
      return;
    }

    for (const item of items) {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const label = document.createElement('label');
      label.textContent = item.name;
      if (item.isList) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'list';
        label.appendChild(badge);
      }
      wrap.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = item.value || '';
      input.placeholder = item.isList ? 'JSON array, e.g. [1, 2, 3]' : 'value';
      input.addEventListener('input', () => send('change', { name: item.name, value: input.value }));
      wrap.appendChild(input);

      root.appendChild(wrap);
    }
  }

  window.addEventListener('message', e => {
    const msg = e.data || {};
    if (msg.type === 'noBlock') renderEmpty('Not inside a JSql block.');
    else if (msg.type === 'loading') renderEmpty('Analyzing query…');
    else if (msg.type === 'params') renderParams(msg.items || []);
  });

  send('ready');
</script>
</body>
</html>`;
}

module.exports = { createParamsPanelHtml };
