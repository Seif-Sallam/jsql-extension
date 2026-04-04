'use strict';

const { ALL_SQL_KEYWORD_LIST, SQL_FUNCTIONS, SQL_KEYWORDS, buildOpaqueMask } = require('./shared');

const MIN_SQL_COMPLETION_PREFIX = 2;
const TABLE_NAME_CONTEXT_RE = /\b(FROM|JOIN|UPDATE|INTO|TABLE|DELETE\s+FROM)\s+((?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*))?$/i;

function overlapsOpaque(opaque, start, end) {
    for (let i = start; i < end; i++) {
        if (opaque[i]) return true;
    }
    return false;
}

function findSqlWordCompletions(prefix) {
    const normalizedPrefix = (prefix || '').trim().toUpperCase();
    if (normalizedPrefix.length < MIN_SQL_COMPLETION_PREFIX) return [];

    return ALL_SQL_KEYWORD_LIST
        .filter(label => label.startsWith(normalizedPrefix))
        .map(label => ({
            label,
            kind: SQL_FUNCTIONS.has(label)
                ? (SQL_KEYWORDS.has(label) ? 'mixed' : 'function')
                : 'keyword',
        }));
}

function findSqlWordCompletionContext(sql, cursorOffset, opaque = buildOpaqueMask(sql)) {
    if (typeof sql !== 'string') return null;
    if (cursorOffset < 0 || cursorOffset > sql.length) return null;

    const prefixMatch = /[A-Za-z_][A-Za-z0-9_]*$/.exec(sql.slice(0, cursorOffset));
    if (!prefixMatch) return null;

    const prefix = prefixMatch[0];
    const prefixStart = cursorOffset - prefix.length;
    const charBeforePrefix = sql[prefixStart - 1];
    if (charBeforePrefix === '.' || charBeforePrefix === ':') return null;
    if (overlapsOpaque(opaque, prefixStart, Math.max(prefixStart + 1, cursorOffset))) return null;

    return {
        prefix,
        prefixStart,
    };
}

function findTableNameCompletionContext(sql, cursorOffset, opaque = buildOpaqueMask(sql)) {
    if (typeof sql !== 'string') return null;
    if (cursorOffset < 0 || cursorOffset > sql.length) return null;

    const beforeCursor = sql.slice(0, cursorOffset);
    const match = TABLE_NAME_CONTEXT_RE.exec(beforeCursor);
    if (!match) return null;

    const prefix = match[3] || '';
    const prefixStart = cursorOffset - prefix.length;
    const opaqueStart = prefix.length > 0 ? prefixStart : Math.max(0, cursorOffset - 1);
    if (overlapsOpaque(opaque, opaqueStart, Math.max(opaqueStart + 1, cursorOffset))) return null;

    return {
        keyword: match[1].toUpperCase().replace(/\s+/g, ' '),
        prefix,
        prefixStart,
    };
}

function rankCompletionLabels(labels, normalizedPrefix) {
    if (!normalizedPrefix) return labels.slice();

    const exact = [];
    const prefix = [];
    const suffix = [];
    const contains = [];

    for (const label of labels) {
        if (label === normalizedPrefix) {
            exact.push(label);
        } else if (label.startsWith(normalizedPrefix)) {
            prefix.push(label);
        } else if (label.endsWith(normalizedPrefix)) {
            suffix.push(label);
        } else if (label.includes(normalizedPrefix)) {
            contains.push(label);
        }
    }

    return [...exact, ...prefix.sort(), ...suffix.sort(), ...contains.sort()];
}

function findTableNameCompletions(prefix, schemaMetadata, cteNames = new Set(), cteSchema = new Map()) {
    const normalizedPrefix = (prefix || '').trim().toLowerCase();
    const candidates = new Map();

    for (const cteName of cteNames) {
        candidates.set(cteName, {
            label: cteName,
            kind: 'cte',
            columnCount: cteSchema.get(cteName)?.size || 0,
        });
    }

    for (const [cteName, cols] of cteSchema.entries()) {
        candidates.set(cteName, {
            label: cteName,
            kind: 'cte',
            columnCount: cols?.size || 0,
        });
    }

    const tables = schemaMetadata?.tables ? [...schemaMetadata.tables] : [];
    for (const tableName of tables) {
        if (candidates.has(tableName)) continue;
        candidates.set(tableName, {
            label: tableName,
            kind: 'table',
            columnCount: schemaMetadata.tableColumns.get(tableName)?.size || 0,
        });
    }

    const cteLabels = rankCompletionLabels(
        [...candidates.values()].filter(item => item.kind === 'cte').map(item => item.label),
        normalizedPrefix
    );
    const tableLabels = rankCompletionLabels(
        [...candidates.values()].filter(item => item.kind === 'table').map(item => item.label),
        normalizedPrefix
    );

    return [...cteLabels, ...tableLabels]
        .map(label => candidates.get(label))
        .filter(Boolean);
}

module.exports = {
    findSqlWordCompletionContext,
    findTableNameCompletionContext,
    findTableNameCompletions,
    findSqlWordCompletions,
    MIN_SQL_COMPLETION_PREFIX,
};
