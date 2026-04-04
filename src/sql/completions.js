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

function findTableNameCompletions(prefix, schemaMetadata) {
    const normalizedPrefix = (prefix || '').trim().toLowerCase();
    const tables = schemaMetadata?.tables ? [...schemaMetadata.tables] : [];

    if (!normalizedPrefix) {
        return tables.sort().map(tableName => ({
            label: tableName,
            kind: 'table',
            columnCount: schemaMetadata.tableColumns.get(tableName)?.size || 0,
        }));
    }

    const exact = [];
    const prefix_ = [];
    const suffix = [];
    const contains = [];

    for (const tableName of tables) {
        if (tableName === normalizedPrefix) {
            exact.push(tableName);
        } else if (tableName.startsWith(normalizedPrefix)) {
            prefix_.push(tableName);
        } else if (tableName.endsWith(normalizedPrefix)) {
            suffix.push(tableName);
        } else if (tableName.includes(normalizedPrefix)) {
            contains.push(tableName);
        }
    }

    return [...exact, ...prefix_.sort(), ...suffix.sort(), ...contains.sort()].map(tableName => ({
        label: tableName,
        kind: 'table',
        columnCount: schemaMetadata.tableColumns.get(tableName)?.size || 0,
    }));
}

module.exports = {
    findSqlWordCompletionContext,
    findTableNameCompletionContext,
    findTableNameCompletions,
    findSqlWordCompletions,
    MIN_SQL_COMPLETION_PREFIX,
};
