'use strict';

const { levenshtein } = require('../sql/shared');

function createEmptySchemaMetadata() {
    return {
        tables: new Set(),
        columns: new Set(),
        tableColumns: new Map(),
        columnTypes: new Map(),
        tableLocations: new Map(),
        columnLocations: new Map(),
        sourceUris: new Set(),
    };
}

function extractColumnType(raw) {
    if (!raw) return '';
    const type = raw.trim();
    if (/^ForeignKey\b/i.test(type)) return '';
    const parts = type.split('.');
    return parts[parts.length - 1].trim();
}

function isWorkspaceRelativeGlobPattern(pattern) {
    if (typeof pattern !== 'string') return false;
    const trimmed = pattern.trim();
    if (!trimmed) return false;

    const normalized = trimmed.replace(/\\/g, '/');
    if (/^(~|\/|[A-Za-z]:\/)/.test(normalized)) return false;
    if (normalized.split('/').includes('..')) return false;
    return true;
}

function findClosestName(word, candidates) {
    let best = null;
    let bestDist = Infinity;

    for (const candidate of candidates) {
        if (candidate.startsWith(word) || word.startsWith(candidate)) {
            const prefixDistance = Math.abs(candidate.length - word.length);
            if (prefixDistance < bestDist) {
                bestDist = prefixDistance;
                best = candidate;
            }
            continue;
        }

        if (Math.abs(candidate.length - word.length) > 3) continue;
        const distance = levenshtein(word, candidate);
        if (distance < bestDist) {
            bestDist = distance;
            best = candidate;
        }
    }

    return bestDist <= 5 ? best : null;
}

function mergeSchemaMetadata(target, source) {
    for (const tableName of source.tables) {
        target.tables.add(tableName);
    }

    for (const columnName of source.columns) {
        target.columns.add(columnName);
    }

    for (const [tableName, columns] of source.tableColumns.entries()) {
        let tableColumns = target.tableColumns.get(tableName);
        if (!tableColumns) {
            tableColumns = new Set();
            target.tableColumns.set(tableName, tableColumns);
        }
        for (const columnName of columns) {
            tableColumns.add(columnName);
        }
    }

    for (const [tableName, loc] of source.tableLocations.entries()) {
        if (!target.tableLocations.has(tableName)) target.tableLocations.set(tableName, loc);
    }

    for (const [tableName, colLocs] of source.columnLocations.entries()) {
        if (!target.columnLocations.has(tableName)) {
            target.columnLocations.set(tableName, new Map(colLocs));
        } else {
            for (const [columnName, loc] of colLocs.entries()) {
                if (!target.columnLocations.get(tableName).has(columnName)) {
                    target.columnLocations.get(tableName).set(columnName, loc);
                }
            }
        }
    }

    for (const [tableName, colTypes] of source.columnTypes.entries()) {
        let targetColTypes = target.columnTypes.get(tableName);
        if (!targetColTypes) {
            targetColTypes = new Map();
            target.columnTypes.set(tableName, targetColTypes);
        }
        for (const [columnName, type] of colTypes.entries()) {
            targetColTypes.set(columnName, type);
        }
    }

    for (const sourceUri of source.sourceUris) {
        target.sourceUris.add(sourceUri);
    }
}

function parseTableDefinitionFile(text) {
    const metadata = createEmptySchemaMetadata();
    const classRe = /^class\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*:\s*$/gm;
    const classStarts = [];
    let match;

    while ((match = classRe.exec(text)) !== null) {
        classStarts.push(match.index);
    }

    for (let i = 0; i < classStarts.length; i++) {
        const blockStart = classStarts[i];
        const blockEnd = i + 1 < classStarts.length ? classStarts[i + 1] : text.length;
        const block = text.slice(blockStart, blockEnd);
        const tableNameMatch = /^\s*__tablename__\s*=\s*(['"])([^'"]+)\1/m.exec(block);
        if (!tableNameMatch) continue;

        const tableName = tableNameMatch[2].toLowerCase();
        const columns = new Set();
        const colTypes = new Map();
        const colLocs = new Map();
        const tableOffset = blockStart + tableNameMatch.index;
        const columnRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:[\w.]+\.)?(?:Column|mapped_column)\s*\(\s*((?:[^,()]+|\([^)]*\))*)/gm;
        let columnMatch;
        while ((columnMatch = columnRe.exec(block)) !== null) {
            const columnName = columnMatch[1].toLowerCase();
            columns.add(columnName);
            metadata.columns.add(columnName);
            const columnType = extractColumnType(columnMatch[2]);
            if (columnType) colTypes.set(columnName, columnType);
            colLocs.set(columnName, { offset: blockStart + columnMatch.index });
        }

        metadata.tables.add(tableName);
        metadata.tableColumns.set(tableName, columns);
        metadata.columnTypes.set(tableName, colTypes);
        metadata.tableLocations.set(tableName, { offset: tableOffset });
        metadata.columnLocations.set(tableName, colLocs);
    }

    return metadata;
}

module.exports = {
    createEmptySchemaMetadata,
    findClosestName,
    isWorkspaceRelativeGlobPattern,
    mergeSchemaMetadata,
    parseTableDefinitionFile,
};
