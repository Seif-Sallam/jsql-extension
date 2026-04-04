'use strict';

const { ALL_SQL_KEYWORDS, isJinjaControlTag, matchKeyword } = require('./shared');
const { buildOpaqueMask, buildSemanticOpaqueMask } = require('./shared');
const { createEmptySchemaMetadata } = require('../schema/metadata');
const { findCTENames, findTableReferences, rangeOverlapsOpaque } = require('./semantic');

const SELECT_START_RE = /^SELECT(?:\s+DISTINCT)?\b/i;
const SELECT_ONLY_RE = /^SELECT(?:\s+DISTINCT)?\s*$/i;
const SELECT_PREFIX_RE = /^SELECT(?:\s+DISTINCT)?\s+/i;
const CLAUSE_START_RE = /^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|UNION(?: ALL)?|INTERSECT|EXCEPT|RETURNING|WINDOW|QUALIFY)\b/i;
const NON_COLUMN_CONTINUATION_RE = /^(AND|OR|WHEN|THEN|ELSE|END|OVER|FILTER)\b|^[),]/i;

function stripComment(line) {
    return line.replace(/\s--.*$/, '');
}

function lineLooksLikeColumnStart(text) {
    if (!text) return false;
    if (CLAUSE_START_RE.test(text) || NON_COLUMN_CONTINUATION_RE.test(text)) return false;
    return /^[A-Za-z_("*`['"0-9]/i.test(text);
}

function lineEndsLikeColumnContinuation(text) {
    return /(?:[,([]|->>|->|\+|-|\*|\/|%|=|<|>|<>|!=|<=|>=|AND|OR|WHEN|THEN|ELSE|CASE|SELECT(?:\s+DISTINCT)?)$/i.test(text);
}

function splitAtFrom(text) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') { depth++; continue; }
        if (text[i] === ')') { depth--; continue; }
        if (depth === 0 && matchKeyword(text, i, 'FROM')) {
            return {
                beforeFrom: text.slice(0, i).trim(),
                afterFrom: text.slice(i).trim(),
            };
        }
    }
    return null;
}

function scanLineStructure(text, startParenDepth, startCaseDepth) {
    const selectStarts = [];
    let parenDepth = startParenDepth;
    let caseDepth = startCaseDepth;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '\'' || ch === '"') {
            const quote = ch;
            i++;
            while (i < text.length) {
                if (text[i] === quote) {
                    if (text[i + 1] === quote) {
                        i += 2;
                        continue;
                    }
                    break;
                }
                i++;
            }
            continue;
        }

        if (ch === '(') {
            parenDepth++;
            continue;
        }

        if (ch === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            continue;
        }

        if (matchKeyword(text, i, 'SELECT')) {
            selectStarts.push({ index: i, parenDepth, caseDepth });
            i += 5;
            continue;
        }

        if (matchKeyword(text, i, 'CASE')) {
            caseDepth++;
            i += 3;
            continue;
        }

        if (matchKeyword(text, i, 'END')) {
            caseDepth = Math.max(0, caseDepth - 1);
            i += 2;
        }
    }

    return { endParenDepth: parenDepth, endCaseDepth: caseDepth, selectStarts };
}

function beginSelectContext(lineText, selectIndex, baseParenDepth, baseCaseDepth) {
    const selectContext = {
        baseParenDepth,
        baseCaseDepth,
        previousColumn: null,
    };
    const selectText = lineText.slice(selectIndex).trimStart();

    if (SELECT_ONLY_RE.test(selectText)) {
        return selectContext;
    }

    const selectRemainder = selectText.replace(SELECT_PREFIX_RE, '').trim();
    const inlineSplit = splitAtFrom(selectRemainder);
    const inlineColumn = inlineSplit ? inlineSplit.beforeFrom : selectRemainder;

    if (inlineColumn) {
        selectContext.previousColumn = { text: inlineColumn };
    }

    return inlineSplit ? null : selectContext;
}

function detectAmbiguousColumns(sql, schemaMetadata = createEmptySchemaMetadata()) {
    const diagnostics = [];
    if (!schemaMetadata.tables.size) return diagnostics;

    const opaque = buildSemanticOpaqueMask(sql);
    const cteNames = findCTENames(sql, opaque);
    const { tableReferences } = findTableReferences(sql, schemaMetadata, cteNames, opaque);

    // Build paren depth at each position so we can exclude subquery-scoped tables
    const depths = new Array(sql.length).fill(0);
    let d = 0;
    for (let i = 0; i < sql.length; i++) {
        if (!opaque[i]) {
            if (sql[i] === '(') d++;
            else if (sql[i] === ')') d = Math.max(0, d - 1);
        }
        depths[i] = d;
    }

    // Find the first UNION/INTERSECT/EXCEPT at depth 0 — each branch is an independent scope
    let queryEnd = sql.length;
    const setOpRe = /\b(?:UNION|INTERSECT|EXCEPT)\b/gi;
    let so;
    while ((so = setOpRe.exec(sql)) !== null) {
        if (!opaque[so.index] && depths[so.index] === 0) { queryEnd = so.index; break; }
    }

    // Only consider top-level SELECT sources (depth 0, before first UNION/INTERSECT/EXCEPT)
    // Exclude INSERT/INTO targets — they are write destinations, not query sources
    const topLevelRefs = tableReferences.filter(ref =>
        depths[ref.tableStart] === 0 &&
        ref.tableStart < queryEnd &&
        ref.keyword !== 'INTO' &&
        ref.keyword !== 'TABLE'
    );

    // Build set of columns that exist in 2+ top-level tables
    const colTableCount = new Map();
    for (const ref of topLevelRefs) {
        const cols = schemaMetadata.tableColumns.get(ref.normalizedName);
        if (!cols) continue;
        for (const col of cols) {
            if (!colTableCount.has(col)) colTableCount.set(col, new Set());
            colTableCount.get(col).add(ref.normalizedName);
        }
    }
    // Columns used in USING(...) are intentionally shared — not ambiguous
    const usingCols = new Set();
    const usingRe = /\bUSING\s*\(([^)]+)\)/gi;
    let um;
    while ((um = usingRe.exec(sql)) !== null) {
        if (rangeOverlapsOpaque(opaque, um.index, um.index + um[0].length)) continue;
        for (const col of um[1].split(',')) usingCols.add(col.trim().toLowerCase());
    }

    const ambiguous = new Map(
        [...colTableCount.entries()].filter(([col, tables]) => tables.size > 1 && !usingCols.has(col))
    );
    if (!ambiguous.size) return diagnostics;

    // Find unqualified uses of ambiguous columns — only at top-level scope
    const identRe = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m;
    while ((m = identRe.exec(sql)) !== null) {
        const col = m[1].toLowerCase();
        if (!ambiguous.has(col)) continue;
        if (m.index >= queryEnd) continue;                // past first UNION branch
        if (depths[m.index] > 0) continue;                // inside subquery
        if (rangeOverlapsOpaque(opaque, m.index, m.index + m[0].length)) continue;
        // Skip if preceded by `.` (qualified reference) or `:` (bind parameter)
        if (m.index > 0 && (sql[m.index - 1] === '.' || sql[m.index - 1] === ':')) continue;
        // Skip if followed by `.` (it's a table/alias qualifier itself)
        if (m.index + m[0].length < sql.length && sql[m.index + m[0].length] === '.') continue;
        // Skip alias definitions — token immediately after AS keyword
        if (/\bAS\s*$/i.test(sql.slice(0, m.index))) continue;
        const tables = [...ambiguous.get(col)].sort().join(', ');
        diagnostics.push({
            start: m.index,
            end: m.index + m[0].length,
            message: `Ambiguous column "${m[1]}" — exists in: ${tables}. Qualify it with a table alias.`,
            severity: 'error',
        });
    }

    return diagnostics;
}

module.exports = {
    detectAmbiguousColumns,
    detectDuplicateAliases,
    detectMissingSelectCommas,
};

function detectDuplicateAliases(sql) {
    const diagnostics = [];
    const opaque = buildOpaqueMask(sql);
    const lines = sql.split('\n');
    let offset = 0;
    let inSelect = false;
    let parenDepth = 0;
    let selectAliases = new Map(); // normalized -> { start, end }

    for (const rawLine of lines) {
        const lineOffset = offset;
        offset += rawLine.length + 1;

        const withoutComment = stripComment(rawLine);
        const trimmed = withoutComment.trim();
        if (!trimmed) continue;

        const depthAtLineStart = parenDepth;
        for (const ch of trimmed) {
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
        }
        if (depthAtLineStart > 0) continue;

        if (!inSelect) {
            if (!SELECT_START_RE.test(trimmed)) continue;
            selectAliases = new Map();
            inSelect = true;
            const remainder = trimmed.replace(SELECT_PREFIX_RE, '');
            if (splitAtFrom(remainder)) inSelect = false;
            continue;
        }

        if (splitAtFrom(trimmed)) { inSelect = false; continue; }

        const lineStart = lineOffset + rawLine.indexOf(trimmed);
        const aliasPatterns = [
            /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi,
            /(?:\)|'|\b\d+(?:\.\d+)?|(?:\.[A-Za-z_][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|$))/gm,
        ];
        for (const re of aliasPatterns) {
            let m;
            while ((m = re.exec(trimmed)) !== null) {
                const alias = m[1];
                if (!alias || ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
                const start = lineStart + m.index + m[0].length - alias.length;
                const end = start + alias.length;
                if (rangeOverlapsOpaque(opaque, start, end)) continue;
                const key = alias.toLowerCase();
                if (selectAliases.has(key)) {
                    diagnostics.push({ start, end, message: `Duplicate alias "${alias}" in SELECT.` });
                } else {
                    selectAliases.set(key, { start, end });
                }
            }
        }
    }

    return diagnostics;
}

function detectMissingSelectCommas(sql) {
    const diagnostics = [];
    const lines = sql.split('\n');
    let offset = 0;
    let parenDepth = 0;
    const caseStack = [];
    const selectStack = [];

    for (const rawLine of lines) {
        const lineOffset = offset;
        offset += rawLine.length + 1;

        const withoutComment = stripComment(rawLine);
        const trimmed = withoutComment.trim();
        if (!trimmed) continue;

        const startParenDepth = parenDepth;
        const startCaseDepth = caseStack.length;
        const { endParenDepth, endCaseDepth, selectStarts } = scanLineStructure(
            withoutComment,
            startParenDepth,
            startCaseDepth
        );

        const activeSelect = selectStack[selectStack.length - 1];
        if (activeSelect) {
            const atTopLevelStart =
                startParenDepth === activeSelect.baseParenDepth &&
                startCaseDepth === activeSelect.baseCaseDepth;

            if (atTopLevelStart) {
                const lineSplit = splitAtFrom(trimmed);
                if (lineSplit) {
                    selectStack.pop();
                } else if (!lineLooksLikeColumnStart(trimmed)) {
                    // Don't let Jinja tags overwrite previousColumn — they're not SQL
                    if (activeSelect.previousColumn && !isJinjaControlTag(trimmed) && !/^\{[{#%]/.test(trimmed)) {
                        activeSelect.previousColumn = { text: trimmed };
                    }
                } else {
                    if (
                        activeSelect.previousColumn &&
                        !activeSelect.previousColumn.text.endsWith(',') &&
                        !lineEndsLikeColumnContinuation(activeSelect.previousColumn.text)
                    ) {
                        const start = lineOffset + rawLine.indexOf(trimmed);
                        diagnostics.push({
                            start,
                            end: start + trimmed.length,
                            message: 'Possible missing comma between SELECT columns.',
                        });
                    }

                    activeSelect.previousColumn = { text: trimmed };
                }
            } else {
                const returnedToTopLevel =
                    endParenDepth === activeSelect.baseParenDepth &&
                    endCaseDepth === activeSelect.baseCaseDepth;
                if (returnedToTopLevel && activeSelect.previousColumn) {
                    activeSelect.previousColumn = { text: trimmed };
                }
            }
        }

        for (const selectStart of selectStarts) {
            const selectContext = beginSelectContext(
                withoutComment,
                selectStart.index,
                selectStart.parenDepth,
                selectStart.caseDepth
            );
            if (selectContext) {
                selectStack.push(selectContext);
            }
        }

        parenDepth = endParenDepth;

        while (caseStack.length < endCaseDepth) caseStack.push({});
        while (caseStack.length > endCaseDepth) caseStack.pop();
    }

    return diagnostics;
}
