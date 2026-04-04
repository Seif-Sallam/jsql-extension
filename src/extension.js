'use strict';

const vscode = require('vscode');

const {
    buildFormattedSQLBlock,
    detectUnionCommentAdjacency,
    findMatchingBracket,
    findSQLRanges,
    findUnmatchedBrackets,
    formatSQL,
} = require('./sql/formatter');
const {
    CAPS_WORD_RE,
    IDENT_RE,
    SPECIFIC_PATTERNS_BQ,
    SPECIFIC_PATTERNS_SQL,
} = require('./sql/highlighting');
const {
    detectAmbiguousColumns,
    detectDuplicateAliases,
    detectMissingSelectCommas,
} = require('./sql/diagnostics');
const {
    findCTENames,
    findSemanticEntityRanges,
    findSemanticWarnings,
    findTableReferences,
    rangeOverlapsOpaque,
} = require('./sql/semantic');
const {
    createEmptySchemaMetadata,
    findClosestName,
    isWorkspaceRelativeGlobPattern,
    mergeSchemaMetadata,
    parseTableDefinitionFile,
} = require('./schema/metadata');
const { ALL_SQL_KEYWORDS, buildOpaqueMask, findClosestKeyword } = require('./sql/shared');
const {
    findSqlWordCompletionContext,
    findSqlWordCompletions,
    findTableNameCompletionContext,
    findTableNameCompletions,
} = require('./sql/completions');
const { THEMES, buildDecorations, createBracketDecorations } = require('./theme');
const { createWelcomeHtml } = require('./ui/welcome');

// Only explicit non-alpha trigger chars — letters trigger automatically via quickSuggestions
const SQL_COMPLETION_TRIGGER_CHARS = [' ', '_'];

function activate(context) {
    const cfg = () => vscode.workspace.getConfiguration('jsqlSyntax');
    let dec = buildDecorations(vscode, cfg().get('theme', 'dracula'));
    let { bracketDec, bracketErrorDec } = createBracketDecorations(vscode);
    const debugChannel = vscode.window.createOutputChannel('JSql Debug');

    const diagnostics = vscode.languages.createDiagnosticCollection('jsqlSyntax');
    context.subscriptions.push(diagnostics);
    context.subscriptions.push(debugChannel);
    let globalMetadata = createEmptySchemaMetadata();
    let scopedMetadataMap = new Map(); // normalizedPrefix -> schemaMetadata
    let schemaRefreshVersion = 0;
    let schemaRefreshTimer = null;

    function getConfiguredTableDefinitionFiles() {
        const configured = cfg().get('tableDefinitionFiles', []);
        if (!Array.isArray(configured)) return [];
        return configured
            .filter(pattern => typeof pattern === 'string')
            .map(pattern => pattern.trim())
            .filter(Boolean)
            .filter(isWorkspaceRelativeGlobPattern);
    }

    function getWorkspaceScopedConfig(wsFolder) {
        // Use a synthetic file URI inside the folder so VS Code resolves resource-scoped settings
        const fileUri = vscode.Uri.joinPath(wsFolder.uri, '.jsql-scope-placeholder');
        return vscode.workspace.getConfiguration('jsqlSyntax', fileUri);
    }

    function getConfiguredSchemaSources() {
        // Returns Map<sourceName, string[]> — name → file globs
        const wsFolders = vscode.workspace.workspaceFolders || [];
        const result = new Map();
        const configs = wsFolders.length
            ? wsFolders.map(f => getWorkspaceScopedConfig(f))
            : [cfg()];
        for (const config of configs) {
            const raw = config.get('schemaSources', {});
            if (!raw || typeof raw !== 'object') continue;
            for (const [name, globs] of Object.entries(raw)) {
                if (!result.has(name) && Array.isArray(globs)) result.set(name, globs);
            }
        }
        return result;
    }

    function getConfiguredPrefixMappings() {
        // Returns Array<{prefix, source}>
        const wsFolders = vscode.workspace.workspaceFolders || [];
        const seen = new Set();
        const all = [];
        const configs = wsFolders.length
            ? wsFolders.map(f => getWorkspaceScopedConfig(f))
            : [cfg()];
        for (const config of configs) {
            const raw = config.get('prefixMappings', []);
            if (!Array.isArray(raw)) continue;
            for (const m of raw) {
                if (!m || typeof m.prefix !== 'string' || typeof m.source !== 'string') continue;
                const key = m.prefix + '::' + m.source;
                if (!seen.has(key)) { seen.add(key); all.push(m); }
            }
        }
        return all;
    }

    function semanticWarningsEnabled() {
        return cfg().get('semanticWarnings', true);
    }

    // Returns the schemaMetadata appropriate for the given document.
    // Matches the document's workspace-relative path against configured scope prefixes,
    // picking the most specific (longest) match. Falls back to globalMetadata.
    function pathMatchesPrefix(relPath, prefix) {
        // Normalize: strip leading slash, trailing slash, and trailing /** or /*
        let norm = prefix.replace(/\\/g, '/').replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
        const path = relPath.replace(/\\/g, '/');
        const isGlobPrefix = norm.startsWith('**/');

        if (isGlobPrefix) {
            // **/X — matches any path that has X as a directory component anywhere
            const suffix = norm.slice(3);
            return path === suffix ||
                path.startsWith(suffix + '/') ||
                path.includes('/' + suffix + '/') ||
                path.endsWith('/' + suffix);
        }

        // Plain prefix — must start with prefix/ or equal it
        return path === norm || path.startsWith(norm + '/');
    }

    function resolveMetadata(doc) {
        if (!doc || !vscode.workspace.workspaceFolders) return globalMetadata;
        const docFsPath = doc.uri.fsPath.replace(/\\/g, '/');
        let best = null, bestSpecificity = -1;
        for (const wsFolder of vscode.workspace.workspaceFolders) {
            const wsPath = wsFolder.uri.fsPath.replace(/\\/g, '/');
            if (!docFsPath.startsWith(wsPath)) continue;
            const relPath = docFsPath.slice(wsPath.length).replace(/^\//, '');
            for (const [prefix, meta] of scopedMetadataMap) {
                if (!pathMatchesPrefix(relPath, prefix)) continue;
                // Exact prefixes are more specific than **/ globs; longer = more specific
                const isGlob = prefix.startsWith('**/');
                const specificity = isGlob ? prefix.length : prefix.length + 10000;
                if (specificity > bestSpecificity) {
                    bestSpecificity = specificity;
                    best = meta;
                }
            }
        }
        return best || globalMetadata;
    }

    function resolveCompletionMetadata(doc) {
        const primary = resolveMetadata(doc);
        if (primary.tables.size > 0) return primary;

        const merged = createEmptySchemaMetadata();
        const seen = new Set();

        const addMetadata = meta => {
            if (!meta || seen.has(meta)) return;
            seen.add(meta);
            mergeSchemaMetadata(merged, meta);
        };

        addMetadata(globalMetadata);
        for (const meta of scopedMetadataMap.values()) addMetadata(meta);

        return merged;
    }

    function getDocumentScopeDebug(doc) {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const docFsPath = doc.uri.fsPath.replace(/\\/g, '/');

        for (const wsFolder of workspaceFolders) {
            const wsPath = wsFolder.uri.fsPath.replace(/\\/g, '/');
            if (!docFsPath.startsWith(wsPath)) continue;

            const relPath = docFsPath.slice(wsPath.length).replace(/^\//, '');
            const matchingScopes = [...scopedMetadataMap.entries()]
                .filter(([prefix]) => pathMatchesPrefix(relPath, prefix))
                .map(([prefix, meta]) => ({
                    prefix,
                    tableCount: meta.tables.size,
                    sourceUriCount: meta.sourceUris.size,
                }))
                .sort((a, b) => b.prefix.length - a.prefix.length);

            return {
                workspaceFolder: wsFolder.name,
                relPath,
                matchingScopes,
            };
        }

        return null;
    }

    function buildCompletionDebugSnapshot(doc, position) {
        const text = doc.getText();
        const offset = doc.offsetAt(position);
        const sqlRanges = findSQLRanges(text);
        const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end) || null;
        const resolvedMetadata = resolveMetadata(doc);
        const completionMetadata = resolveCompletionMetadata(doc);
        const snapshot = {
            document: doc.uri.fsPath,
            languageId: doc.languageId,
            cursor: {
                line: position.line + 1,
                character: position.character + 1,
                offset,
            },
            lineText: doc.lineAt(position.line).text,
            sqlRangeFound: !!sqlRange,
            sqlRangeCount: sqlRanges.length,
            resolvedMetadata: {
                tableCount: resolvedMetadata.tables.size,
                sourceUriCount: resolvedMetadata.sourceUris.size,
            },
            completionMetadata: {
                tableCount: completionMetadata.tables.size,
                sourceUriCount: completionMetadata.sourceUris.size,
            },
            globalMetadata: {
                tableCount: globalMetadata.tables.size,
                sourceUriCount: globalMetadata.sourceUris.size,
            },
            scopedMetadata: [...scopedMetadataMap.entries()].map(([prefix, meta]) => ({
                prefix,
                tableCount: meta.tables.size,
                sourceUriCount: meta.sourceUris.size,
            })),
            scopeInfo: getDocumentScopeDebug(doc),
        };

        if (!sqlRange) return snapshot;

        const content = text.slice(sqlRange.start, sqlRange.end);
        const localOffset = offset - sqlRange.start;
        const opaque = buildOpaqueMask(content);
        const tableContext = findTableNameCompletionContext(content, localOffset, opaque);
        const wordContext = findSqlWordCompletionContext(content, localOffset, opaque);

        snapshot.sqlRange = {
            start: sqlRange.start,
            end: sqlRange.end,
            dialect: sqlRange.dialect,
            localOffset,
            textBeforeCursorTail: content.slice(Math.max(0, localOffset - 120), localOffset),
            textAfterCursorHead: content.slice(localOffset, Math.min(content.length, localOffset + 120)),
        };
        snapshot.tableContext = tableContext;
        snapshot.wordContext = wordContext;
        snapshot.tableMatches = tableContext
            ? findTableNameCompletions(tableContext.prefix, completionMetadata).slice(0, 20)
            : [];
        snapshot.wordMatches = wordContext
            ? findSqlWordCompletions(wordContext.prefix).slice(0, 20)
            : [];
        snapshot.sampleTables = [...completionMetadata.tables].sort().slice(0, 20);

        return snapshot;
    }

    async function loadFilesIntoMetadata(patterns, workspaceFolders, target, seenUris) {
        for (const pattern of patterns) {
            for (const workspaceFolder of workspaceFolders) {
                let uris = [];
                try {
                    uris = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, pattern));
                } catch (err) {
                    console.warn(`[jsqlSyntax] Failed to search for table definitions using "${pattern}":`, err);
                    continue;
                }
                for (const uri of uris) {
                    const key = uri.toString();
                    if (seenUris.has(key)) continue;
                    seenUris.add(key);
                    try {
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        const fileMetadata = parseTableDefinitionFile(Buffer.from(bytes).toString('utf8'));
                        fileMetadata.sourceUris.add(key);
                        for (const loc of fileMetadata.tableLocations.values()) loc.uri = key;
                        for (const colLocs of fileMetadata.columnLocations.values())
                            for (const loc of colLocs.values()) loc.uri = key;
                        mergeSchemaMetadata(target, fileMetadata);
                    } catch (err) {
                        console.warn(`[jsqlSyntax] Failed to read table definition file "${key}":`, err);
                    }
                }
            }
        }
    }

    async function refreshSchemaMetadata() {
        const refreshVersion = ++schemaRefreshVersion;
        const workspaceFolders = vscode.workspace.workspaceFolders || [];

        if (!workspaceFolders.length || !vscode.workspace.findFiles || !vscode.workspace.fs || !vscode.RelativePattern) {
            globalMetadata = createEmptySchemaMetadata();
            scopedMetadataMap = new Map();
            vscode.window.visibleTextEditors.forEach(applyDecorations);
            return;
        }

        const seenUris = new Set();

        // Load global (unscoped) files
        const globalPatterns = getConfiguredTableDefinitionFiles();
        const nextGlobal = createEmptySchemaMetadata();
        if (globalPatterns.length) {
            await loadFilesIntoMetadata(globalPatterns, workspaceFolders, nextGlobal, seenUris);
        }

        // Load named schema sources into isolated metadata objects
        const schemaSources = getConfiguredSchemaSources();
        const sourceMetadataMap = new Map(); // sourceName -> schemaMetadata
        for (const [name, globs] of schemaSources) {
            const validGlobs = globs.filter(g => typeof g === 'string' && g.trim()).filter(isWorkspaceRelativeGlobPattern);
            if (!validGlobs.length) continue;
            const meta = createEmptySchemaMetadata();
            await loadFilesIntoMetadata(validGlobs, workspaceFolders, meta, new Set());
            sourceMetadataMap.set(name, meta);
        }

        // Map prefixes to their source metadata
        const prefixMappings = getConfiguredPrefixMappings();
        console.log('[jsqlSyntax] Sources:', [...sourceMetadataMap.entries()].map(([n, m]) => `${n}: ${m.tables.size} tables`));
        console.log('[jsqlSyntax] Prefix mappings:', JSON.stringify(prefixMappings));
        const nextScopedMap = new Map();
        for (const mapping of prefixMappings) {
            const prefix = mapping.prefix.trim().replace(/\\/g, '/').replace(/\/$/, '');
            if (!prefix) continue;
            const meta = sourceMetadataMap.get(mapping.source);
            if (!meta) {
                console.warn(`[jsqlSyntax] Prefix "${prefix}" references unknown source "${mapping.source}"`);
                continue;
            }
            nextScopedMap.set(prefix, meta);
        }

        if (refreshVersion !== schemaRefreshVersion) return;
        globalMetadata = nextGlobal;
        scopedMetadataMap = nextScopedMap;
        console.log('[jsqlSyntax] Loaded scoped metadata:', [...nextScopedMap.entries()].map(([k, v]) => `${k}: ${v.tables.size} tables`));
        vscode.window.visibleTextEditors.forEach(applyDecorations);
    }

    function scheduleSchemaRefresh() {
        if (schemaRefreshTimer) clearTimeout(schemaRefreshTimer);
        schemaRefreshTimer = setTimeout(() => {
            schemaRefreshTimer = null;
            refreshSchemaMetadata();
        }, 100);
    }

    context.subscriptions.push({
        dispose() {
            if (schemaRefreshTimer) clearTimeout(schemaRefreshTimer);
        }
    });

    function applyDecorations(editor) {
        if (!editor || editor.document.languageId !== 'python') return;
        const doc = editor.document;
        const schemaMetadata = resolveMetadata(doc);
        const text = doc.getText();
        const collected = Object.fromEntries(Object.keys(dec).map(k => [k, []]));
        const docDiagnostics = [];
        const bracketRanges = [];
        const bracketErrorRanges = [];
        const sqlRanges = findSQLRanges(text);

        for (const { start, end, dialect } of sqlRanges) {
            const content = text.slice(start, end);
            const patterns = dialect === 'bq' ? SPECIFIC_PATTERNS_BQ : SPECIFIC_PATTERNS_SQL;

            const occupied = new Set();
            for (const { re, key } of patterns) {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(content)) !== null) {
                    let overlaps = false;
                    for (let i = m.index; i < m.index + m[0].length; i++) {
                        if (occupied.has(i)) { overlaps = true; break; }
                    }
                    if (overlaps) continue;
                    const absStart = start + m.index;
                    const absEnd = absStart + m[0].length;
                    collected[key].push(new vscode.Range(doc.positionAt(absStart), doc.positionAt(absEnd)));
                    for (let i = m.index; i < m.index + m[0].length; i++) occupied.add(i);
                }
            }

            const semanticRanges = findSemanticEntityRanges(content, schemaMetadata);
            for (const { start: relStart, end: relEnd } of semanticRanges.tableRanges) {
                let overlaps = false;
                for (let i = relStart; i < relEnd; i++) {
                    if (occupied.has(i)) { overlaps = true; break; }
                }
                if (overlaps) continue;

                const absStart = start + relStart;
                collected.table.push(new vscode.Range(
                    doc.positionAt(absStart),
                    doc.positionAt(absStart + (relEnd - relStart))
                ));
                for (let i = relStart; i < relEnd; i++) occupied.add(i);
            }

            for (const { start: relStart, end: relEnd } of semanticRanges.columnRanges) {
                let overlaps = false;
                for (let i = relStart; i < relEnd; i++) {
                    if (occupied.has(i)) { overlaps = true; break; }
                }
                if (overlaps) continue;

                const absStart = start + relStart;
                collected.column.push(new vscode.Range(
                    doc.positionAt(absStart),
                    doc.positionAt(absStart + (relEnd - relStart))
                ));
                for (let i = relStart; i < relEnd; i++) occupied.add(i);
            }

            for (const { start: relStart, end: relEnd } of semanticRanges.aliasRanges) {
                let overlaps = false;
                for (let i = relStart; i < relEnd; i++) {
                    if (occupied.has(i)) { overlaps = true; break; }
                }
                if (overlaps) continue;

                const absStart = start + relStart;
                collected.alias.push(new vscode.Range(
                    doc.positionAt(absStart),
                    doc.positionAt(absStart + (relEnd - relStart))
                ));
                for (let i = relStart; i < relEnd; i++) occupied.add(i);
            }

            for (const { start: relStart, end: relEnd } of semanticRanges.colAliasRanges) {
                let overlaps = false;
                for (let i = relStart; i < relEnd; i++) {
                    if (occupied.has(i)) { overlaps = true; break; }
                }
                if (overlaps) continue;

                const absStart = start + relStart;
                collected.col_alias.push(new vscode.Range(
                    doc.positionAt(absStart),
                    doc.positionAt(absStart + (relEnd - relStart))
                ));
                for (let i = relStart; i < relEnd; i++) occupied.add(i);
            }

            IDENT_RE.lastIndex = 0;
            let m;
            while ((m = IDENT_RE.exec(content)) !== null) {
                let overlaps = false;
                for (let i = m.index; i < m.index + m[0].length; i++) {
                    if (occupied.has(i)) { overlaps = true; break; }
                }
                if (!overlaps) {
                    const absStart = start + m.index;
                    collected.identifier.push(new vscode.Range(
                        doc.positionAt(absStart),
                        doc.positionAt(absStart + m[0].length)
                    ));
                }
            }

            // Spell-check: ALL-CAPS words not inside strings/comments
            CAPS_WORD_RE.lastIndex = 0;
            let cw;
            while ((cw = CAPS_WORD_RE.exec(content)) !== null) {
                if (occupied.has(cw.index)) continue;
                const word = cw[0];
                if (ALL_SQL_KEYWORDS.has(word)) continue;
                const suggestion = findClosestKeyword(word);
                if (!suggestion) continue;
                const absStart = start + cw.index;
                const range = new vscode.Range(doc.positionAt(absStart), doc.positionAt(absStart + word.length));
                const diag = new vscode.Diagnostic(range, `Unknown keyword "${word}" — did you mean ${suggestion}?`, vscode.DiagnosticSeverity.Warning);
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }

            for (const issue of detectAmbiguousColumns(content, schemaMetadata)) {
                const range = new vscode.Range(
                    doc.positionAt(start + issue.start),
                    doc.positionAt(start + issue.end)
                );
                const diag = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }

            for (const issue of detectDuplicateAliases(content)) {
                const range = new vscode.Range(
                    doc.positionAt(start + issue.start),
                    doc.positionAt(start + issue.end)
                );
                const diag = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Warning);
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }

            for (const issue of detectMissingSelectCommas(content)) {
                const range = new vscode.Range(
                    doc.positionAt(start + issue.start),
                    doc.positionAt(start + issue.end)
                );
                const diag = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Warning);
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }

            if (semanticWarningsEnabled()) {
                for (const issue of findSemanticWarnings(content, schemaMetadata)) {
                    const range = new vscode.Range(
                        doc.positionAt(start + issue.start),
                        doc.positionAt(start + issue.end)
                    );
                    const diag = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Warning);
                    diag.source = 'jsql';
                    docDiagnostics.push(diag);
                }
            }

            for (const idx of findUnmatchedBrackets(content)) {
                const range = new vscode.Range(
                    doc.positionAt(start + idx),
                    doc.positionAt(start + idx + 1)
                );
                bracketErrorRanges.push(range);
                const diag = new vscode.Diagnostic(
                    range,
                    'Unmatched bracket in SQL expression.',
                    vscode.DiagnosticSeverity.Error
                );
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }
        }

        for (const selection of editor.selections) {
            if (!selection.isEmpty) continue;
            const cursorOffset = doc.offsetAt(selection.active);
            const sqlRange = sqlRanges.find(r => r.start <= cursorOffset && cursorOffset <= r.end);
            if (!sqlRange) continue;

            const content = text.slice(sqlRange.start, sqlRange.end);
            const match = findMatchingBracket(content, cursorOffset - sqlRange.start);
            if (!match) continue;
            if (typeof match.unmatched === 'number') continue;

            bracketRanges.push(
                new vscode.Range(
                    doc.positionAt(sqlRange.start + match.start),
                    doc.positionAt(sqlRange.start + match.start + 1)
                ),
                new vscode.Range(
                    doc.positionAt(sqlRange.start + match.end),
                    doc.positionAt(sqlRange.start + match.end + 1)
                )
            );
        }

        for (const [key, decoration] of Object.entries(dec)) {
            editor.setDecorations(decoration, collected[key]);
        }
        editor.setDecorations(bracketDec, bracketRanges);
        editor.setDecorations(bracketErrorDec, bracketErrorRanges);
        diagnostics.set(doc.uri, docDiagnostics);
    }

    // ─── Welcome / Feature Tour webview ─────────────────────────────────────────

    let welcomePanel = null;

    function openWelcomePanel() {
        if (welcomePanel) { welcomePanel.reveal(); return; }

        welcomePanel = vscode.window.createWebviewPanel(
            'jsqlWelcome',
            'JSql Syntax — Welcome',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        welcomePanel.onDidDispose(() => { welcomePanel = null; });
        welcomePanel.webview.onDidReceiveMessage(msg => {
            if (msg.command) vscode.commands.executeCommand(msg.command);
        });

        const nonce = Math.random().toString(36).slice(2);

        welcomePanel.webview.html = createWelcomeHtml(nonce);
    }

    vscode.commands.registerCommand('jsqlSyntax.openWelcome', () => {
        openWelcomePanel();
    }, null, context.subscriptions);

    // Show on first install if enabled
    const hasShownWelcome = context.globalState.get('jsqlSyntax.shownWelcome', false);
    if (!hasShownWelcome && cfg().get('showWelcomeOnStartup', true)) {
        context.globalState.update('jsqlSyntax.shownWelcome', true);
        openWelcomePanel();
    }

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('python', {
            provideDocumentFormattingEdits(doc) {
                const text = doc.getText();
                const sqlRanges = findSQLRanges(text);
                const edits = [];
                for (const sqlRange of sqlRanges) {
                    const replacement = buildFormattedSQLBlock(text, sqlRange);
                    const current = text.slice(replacement.start, replacement.end);
                    if (replacement.formatted === current) continue;
                    edits.push(vscode.TextEdit.replace(
                        new vscode.Range(doc.positionAt(replacement.start), doc.positionAt(replacement.end)),
                        replacement.formatted
                    ));
                }
                return edits;
            }
        })
    );

    vscode.commands.registerCommand('jsqlSyntax.formatSQL', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') return;

        const doc = editor.document;
        const text = doc.getText();
        const cursorOffset = doc.offsetAt(editor.selection.active);
        const sqlRange = findSQLRanges(text).find(r => r.fullStart <= cursorOffset && cursorOffset <= r.fullEnd);

        if (!sqlRange) {
            vscode.window.showInformationMessage('Cursor is not inside a JSql block.');
            return;
        }

        const replacement = buildFormattedSQLBlock(text, sqlRange);
        const currentBlock = text.slice(replacement.start, replacement.end);
        if (replacement.formatted === currentBlock) return;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            doc.uri,
            new vscode.Range(doc.positionAt(replacement.start), doc.positionAt(replacement.end)),
            replacement.formatted
        );
        vscode.workspace.applyEdit(edit);
    }, null, context.subscriptions);

    // ─── Schema config helpers ───────────────────────────────────────────────────

    function cfgForSave(wsFolder) {
        return wsFolder
            ? vscode.workspace.getConfiguration('jsqlSyntax', wsFolder.uri)
            : vscode.workspace.getConfiguration('jsqlSyntax');
    }

    function saveTarget(wsFolder) {
        return wsFolder
            ? vscode.ConfigurationTarget.WorkspaceFolder
            : vscode.ConfigurationTarget.Global;
    }

    async function pickWorkspaceFolder() {
        const wsFolders = vscode.workspace.workspaceFolders || [];
        if (wsFolders.length === 0) return null;
        if (wsFolders.length === 1) return wsFolders[0];
        const p = await vscode.window.showQuickPick(
            wsFolders.map(f => ({ label: f.name, description: f.uri.fsPath, folder: f })),
            { title: 'Which workspace folder?' }
        );
        return p ? p.folder : null;
    }

    async function writeSchemaSources(sources, wsFolder) {
        await cfgForSave(wsFolder).update('schemaSources', sources, saveTarget(wsFolder));
        scheduleSchemaRefresh();
    }

    async function writePrefixMappings(mappings, wsFolder) {
        await cfgForSave(wsFolder).update('prefixMappings', mappings, saveTarget(wsFolder));
        scheduleSchemaRefresh();
    }

    function readSchemaSources(wsFolder) {
        const raw = cfgForSave(wsFolder).get('schemaSources', {});
        return (raw && typeof raw === 'object') ? raw : {};
    }

    function readPrefixMappings(wsFolder) {
        const raw = cfgForSave(wsFolder).get('prefixMappings', []);
        return Array.isArray(raw) ? raw.filter(m => m && m.prefix && m.source) : [];
    }

    // ─── addToScope (right-click context menu) ──────────────────────────────────

    vscode.commands.registerCommand('jsqlSyntax.addToScope', async (uri) => {
        if (!uri) {
            vscode.window.showWarningMessage('JSql: Right-click a file or folder in the Explorer.');
            return;
        }

        const wsFolder = await pickWorkspaceFolder();

        let isDir = false;
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            isDir = (stat.type & vscode.FileType.Directory) !== 0;
        } catch {
            vscode.window.showWarningMessage('JSql: Could not read the selected item.');
            return;
        }

        const wsFolders = vscode.workspace.workspaceFolders || [];
        const fsPath = uri.fsPath.replace(/\\/g, '/');
        let relPath = null;
        for (const f of wsFolders) {
            const wsPath = f.uri.fsPath.replace(/\\/g, '/');
            if (fsPath.startsWith(wsPath)) { relPath = fsPath.slice(wsPath.length).replace(/^\//, ''); break; }
        }
        if (!relPath) { vscode.window.showWarningMessage('JSql: Item is outside the workspace.'); return; }

        const sources = readSchemaSources(wsFolder);
        const mappings = readPrefixMappings(wsFolder);
        const sourceNames = Object.keys(sources);

        if (isDir) {
            const action = await vscode.window.showQuickPick([
                { label: '$(database) Register as schema source', description: 'Name this folder\'s table definitions', value: 'source' },
                { label: '$(file-code) Map as scope prefix', description: 'SQL files here use a named schema source', value: 'prefix' },
            ], { title: `JSql: What is "${relPath}"?` });
            if (!action) return;

            if (action.value === 'source') {
                const name = await vscode.window.showInputBox({
                    title: 'Name this schema source',
                    prompt: 'Short name, e.g. "liblms"',
                    placeHolder: 'liblms',
                    validateInput: v => v.trim() ? null : 'Name cannot be empty',
                });
                if (!name) return;
                const glob = `${relPath}/**/tables.py`;
                await writeSchemaSources({ ...sources, [name.trim()]: [glob] }, wsFolder);
                vscode.window.showInformationMessage(`JSql: Schema source "${name.trim()}" → ${glob}`);
            } else {
                if (!sourceNames.length) {
                    vscode.window.showWarningMessage('JSql: No schema sources defined yet. Register a schema source first.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    sourceNames.map(n => ({ label: n, description: (sources[n] || []).join(', ') })),
                    { title: `Map prefix "${relPath}" to which schema source?` }
                );
                if (!pick) return;
                const updated = [...mappings.filter(m => m.prefix !== relPath), { prefix: relPath, source: pick.label }];
                await writePrefixMappings(updated, wsFolder);
                vscode.window.showInformationMessage(`JSql: "${relPath}" → source "${pick.label}"`);
            }
        } else {
            const action = await vscode.window.showQuickPick([
                ...sourceNames.map(n => ({ label: `$(add) Add to "${n}"`, description: (sources[n] || []).join(', '), source: n })),
                { label: '$(plus) New schema source', source: null },
            ], { title: `Add "${relPath}" as table definitions` });
            if (!action) return;

            let sourceName = action.source;
            if (!sourceName) {
                const name = await vscode.window.showInputBox({
                    title: 'Name this schema source',
                    placeHolder: 'liblms',
                    validateInput: v => v.trim() ? null : 'Name cannot be empty',
                });
                if (!name) return;
                sourceName = name.trim();
            }
            const existing = sources[sourceName] || [];
            if (!existing.includes(relPath)) {
                await writeSchemaSources({ ...sources, [sourceName]: [...existing, relPath] }, wsFolder);
            }
            vscode.window.showInformationMessage(`JSql: Added "${relPath}" to source "${sourceName}"`);
        }
    }, null, context.subscriptions);

    // ─── discoverSchemaSources ───────────────────────────────────────────────────

    vscode.commands.registerCommand('jsqlSyntax.discoverSchemaSources', async () => {
        const wsFolder = await pickWorkspaceFolder();
        const wsFolders = vscode.workspace.workspaceFolders || [];
        if (!wsFolders.length) {
            vscode.window.showWarningMessage('JSql: No workspace folder open.');
            return;
        }

        // Ask for glob pattern
        const pattern = await vscode.window.showInputBox({
            title: 'JSql: Discover Schema Sources',
            prompt: 'Glob pattern to search for table definition files',
            value: '**/tables.py',
            validateInput: v => v.trim() ? null : 'Pattern cannot be empty',
        });
        if (!pattern) return;

        // Search with a progress indicator
        let uris = [];
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Searching for ${pattern}…` },
            async () => {
                uris = await vscode.workspace.findFiles(pattern, '{**/node_modules/**,**/.git/**}');
            }
        );

        if (!uris.length) {
            vscode.window.showInformationMessage(`JSql: No files found matching "${pattern}".`);
            return;
        }

        // Compute workspace-relative paths and sort
        function toRelPath(uri) {
            const fsPath = uri.fsPath.replace(/\\/g, '/');
            for (const f of wsFolders) {
                const wsPath = f.uri.fsPath.replace(/\\/g, '/');
                if (fsPath.startsWith(wsPath)) return fsPath.slice(wsPath.length).replace(/^\//, '');
            }
            return uri.fsPath;
        }

        // Filter to files that actually contain SQLAlchemy model definitions
        const candidates = [];
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Validating ${uris.length} file(s) for model definitions…` },
            async () => {
                for (const uri of uris) {
                    try {
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        const text = Buffer.from(bytes).toString('utf8');
                        const fileMeta = parseTableDefinitionFile(text);
                        if (fileMeta.tables.size > 0) {
                            candidates.push({ uri, tableCount: fileMeta.tables.size });
                        }
                    } catch {
                        // skip unreadable files
                    }
                }
            }
        );

        if (!candidates.length) {
            vscode.window.showInformationMessage(`JSql: No files with SQLAlchemy model definitions found matching "${pattern}".`);
            return;
        }

        const existing = readSchemaSources(wsFolder);
        const items = candidates
            .map(({ uri, tableCount }) => {
                const relPath = toRelPath(uri);
                const alreadyRegistered = Object.prototype.hasOwnProperty.call(existing, relPath);
                return {
                    label: relPath,
                    description: alreadyRegistered
                        ? `$(check) already registered`
                        : `${tableCount} table${tableCount !== 1 ? 's' : ''}`,
                    picked: !alreadyRegistered,
                    relPath,
                    alreadyRegistered,
                };
            })
            .sort((a, b) => a.relPath.localeCompare(b.relPath));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            title: `JSql: Discover Schema Sources — ${candidates.length} model file(s) found`,
            placeHolder: 'Select files to register as schema sources (each file becomes a named source)',
        });
        if (!selected || !selected.length) return;

        const updated = { ...existing };
        let added = 0;
        for (const item of selected) {
            if (!updated[item.relPath]) {
                updated[item.relPath] = [item.relPath];
                added++;
            }
        }

        if (!added) {
            vscode.window.showInformationMessage('JSql: All selected sources are already registered.');
            return;
        }

        await writeSchemaSources(updated, wsFolder);

        // ── Phase 1b: Core prefix mapping suggestions ───────────────────────────
        // For each newly registered source, derive lib/app sibling folder names
        // and check if they exist in the workspace.

        const topLevelDirs = new Set();
        for (const f of wsFolders) {
            try {
                const entries = await vscode.workspace.fs.readDirectory(f.uri);
                for (const [name, type] of entries) {
                    if (type === vscode.FileType.Directory) topLevelDirs.add(name);
                }
            } catch { /* ignore */ }
        }

        const existingMappings = readPrefixMappings(wsFolder);
        const existingPrefixes = new Set(existingMappings.map(m => m.prefix));

        const coreSuggestions = [];
        for (const item of selected) {
            const sourceName = item.relPath;
            // Find the lib* component anywhere in the path (e.g. liblms from liblms/models/tables.py)
            const libFolder = item.relPath.split('/').find(p => /^lib.+/i.test(p));
            if (!libFolder) continue;

            const service = libFolder.slice(3); // strip "lib" prefix
            const appFolder = `app${service}`;

            // Suggest **/libXXX → source (the lib folder itself)
            const libPrefix = `**/${libFolder}`;
            if (!existingPrefixes.has(libPrefix)) {
                coreSuggestions.push({
                    label: libPrefix,
                    description: `→ ${sourceName}`,
                    detail: 'schema source folder',
                    picked: true,
                    prefix: libPrefix,
                    source: sourceName,
                });
            }

            // Suggest **/appXXX → source (app sibling) only if that folder exists
            if (topLevelDirs.has(appFolder)) {
                const appPrefix = `**/${appFolder}`;
                if (!existingPrefixes.has(appPrefix)) {
                    coreSuggestions.push({
                        label: appPrefix,
                        description: `→ ${sourceName}`,
                        detail: `app sibling (name match: "${service}")`,
                        picked: true,
                        prefix: appPrefix,
                        source: sourceName,
                    });
                }
            }
        }

        if (coreSuggestions.length > 0) {
            const confirmedCore = await vscode.window.showQuickPick(coreSuggestions, {
                canPickMany: true,
                title: 'JSql: Suggested prefix mappings — confirm to apply',
                placeHolder: 'Deselect any that do not apply',
            });

            if (confirmedCore && confirmedCore.length > 0) {
                const mappingsToAdd = confirmedCore.map(s => ({ prefix: s.prefix, source: s.source }));
                await writePrefixMappings([...existingMappings, ...mappingsToAdd], wsFolder);
            }
        }

        // ── Phase 2: Gateway scan (opt-in) ──────────────────────────────────────
        const doGateway = await vscode.window.showQuickPick(
            [
                { label: '$(search) Yes, scan for gateway directories', value: true },
                { label: '$(close) No, I\'m done', value: false },
            ],
            { title: 'JSql: Scan for gateway/portal directories that use different schemas?' }
        );

        if (doGateway?.value) {
            const GATEWAY_NAMES = ['gateway', 'portal', 'bridge', 'proxy', 'adapter'];
            const allSources = readSchemaSources(wsFolder);
            const sourceNames = Object.keys(allSources);

            // Find files under gateway-like dirs — two styles:
            //   gateway/lastmile/file.py  (subdirectory style)
            //   gateway_lastmile/file.py  (underscore-joined folder name)
            const gatewayGlobs = [
                `**/{${GATEWAY_NAMES.join(',')}}/**/*.py`,
                `**/{${GATEWAY_NAMES.map(g => g + '_*').join(',')}}/**/*.py`,
            ];
            const gatewayFiles = (await Promise.all(
                gatewayGlobs.map(g => vscode.workspace.findFiles(g, '{**/node_modules/**,**/.git/**}'))
            )).flat();

            // Extract service name — supports all three styles:
            //   gateway/lastmile/     → service = lastmile
            //   gateway_lastmile/     → service = lastmile
            //   gateway/lms_gateway/  → captured = lms_gateway → strip _gateway → service = lms
            const gatewaySuffixRe = new RegExp(`_(?:${GATEWAY_NAMES.join('|')})$`, 'i');
            const gatewayServiceMap = new Map();
            const slashRe = new RegExp(`(?:${GATEWAY_NAMES.join('|')})/([^/]+)/`, 'i');
            const underRe = new RegExp(`(?:${GATEWAY_NAMES.join('|')})_([^/]+?)(?:/|$)`, 'i');
            for (const uri of gatewayFiles) {
                const rel = toRelPath(uri);
                const ms = slashRe.exec(rel);
                const mu = underRe.exec(rel);
                let service, prefixEnd;
                if (ms) {
                    service = ms[1].toLowerCase();
                    prefixEnd = ms.index + ms[0].length - 1;
                } else if (mu) {
                    service = mu[1].toLowerCase();
                    prefixEnd = mu.index + mu[0].replace(/\/$/, '').length;
                } else { continue; }
                // Strip trailing _gateway/_portal/etc. from subfolder names like lms_gateway
                service = service.replace(gatewaySuffixRe, '');
                if (!service) continue;
                const prefix = rel.slice(0, prefixEnd);
                if (!gatewayServiceMap.has(service)) gatewayServiceMap.set(service, new Set());
                gatewayServiceMap.get(service).add(prefix);
            }

            const currentMappings = readPrefixMappings(wsFolder);
            const currentPrefixes = new Set(currentMappings.map(m => m.prefix));
            const gatewaySuggestions = [];

            for (const [service, prefixes] of gatewayServiceMap) {
                // Find a source whose name contains lib{service}
                const matchingSource = sourceNames.find(n =>
                    n.split('/').some(p => p.toLowerCase() === `lib${service}`)
                );
                if (!matchingSource) continue;

                // Suggest the most common/shortest prefix pattern
                const shortestPrefix = [...prefixes].sort((a, b) => a.length - b.length)[0];
                const suggestedPrefix = `**/${shortestPrefix.split('/').slice(-2).join('/')}`;

                if (!currentPrefixes.has(suggestedPrefix)) {
                    gatewaySuggestions.push({
                        label: suggestedPrefix,
                        description: `→ ${matchingSource}`,
                        detail: `gateway override (name match: "lib${service}")`,
                        picked: true,
                        prefix: suggestedPrefix,
                        source: matchingSource,
                    });
                }
            }

            if (gatewaySuggestions.length === 0) {
                vscode.window.showInformationMessage('JSql: No gateway directories with matching schema sources found.');
            } else {
                const confirmedGateway = await vscode.window.showQuickPick(gatewaySuggestions, {
                    canPickMany: true,
                    title: `JSql: Gateway overrides found — these take priority over broader mappings`,
                    placeHolder: 'Deselect any that do not apply',
                });

                if (confirmedGateway && confirmedGateway.length > 0) {
                    const latestMappings = readPrefixMappings(wsFolder);
                    const overrides = confirmedGateway.map(s => ({ prefix: s.prefix, source: s.source }));
                    await writePrefixMappings([...latestMappings, ...overrides], wsFolder);
                }
            }
        }

        vscode.window.showInformationMessage(`JSql: Setup complete. ${added} source${added !== 1 ? 's' : ''} registered.`);
    }, null, context.subscriptions);

    // ─── manageScopes (command palette) ─────────────────────────────────────────

    vscode.commands.registerCommand('jsqlSyntax.manageScopes', async () => {
        const wsFolder = await pickWorkspaceFolder();

        const MAIN = async () => {
            const pick = await vscode.window.showQuickPick([
                { label: '$(database) Manage schema sources', value: 'sources' },
                { label: '$(file-symlink-directory) Manage prefix mappings', value: 'prefixes' },
            ], { title: 'JSql: Schema Configuration' });
            if (!pick) return;
            if (pick.value === 'sources') await SOURCES();
            else await PREFIXES();
        };

        const SOURCES = async () => {
            const sources = readSchemaSources(wsFolder);
            const names = Object.keys(sources);
            const items = [
                { label: '$(add) Add new source', value: 'add' },
                ...names.map(n => ({ label: `$(database) ${n}`, description: (sources[n] || []).join(', '), value: n })),
            ];
            if (names.length) items.push({ label: '$(trash) Remove a source', value: '__remove' });

            const pick = await vscode.window.showQuickPick(items, { title: 'JSql: Schema Sources' });
            if (!pick) return;

            if (pick.value === 'add') {
                const name = await vscode.window.showInputBox({ title: 'New schema source — name', placeHolder: 'liblms', validateInput: v => v.trim() ? null : 'Required' });
                if (!name) return;
                const globs = await vscode.window.showInputBox({ title: `Source "${name}" — file globs`, placeHolder: 'liblms/**/tables.py', validateInput: v => v.trim() ? null : 'Required' });
                if (!globs) return;
                await writeSchemaSources({ ...sources, [name.trim()]: globs.split(',').map(g => g.trim()).filter(Boolean) }, wsFolder);
            } else if (pick.value === '__remove') {
                const del = await vscode.window.showQuickPick(names.map(n => ({ label: n })), { title: 'Remove which source?' });
                if (!del) return;
                const confirmed = await vscode.window.showWarningMessage(`Remove source "${del.label}"?`, { modal: true }, 'Remove');
                if (confirmed !== 'Remove') return;
                const updated = { ...sources };
                delete updated[del.label];
                await writeSchemaSources(updated, wsFolder);
            } else {
                const name = pick.value;
                const globs = await vscode.window.showInputBox({ title: `Edit source "${name}"`, value: (sources[name] || []).join(', '), validateInput: v => v.trim() ? null : 'Required' });
                if (!globs) return;
                await writeSchemaSources({ ...sources, [name]: globs.split(',').map(g => g.trim()).filter(Boolean) }, wsFolder);
            }
        };

        const PREFIXES = async () => {
            const sources = readSchemaSources(wsFolder);
            const mappings = readPrefixMappings(wsFolder);
            const sourceNames = Object.keys(sources);

            const items = [
                { label: '$(add) Add prefix mapping', value: 'add' },
                ...mappings.map((m, i) => ({ label: `$(file-code) ${m.prefix}`, description: `→ ${m.source}`, value: i })),
            ];
            if (mappings.length) items.push({ label: '$(trash) Remove a mapping', value: '__remove' });

            const pick = await vscode.window.showQuickPick(items, { title: 'JSql: Prefix Mappings' });
            if (!pick) return;

            if (pick.value === 'add' || typeof pick.value === 'number') {
                const isEdit = typeof pick.value === 'number';
                const existing = isEdit ? mappings[pick.value] : null;

                const prefix = await vscode.window.showInputBox({
                    title: isEdit ? `Edit mapping: ${existing.prefix}` : 'New prefix mapping',
                    value: existing ? existing.prefix : '',
                    placeHolder: 'src/applms or **/applms',
                    validateInput: v => v.trim() ? null : 'Required',
                });
                if (!prefix) return;

                if (!sourceNames.length) { vscode.window.showWarningMessage('JSql: No schema sources defined yet.'); return; }
                const sourcePick = await vscode.window.showQuickPick(
                    sourceNames.map(n => ({ label: n, description: (sources[n] || []).join(', ') })),
                    { title: `Map "${prefix}" to which source?` }
                );
                if (!sourcePick) return;

                const updated = [...mappings];
                if (isEdit) updated[pick.value] = { prefix: prefix.trim(), source: sourcePick.label };
                else updated.push({ prefix: prefix.trim(), source: sourcePick.label });
                await writePrefixMappings(updated, wsFolder);
            } else if (pick.value === '__remove') {
                const del = await vscode.window.showQuickPick(
                    mappings.map((m, i) => ({ label: m.prefix, description: `→ ${m.source}`, index: i })),
                    { title: 'Remove which mapping?' }
                );
                if (!del) return;
                await writePrefixMappings(mappings.filter((_, i) => i !== del.index), wsFolder);
            }
        };

        await MAIN();
    }, null, context.subscriptions);



    vscode.commands.registerCommand('jsqlSyntax.selectTheme', () => {
        const originalTheme = cfg().get('theme', 'dracula');

        const qp = vscode.window.createQuickPick();
        qp.title = 'JSql: Select Theme';
        qp.placeholder = originalTheme;
        qp.items = Object.keys(THEMES).map(name => ({ label: name }));
        qp.activeItems = qp.items.filter(i => i.label === originalTheme);

        let accepted = false;

        qp.onDidChangeActive(items => {
            if (!items[0]) return;
            Object.values(dec).forEach(d => d.dispose());
            dec = buildDecorations(vscode, items[0].label);
            vscode.window.visibleTextEditors.forEach(applyDecorations);
        });

        qp.onDidAccept(() => {
            accepted = true;
            const selected = qp.activeItems[0];
            qp.hide();
            if (selected) cfg().update('theme', selected.label, vscode.ConfigurationTarget.Global);
        });

        qp.onDidHide(() => {
            if (!accepted) {
                Object.values(dec).forEach(d => d.dispose());
                dec = buildDecorations(vscode, originalTheme);
                vscode.window.visibleTextEditors.forEach(applyDecorations);
            }
            qp.dispose();
        });

        qp.show();
    }, null, context.subscriptions);

    vscode.commands.registerCommand('jsqlSyntax.scopeDebug', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('JSql: No active editor.');
            return;
        }

        const snapshot = buildCompletionDebugSnapshot(editor.document, editor.selection.active);
        debugChannel.clear();
        debugChannel.appendLine('JSql debug snapshot');
        debugChannel.appendLine(`Generated at: ${new Date().toISOString()}`);
        debugChannel.appendLine('');
        debugChannel.appendLine(JSON.stringify(snapshot, null, 2));
        debugChannel.show(true);

        if (snapshot.sqlRangeFound) {
            await vscode.commands.executeCommand('editor.action.triggerSuggest');
            vscode.window.showInformationMessage('JSql: Debug snapshot written to the "JSql Debug" output channel.');
        } else {
            vscode.window.showInformationMessage('JSql: Debug snapshot written to the "JSql Debug" output channel. Cursor is not inside a detected SQL block.');
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('jsqlSyntax.theme')) {
            Object.values(dec).forEach(d => d.dispose());
            dec = buildDecorations(vscode, cfg().get('theme', 'dracula'));
            bracketDec.dispose();
            bracketErrorDec.dispose();
            ({ bracketDec, bracketErrorDec } = createBracketDecorations(vscode));
            vscode.window.visibleTextEditors.forEach(applyDecorations);
        }

        if (e.affectsConfiguration('jsqlSyntax.tableDefinitionFiles') ||
            e.affectsConfiguration('jsqlSyntax.schemaSources') ||
            e.affectsConfiguration('jsqlSyntax.prefixMappings')) {
            scheduleSchemaRefresh();
        }

        if (e.affectsConfiguration('jsqlSyntax.semanticWarnings')) {
            vscode.window.visibleTextEditors.forEach(applyDecorations);
        }
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(applyDecorations, null, context.subscriptions);
    vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
        applyDecorations(textEditor);
    }, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(event => {
        const { document, contentChanges } = event;
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) applyDecorations(editor);

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document !== document || document.languageId !== 'python') return;
        if (contentChanges.length !== 1) return;

        const change = contentChanges[0];
        if (change.rangeLength !== 0 || change.text.length !== 1) return;
        if (!/[A-Za-z_\s]/.test(change.text)) return;

        const offset = change.rangeOffset + change.text.length;
        const text = document.getText();
        const sqlRange = findSQLRanges(text).find(r => r.start <= offset && offset <= r.end);
        if (!sqlRange) return;

        const content = text.slice(sqlRange.start, sqlRange.end);
        const localOffset = offset - sqlRange.start;
        const opaque = buildOpaqueMask(content);
        const schemaMetadata = resolveCompletionMetadata(document);
        const tableContext = findTableNameCompletionContext(content, localOffset, opaque);

        let shouldTriggerSuggest = false;
        if (tableContext) {
            shouldTriggerSuggest = findTableNameCompletions(tableContext.prefix, schemaMetadata).length > 0;
        } else {
            const wordContext = findSqlWordCompletionContext(content, localOffset, opaque);
            shouldTriggerSuggest = !!wordContext && findSqlWordCompletions(wordContext.prefix).length > 0;
        }

        if (!shouldTriggerSuggest) return;

        setTimeout(() => {
            const currentEditor = vscode.window.activeTextEditor;
            if (!currentEditor || currentEditor.document !== document) return;
            vscode.commands.executeCommand('editor.action.triggerSuggest');
        }, 25);
    }, null, context.subscriptions);
    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== 'python') return;
        if (!getConfiguredTableDefinitionFiles().length) return;
        scheduleSchemaRefresh();
    }, null, context.subscriptions);

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('python', {
            provideDefinition(doc, position) {
                const schemaMetadata = resolveCompletionMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const wordRange = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
                if (!wordRange) return null;
                const word = doc.getText(wordRange).toLowerCase();

                const content = text.slice(sqlRange.start, sqlRange.end);
                const cteNames = findCTENames(content);
                const { aliasMap } = findTableReferences(content, schemaMetadata, cteNames);

                const lineText = doc.lineAt(position).text;
                const textBeforeWord = lineText.slice(0, wordRange.start.character);
                const qualifierMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\.$/.exec(textBeforeWord);

                // --- Column: jump to the FROM/JOIN where it comes from ---
                const isColumn = schemaMetadata.columns.has(word) &&
                    (qualifierMatch || (!schemaMetadata.tables.has(word) && !aliasMap.has(word)));

                if (isColumn) {
                    const { cteSchema } = findSemanticEntityRanges(content, schemaMetadata);

                    // Build CTE alias map for this block
                    const cteAliasMap = new Map();
                    for (const [cteName] of cteSchema) cteAliasMap.set(cteName, cteName);
                    const cteTblAliasRe2 = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
                    let cm;
                    while ((cm = cteTblAliasRe2.exec(content)) !== null) {
                        const tbl = cm[1].toLowerCase();
                        const alias = cm[2].toLowerCase();
                        if (cteSchema.has(tbl) && !ALL_SQL_KEYWORDS.has(cm[2].toUpperCase()))
                            cteAliasMap.set(alias, tbl);
                    }

                    if (qualifierMatch) {
                        const qualifier = qualifierMatch[1].toLowerCase();

                        // CTE column: jump to where the alias is defined in the CTE body
                        const cteName = cteAliasMap.get(qualifier);
                        if (cteName) {
                            const cols = cteSchema.get(cteName);
                            const offset = cols?.get(word);
                            if (offset !== undefined) {
                                return new vscode.Location(doc.uri, doc.positionAt(sqlRange.start + offset));
                            }
                        }

                        // Schema column: jump to FROM/JOIN of the resolved table
                        const sourceRef = aliasMap.get(qualifier) || null;
                        if (sourceRef) {
                            return new vscode.Location(doc.uri, doc.positionAt(sqlRange.start + sourceRef.tableStart));
                        }
                    } else {
                        // Unqualified: find which tables in this query own this column
                        const owningRefs = [...aliasMap.values()].filter(
                            r => schemaMetadata.tableColumns.get(r.normalizedName)?.has(word)
                        );
                        const unique = [...new Map(owningRefs.map(r => [r.normalizedName, r])).values()];
                        if (unique.length === 1) {
                            return new vscode.Location(doc.uri, doc.positionAt(sqlRange.start + unique[0].tableStart));
                        }
                    }
                    return null;
                }

                // --- Table alias: jump to FROM/JOIN in query ---
                // Only match if word IS the alias, not the bare table name
                // (aliasMap keys both alias and table name)
                const ref = aliasMap.get(word);
                if (ref && ref.alias && ref.alias.toLowerCase() === word) {
                    return new vscode.Location(doc.uri, doc.positionAt(sqlRange.start + ref.tableStart));
                }

                // --- Bare table name: jump to __tablename__ in model file ---
                if (!schemaMetadata.tables.has(word)) return null;

                const loc = schemaMetadata.tableLocations.get(word);
                if (!loc?.uri) return null;

                try {
                    const targetUri = vscode.Uri.parse(loc.uri);
                    const existing = vscode.workspace.textDocuments.find(d => d.uri.toString() === loc.uri);
                    if (existing) {
                        return new vscode.Location(targetUri, existing.positionAt(loc.offset));
                    }
                    return vscode.workspace.openTextDocument(targetUri).then(
                        opened => new vscode.Location(targetUri, opened.positionAt(loc.offset)),
                        () => new vscode.Location(targetUri, new vscode.Position(0, 0))
                    );
                } catch {
                    return null;
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.languages.registerHoverProvider('python', {
            provideHover(doc, position) {
                const schemaMetadata = resolveMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const wordRange = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
                if (!wordRange) return null;
                const word = doc.getText(wordRange).toLowerCase();

                // Build alias map for this SQL block
                const content = text.slice(sqlRange.start, sqlRange.end);
                const cteNames = findCTENames(content);
                const { aliasMap } = findTableReferences(content, schemaMetadata, cteNames);

                // Helper: render a table definition as a hover
                function tableHover(tableName, label) {
                    const columns = schemaMetadata.tableColumns.get(tableName);
                    const types = schemaMetadata.columnTypes.get(tableName);
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**${tableName}** *(${label})*\n\n`);
                    if (columns && columns.size > 0) {
                        md.appendMarkdown('| Column | Type |\n|---|---|\n');
                        for (const col of [...columns].sort()) {
                            const type = types?.get(col) || '—';
                            md.appendMarkdown(`| \`${col}\` | \`${type}\` |\n`);
                        }
                    }
                    return new vscode.Hover(md, wordRange);
                }

                // Check if word is preceded by qualifier. (e.g. uc.created_at)
                const lineText = doc.lineAt(position).text;
                const textBeforeWord = lineText.slice(0, wordRange.start.character);
                const qualifierMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\.$/.exec(textBeforeWord);

                if (qualifierMatch) {
                    const qualifier = qualifierMatch[1].toLowerCase();
                    // Resolve alias or direct table name
                    const ref = aliasMap.get(qualifier);
                    const tableName = ref ? ref.normalizedName : (schemaMetadata.tables.has(qualifier) ? qualifier : null);
                    if (tableName && schemaMetadata.columns.has(word)) {
                        const type = schemaMetadata.columnTypes.get(tableName)?.get(word) || '—';
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${word}** *(column of \`${tableName}\`)*\n\nType: \`${type}\``);
                        return new vscode.Hover(md, wordRange);
                    }
                    return null;
                }

                // Hovering over a table name
                if (schemaMetadata.tables.has(word)) {
                    return tableHover(word, 'table');
                }

                // Hovering over an alias (e.g. uc, scj) — show the table it refers to
                const ref = aliasMap.get(word);
                if (ref && schemaMetadata.tables.has(ref.normalizedName)) {
                    return tableHover(ref.normalizedName, `alias for ${ref.tableName}`);
                }

                // Unqualified column — filter to tables actually used in this query
                if (schemaMetadata.columns.has(word)) {
                    const tablesInQuery = new Set([...aliasMap.values()].map(r => r.normalizedName));
                    let entries = [];
                    for (const [tableName, cols] of schemaMetadata.tableColumns.entries()) {
                        if (!cols.has(word)) continue;
                        if (tablesInQuery.size > 0 && !tablesInQuery.has(tableName)) continue;
                        const type = schemaMetadata.columnTypes.get(tableName)?.get(word) || '—';
                        entries.push({ table: tableName, type });
                    }
                    // Fall back to all tables if no query tables matched
                    if (entries.length === 0) {
                        for (const [tableName, cols] of schemaMetadata.tableColumns.entries()) {
                            if (!cols.has(word)) continue;
                            const type = schemaMetadata.columnTypes.get(tableName)?.get(word) || '—';
                            entries.push({ table: tableName, type });
                        }
                    }
                    if (entries.length === 0) return null;
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**${word}** *(column)*\n\n`);
                    md.appendMarkdown('| Table | Type |\n|---|---|\n');
                    for (const { table, type } of entries) {
                        md.appendMarkdown(`| \`${table}\` | \`${type}\` |\n`);
                    }
                    return new vscode.Hover(md, wordRange);
                }

                return null;
            }
        })
    );

    // Rename symbol — renames a table alias or column alias throughout the SQL block
    context.subscriptions.push(
        vscode.languages.registerRenameProvider('python', {
            prepareRename(doc, position) {
                const schemaMetadata = resolveMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const wordRange = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
                if (!wordRange) return null;
                const word = doc.getText(wordRange).toLowerCase();

                const content = text.slice(sqlRange.start, sqlRange.end);
                const cteNames = findCTENames(content);
                const { aliasMap } = findTableReferences(content, schemaMetadata, cteNames);
                const opaque = buildOpaqueMask(content);

                // Only allow renaming aliases (table or column), not raw table/column names
                const isTableAlias = aliasMap.has(word) && aliasMap.get(word).alias?.toLowerCase() === word;
                // Column alias: check colAliasRanges
                const colAliasNames = new Set(
                    findSemanticEntityRanges(content, schemaMetadata).colAliasRanges
                        .map(r => content.slice(r.start, r.end).toLowerCase())
                );
                const isColAlias = colAliasNames.has(word);

                if (!isTableAlias && !isColAlias) return null;
                return { range: wordRange, placeholder: doc.getText(wordRange) };
            },

            provideRenameEdits(doc, position, newName) {
                const schemaMetadata = resolveMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const wordRange = doc.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
                if (!wordRange) return null;
                const word = doc.getText(wordRange).toLowerCase();

                const content = text.slice(sqlRange.start, sqlRange.end);
                const opaque = buildOpaqueMask(content);
                const edit = new vscode.WorkspaceEdit();

                // Find all non-opaque occurrences of the word token in the SQL block
                const re = new RegExp(`\\b${word}\\b`, 'gi');
                let m;
                while ((m = re.exec(content)) !== null) {
                    if (rangeOverlapsOpaque(opaque, m.index, m.index + m[0].length)) continue;
                    const start = doc.positionAt(sqlRange.start + m.index);
                    const end = doc.positionAt(sqlRange.start + m.index + m[0].length);
                    edit.replace(doc.uri, new vscode.Range(start, end), newName);
                }

                return edit;
            }
        })
    );

    // Column completions — triggered by `.` after a table alias
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('python', {
            provideCompletionItems(doc, position) {
                const schemaMetadata = resolveMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const lineText = doc.lineAt(position).text;
                const textBefore = lineText.slice(0, position.character);
                const qualifierMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\.$/.exec(textBefore);
                if (!qualifierMatch) return null;

                const qualifier = qualifierMatch[1].toLowerCase();
                const content = text.slice(sqlRange.start, sqlRange.end);
                const cteNames = findCTENames(content);
                const { aliasMap } = findTableReferences(content, schemaMetadata, cteNames);

                const ref = aliasMap.get(qualifier);
                const tableName = ref
                    ? ref.normalizedName
                    : (schemaMetadata.tables.has(qualifier) ? qualifier : null);
                if (!tableName) return null;

                const columns = schemaMetadata.tableColumns.get(tableName);
                const types = schemaMetadata.columnTypes.get(tableName);
                if (!columns) return null;

                return [...columns].sort().map(col => {
                    const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field);
                    const type = types?.get(col);
                    item.detail = type ? `${tableName}.${col} (${type})` : `${tableName}.${col}`;
                    item.documentation = new vscode.MarkdownString(`Column of \`${tableName}\``);
                    return item;
                });
            }
        }, '.')
    );

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('python', {
            provideCompletionItems(doc, position) {
                const schemaMetadata = resolveMetadata(doc);
                const text = doc.getText();
                const offset = doc.offsetAt(position);
                const sqlRanges = findSQLRanges(text);
                const sqlRange = sqlRanges.find(r => r.start <= offset && offset <= r.end);
                if (!sqlRange) return null;

                const content = text.slice(sqlRange.start, sqlRange.end);
                const localOffset = offset - sqlRange.start;
                const opaque = buildOpaqueMask(content);
                const tableContext = findTableNameCompletionContext(content, localOffset, opaque);
                if (tableContext) {
                    const matches = findTableNameCompletions(tableContext.prefix, schemaMetadata);
                    if (!matches.length) return null;

                    const replaceStart = doc.positionAt(sqlRange.start + tableContext.prefixStart);
                    const replaceRange = new vscode.Range(replaceStart, position);
                    return matches.map(match => {
                        const item = new vscode.CompletionItem(match.label, vscode.CompletionItemKind.Class);
                        item.insertText = match.label;
                        item.range = replaceRange;
                        item.detail = match.columnCount
                            ? `Known schema table (${match.columnCount} columns)`
                            : 'Known schema table';
                        item.documentation = new vscode.MarkdownString(
                            match.columnCount
                                ? `Schema table \`${match.label}\` with ${match.columnCount} columns`
                                : `Schema table \`${match.label}\``
                        );
                        item.sortText = `0_${match.label}`;
                        return item;
                    });
                }

                const wordContext = findSqlWordCompletionContext(content, localOffset, opaque);
                if (!wordContext) return null;

                const matches = findSqlWordCompletions(wordContext.prefix);
                if (!matches.length) return null;

                const prefixStartPos = doc.positionAt(sqlRange.start + wordContext.prefixStart);
                const wordPosition = position.character > 0 ? position.translate(0, -1) : position;
                const wordRange = doc.getWordRangeAtPosition(wordPosition, /[A-Za-z_][A-Za-z0-9_]*/);
                const replaceRange = wordRange && !wordRange.start.isAfter(position)
                    ? wordRange
                    : new vscode.Range(prefixStartPos, position);

                return matches.map(match => {
                    const itemKind = match.kind === 'function'
                        ? vscode.CompletionItemKind.Function
                        : vscode.CompletionItemKind.Keyword;
                    const item = new vscode.CompletionItem(match.label, itemKind);
                    item.insertText = match.label;
                    item.range = replaceRange;
                    item.detail = match.kind === 'function'
                        ? 'SQL function'
                        : (match.kind === 'mixed' ? 'SQL keyword / function' : 'SQL keyword');
                    item.documentation = new vscode.MarkdownString(
                        match.kind === 'function'
                            ? `SQL function \`${match.label}\``
                            : `SQL keyword \`${match.label}\``
                    );
                    item.sortText = `${match.kind === 'function' ? '1' : '0'}_${match.label}`;
                    return item;
                });
            }
        }, ...SQL_COMPLETION_TRIGGER_CHARS)
    );

    context.subscriptions.push(bracketDec);
    context.subscriptions.push(bracketErrorDec);
    vscode.window.visibleTextEditors.forEach(applyDecorations);
    scheduleSchemaRefresh();
}

function deactivate() { }
module.exports = {
    activate,
    buildFormattedSQLBlock,
    createEmptySchemaMetadata,
    deactivate,
    detectAmbiguousColumns,
    detectDuplicateAliases,
    detectMissingSelectCommas,
    detectUnionCommentAdjacency,
    findClosestName,
    findMatchingBracket,
    findSemanticEntityRanges,
    findSemanticWarnings,
    findSQLRanges,
    findUnmatchedBrackets,
    formatSQL,
    isWorkspaceRelativeGlobPattern,
    mergeSchemaMetadata,
    parseTableDefinitionFile,
};
