'use strict';

const { ALL_SQL_KEYWORDS } = require('./shared');
const { buildOpaqueMask } = require('./shared');
const { createEmptySchemaMetadata, findClosestName } = require('../schema/metadata');

function rangeOverlapsOpaque(opaque, start, end) {
    for (let i = start; i < end; i++) {
        if (opaque[i]) return true;
    }
    return false;
}

function addUniqueRange(ranges, seen, start, end) {
    const key = `${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    ranges.push({ start, end });
}

function normalizeTableName(name) {
    const parts = name.split('.');
    return parts[parts.length - 1].toLowerCase();
}

function findCTENames(sql, opaque = buildOpaqueMask(sql)) {
    const cteNames = new Set();
    const cteRe = /\bWITH(?:\s+RECURSIVE)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*AS\s*\(|,\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*AS\s*\(/gi;
    let match;

    while ((match = cteRe.exec(sql)) !== null) {
        const cteName = match[1] || match[2];
        const start = match.index + match[0].indexOf(cteName);
        const end = start + cteName.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        cteNames.add(cteName.toLowerCase());
    }

    return cteNames;
}

function findTableReferences(sql, schemaMetadata, cteNames, opaque = buildOpaqueMask(sql)) {
    const tableReferences = [];
    const aliasMap = new Map();
    const tableRefRe = /\b(FROM|JOIN|UPDATE|INTO|TABLE|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
    let match;

    while ((match = tableRefRe.exec(sql)) !== null) {
        // Skip UPDATE that is part of ON DUPLICATE KEY UPDATE
        if (/^UPDATE$/i.test(match[1]) && /\bKEY\s*$/i.test(sql.slice(0, match.index))) continue;
        const tableName = match[2];
        const tableStart = match.index + match[0].indexOf(tableName);
        const tableEnd = tableStart + tableName.length;
        if (rangeOverlapsOpaque(opaque, tableStart, tableEnd)) continue;

        let alias = match[3] || null;
        let aliasStart = -1;
        let aliasEnd = -1;
        if (alias) {
            aliasStart = match.index + match[0].lastIndexOf(alias);
            aliasEnd = aliasStart + alias.length;
            if (rangeOverlapsOpaque(opaque, aliasStart, aliasEnd) || ALL_SQL_KEYWORDS.has(alias.toUpperCase())) {
                alias = null;
                aliasStart = -1;
                aliasEnd = -1;
            }
        }

        const normalizedName = normalizeTableName(tableName);
        const reference = {
            tableName,
            normalizedName,
            alias,
            tableStart,
            tableEnd,
            aliasStart,
            aliasEnd,
            keyword: match[1].toUpperCase().replace(/\s+/g, ' '),
            knownMetadata: schemaMetadata.tables.has(normalizedName),
            isCTE: cteNames.has(normalizedName),
        };

        tableReferences.push(reference);
        aliasMap.set(normalizedName, reference);
        if (alias) aliasMap.set(alias.toLowerCase(), reference);
    }

    // Derived table (subquery) aliases — `) AS alias` or `) alias`
    const derivedAliasRe = /\)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((match = derivedAliasRe.exec(sql)) !== null) {
        const alias = match[1];
        if (ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
        const start = match.index + match[0].length - alias.length;
        const end = start + alias.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        if (aliasMap.has(alias.toLowerCase())) continue; // already registered
        const reference = {
            tableName: alias,
            normalizedName: alias.toLowerCase(),
            alias,
            tableStart: start,
            tableEnd: end,
            aliasStart: start,
            aliasEnd: end,
            knownMetadata: false,
            isCTE: false,
            isDerived: true,
        };
        tableReferences.push(reference);
        aliasMap.set(alias.toLowerCase(), reference);
    }

    return { tableReferences, aliasMap };
}

function hasDerivedTableReferences(sql, opaque = buildOpaqueMask(sql)) {
    const derivedTableRe = /\b(?:FROM|JOIN)\s*\(/gi;
    let match;

    while ((match = derivedTableRe.exec(sql)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (!rangeOverlapsOpaque(opaque, start, end)) return true;
    }

    return false;
}

function findQualifiedReferences(sql, tableReferences, opaque = buildOpaqueMask(sql)) {
    const qualifiedReferences = [];
    const occupied = new Set();
    const qualifiedRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match;

    for (const reference of tableReferences) {
        for (let i = reference.tableStart; i < reference.tableEnd; i++) occupied.add(i);
    }

    while ((match = qualifiedRe.exec(sql)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (sql[start - 1] === '.' || sql[end] === '.') continue;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;

        let overlapsTableReference = false;
        for (let i = start; i < end; i++) {
            if (occupied.has(i)) {
                overlapsTableReference = true;
                break;
            }
        }
        if (overlapsTableReference) continue;

        qualifiedReferences.push({
            qualifier: match[1],
            column: match[2],
            start,
            end,
            qualifierStart: start,
            qualifierEnd: start + match[1].length,
            columnStart: start + match[1].length + 1,
            columnEnd: end,
        });
    }

    return qualifiedReferences;
}

function findSemanticWarnings(sql, schemaMetadata = createEmptySchemaMetadata()) {
    if (schemaMetadata.tables.size === 0) return [];

    const warnings = [];
    const seenUnknownQualifiers = new Set();
    const opaque = buildOpaqueMask(sql);
    const cteNames = findCTENames(sql, opaque);
    const { tableReferences, aliasMap } = findTableReferences(sql, schemaMetadata, cteNames, opaque);
    const qualifiedReferences = findQualifiedReferences(sql, tableReferences, opaque);
    const hasDerivedTables = hasDerivedTableReferences(sql, opaque);
    const tableCandidates = new Set([...schemaMetadata.tables, ...cteNames]);

    for (const reference of tableReferences) {
        if (reference.knownMetadata || reference.isCTE || reference.isDerived) continue;

        const suggestion = findClosestName(reference.normalizedName, tableCandidates);
        warnings.push({
            start: reference.tableStart,
            end: reference.tableEnd,
            message: suggestion
                ? `Unknown table "${reference.tableName}" — did you mean ${suggestion}?`
                : `Unknown table "${reference.tableName}".`,
        });
    }

    for (const reference of qualifiedReferences) {
        const qualifier = reference.qualifier.toLowerCase();
        const column = reference.column.toLowerCase();
        const resolvedReference = aliasMap.get(qualifier);

        if (resolvedReference) {
            if (!resolvedReference.knownMetadata) continue;

            const tableColumns = schemaMetadata.tableColumns.get(resolvedReference.normalizedName);
            if (!tableColumns || tableColumns.has(column)) continue;

            const suggestion = findClosestName(column, tableColumns);
            warnings.push({
                start: reference.columnStart,
                end: reference.columnEnd,
                message: suggestion
                    ? `Unknown column "${reference.column}" on ${resolvedReference.alias ? `alias "${resolvedReference.alias}"` : `table "${resolvedReference.tableName}"`} — did you mean ${suggestion}?`
                    : `Unknown column "${reference.column}" on ${resolvedReference.alias ? `alias "${resolvedReference.alias}"` : `table "${resolvedReference.tableName}"`}.`,
            });
            continue;
        }

        if (schemaMetadata.tables.has(qualifier)) {
            const tableColumns = schemaMetadata.tableColumns.get(qualifier);
            if (!tableColumns || tableColumns.has(column)) continue;

            const suggestion = findClosestName(column, tableColumns);
            warnings.push({
                start: reference.columnStart,
                end: reference.columnEnd,
                message: suggestion
                    ? `Unknown column "${reference.column}" on table "${reference.qualifier}" — did you mean ${suggestion}?`
                    : `Unknown column "${reference.column}" on table "${reference.qualifier}".`,
            });
            continue;
        }

        if (cteNames.has(qualifier) || hasDerivedTables) continue;

        if (seenUnknownQualifiers.has(qualifier)) continue;
        seenUnknownQualifiers.add(qualifier);

        const suggestion = findClosestName(qualifier, new Set([...aliasMap.keys(), ...schemaMetadata.tables, ...cteNames]));
        warnings.push({
            start: reference.qualifierStart,
            end: reference.qualifierEnd,
            message: suggestion
                ? `Unknown table or alias "${reference.qualifier}" — did you mean ${suggestion}?`
                : `Unknown table or alias "${reference.qualifier}".`,
        });
    }

    return warnings;
}

function extractCTEColumns(sql, opaque) {
    // Returns Map<cteName, Map<colName, offsetInSql>>
    const cteSchema = new Map();
    const cteRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*AS\s*\(/gi;
    let m;

    while ((m = cteRe.exec(sql)) !== null) {
        if (rangeOverlapsOpaque(opaque, m.index, m.index + m[0].length)) continue;
        const cteName = m[1].toLowerCase();
        if (ALL_SQL_KEYWORDS.has(m[1].toUpperCase())) continue;

        const cols = new Map();

        // Case 1: explicit column list — cte_name(col1, col2) AS (
        if (m[2]) {
            let searchFrom = m.index + m[0].indexOf('(') + 1;
            for (const col of m[2].split(',')) {
                const trimmed = col.trim();
                if (!trimmed || ALL_SQL_KEYWORDS.has(trimmed.toUpperCase())) continue;
                const colOffset = sql.indexOf(trimmed, searchFrom);
                if (colOffset !== -1) {
                    cols.set(trimmed.toLowerCase(), colOffset);
                    searchFrom = colOffset + trimmed.length;
                }
            }
            cteSchema.set(cteName, cols);
            continue;
        }

        // Case 2: implicit — parse SELECT aliases from the CTE body
        const bodyStart = m.index + m[0].length;
        let depth = 1, i = bodyStart;
        while (i < sql.length && depth > 0) {
            if (!opaque[i]) {
                if (sql[i] === '(') depth++;
                else if (sql[i] === ')') depth--;
            }
            if (depth > 0) i++;
        }
        const body = sql.slice(bodyStart, i);
        const bodyOffset = bodyStart;

        // Explicit AS aliases in body
        const asRe = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
        let am;
        while ((am = asRe.exec(body)) !== null) {
            const alias = am[1].toLowerCase();
            if (ALL_SQL_KEYWORDS.has(am[1].toUpperCase())) continue;
            if (!cols.has(alias)) cols.set(alias, bodyOffset + am.index + am[0].length - am[1].length);
        }

        // Implicit aliases: after ), ', ", number, .col — before comma or clause keyword or end of line
        const implicitRe = /(?:\)|['"]|\b\d+(?:\.\d+)?|(?:\.[A-Za-z_][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|\b(?:FROM|WHERE|HAVING|GROUP|ORDER|LIMIT)\b|$))/gm;
        let im2;
        while ((im2 = implicitRe.exec(body)) !== null) {
            const alias = im2[1].toLowerCase();
            if (ALL_SQL_KEYWORDS.has(im2[1].toUpperCase())) continue;
            if (!cols.has(alias)) cols.set(alias, bodyOffset + im2.index + im2[0].length - im2[1].length);
        }

        cteSchema.set(cteName, cols);
    }

    return cteSchema;
}

function findSemanticEntityRanges(sql, schemaMetadata = createEmptySchemaMetadata()) {
    const opaque = buildOpaqueMask(sql);
    const tableRanges = [];
    const columnRanges = [];
    const aliasRanges = [];
    const seenTables = new Set();
    const seenColumns = new Set();
    const seenAliases = new Set();
    const occupied = new Set();
    const tableRefRe = /\b(?:FROM|JOIN|UPDATE|INTO|TABLE|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/gi;
    let match;
    const isOnDuplicateKeyUpdate = (idx) => /\bKEY\s*$/i.test(sql.slice(0, idx));

    while ((match = tableRefRe.exec(sql)) !== null) {
        if (/^UPDATE\s/i.test(match[0]) && isOnDuplicateKeyUpdate(match.index)) continue;
        const start = match.index + match[0].length - match[1].length;
        const end = start + match[1].length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;

        addUniqueRange(tableRanges, seenTables, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    // CTE names — identifier AS ( is unique to CTE definitions.
    // Optional column list: cte_name(col1, col2) AS ( — handled by (?:\([^)]*\))?
    const cteRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*AS\s*\(/gi;
    while ((match = cteRe.exec(sql)) !== null) {
        const cteName = match[1];
        if (ALL_SQL_KEYWORDS.has(cteName.toUpperCase())) continue;
        const start = match.index;
        const end = start + cteName.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        let overlaps = false;
        for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
        if (overlaps) continue;
        addUniqueRange(tableRanges, seenTables, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    // Table aliases — FROM/JOIN table (AS)? alias — run first so AS-qualified
    // table aliases are occupied before the column alias pass.
    const colAliasRanges = [];
    const seenColAliases = new Set();
    const tableAliasRe = /\b(?:FROM|JOIN|UPDATE|INTO)\s+[A-Za-z_][A-Za-z0-9_.]*\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((match = tableAliasRe.exec(sql)) !== null) {
        const alias = match[1];
        if (ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
        const start = match.index + match[0].length - alias.length;
        const end = start + alias.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        let overlaps = false;
        for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
        if (overlaps) continue;
        addUniqueRange(aliasRanges, seenAliases, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    // Derived table (subquery) aliases — ) AS alias or ) alias
    const derivedAliasHighlightRe = /\)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((match = derivedAliasHighlightRe.exec(sql)) !== null) {
        const alias = match[1];
        if (ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
        const start = match.index + match[0].length - alias.length;
        const end = start + alias.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        let overlaps = false;
        for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
        if (overlaps) continue;
        addUniqueRange(aliasRanges, seenAliases, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    // Column aliases — remaining AS aliases (table aliases already occupied above)
    const asAliasRe = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((match = asAliasRe.exec(sql)) !== null) {
        const alias = match[1];
        if (ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
        const start = match.index + match[0].length - alias.length;
        const end = start + alias.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        let overlaps = false;
        for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
        if (overlaps) continue;
        addUniqueRange(colAliasRanges, seenColAliases, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    // Implicit column aliases (AS is optional) — triggers:
    //   1. after closing paren:      COUNT(*) total,   (SELECT ...) sub,
    //   2. after qualified column:   u.name full_name,
    //   3. after string literal:     'active' status,
    //   4. after number literal:     1 row_num,   42 id,
    const implicitColAliasRe = /(?:\)|['"]|\b\d+(?:\.\d+)?|(?:\.[A-Za-z_][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|\b(?:FROM|WHERE|HAVING|GROUP|ORDER|LIMIT|UNION|INTERSECT|EXCEPT)\b|$))/gm;
    while ((match = implicitColAliasRe.exec(sql)) !== null) {
        const alias = match[1];
        if (ALL_SQL_KEYWORDS.has(alias.toUpperCase())) continue;
        const start = match.index + match[0].length - alias.length;
        const end = start + alias.length;
        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        let overlaps = false;
        for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
        if (overlaps) continue;
        addUniqueRange(colAliasRanges, seenColAliases, start, end);
        for (let i = start; i < end; i++) occupied.add(i);
    }

    const identRe = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    while ((match = identRe.exec(sql)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const name = match[0];
        const normalized = name.toLowerCase();

        if (rangeOverlapsOpaque(opaque, start, end)) continue;
        if (ALL_SQL_KEYWORDS.has(name.toUpperCase())) continue;

        let overlapsExisting = false;
        for (let i = start; i < end; i++) {
            if (occupied.has(i)) {
                overlapsExisting = true;
                break;
            }
        }
        if (overlapsExisting) continue;

        if (schemaMetadata.tables.has(normalized)) {
            addUniqueRange(tableRanges, seenTables, start, end);
            for (let i = start; i < end; i++) occupied.add(i);
            continue;
        }

        if (schemaMetadata.columns.has(normalized)) {
            addUniqueRange(columnRanges, seenColumns, start, end);
            for (let i = start; i < end; i++) occupied.add(i);
        }
    }

    // Table alias usages — tag every `alias.something` qualifier with table alias color
    const tableAliasNames = new Set(
        aliasRanges.map(r => sql.slice(r.start, r.end).toLowerCase())
    );
    if (tableAliasNames.size > 0) {
        const aliasUsageRe = /\b([A-Za-z_][A-Za-z0-9_]*)(?=\.)/g;
        while ((match = aliasUsageRe.exec(sql)) !== null) {
            if (!tableAliasNames.has(match[1].toLowerCase())) continue;
            const start = match.index;
            const end = start + match[1].length;
            if (rangeOverlapsOpaque(opaque, start, end)) continue;
            let overlaps = false;
            for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
            if (overlaps) continue;
            addUniqueRange(aliasRanges, seenAliases, start, end);
            for (let i = start; i < end; i++) occupied.add(i);
        }
    }

    // col_alias usages — tag references to column aliases in ORDER BY / GROUP BY / HAVING / QUALIFY
    const colAliasNames = new Set(
        colAliasRanges.map(r => sql.slice(r.start, r.end).toLowerCase())
    );
    if (colAliasNames.size > 0) {
        const clauseColAliasRe = /\b(?:ORDER\s+BY|GROUP\s+BY|HAVING|QUALIFY)\b([\s\S]*?)(?=\b(?:ORDER\s+BY|GROUP\s+BY|HAVING|QUALIFY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|$))/gi;
        let clauseMatch;
        while ((clauseMatch = clauseColAliasRe.exec(sql)) !== null) {
            const clauseBody = clauseMatch[1];
            const clauseOffset = clauseMatch.index + clauseMatch[0].length - clauseBody.length;
            const identRe2 = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let im;
            while ((im = identRe2.exec(clauseBody)) !== null) {
                if (!colAliasNames.has(im[1].toLowerCase())) continue;
                const start = clauseOffset + im.index;
                const end = start + im[1].length;
                if (rangeOverlapsOpaque(opaque, start, end)) continue;
                let overlaps = false;
                for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
                if (overlaps) continue;
                addUniqueRange(colAliasRanges, seenColAliases, start, end);
                for (let i = start; i < end; i++) occupied.add(i);
            }
        }
    }

    // CTE column coloring — qualifier.col where qualifier → CTE with known columns
    const cteSchema = extractCTEColumns(sql, opaque);
    const cteAliasMap = new Map(); // alias/cteName -> cteName
    for (const [cteName] of cteSchema) {
        cteAliasMap.set(cteName, cteName);
    }
    // Also map table aliases that point to CTEs
    for (const [key, ref] of aliasRanges.reduce((m, r) => m, new Map())) { /* no-op */ }
    // Build from aliasMap (re-derive from sql)
    const cteNamesSet = new Set(cteSchema.keys());
    const cteTblAliasRe = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((match = cteTblAliasRe.exec(sql)) !== null) {
        const tbl = match[1].toLowerCase();
        const alias = match[2].toLowerCase();
        if (cteNamesSet.has(tbl) && !ALL_SQL_KEYWORDS.has(match[2].toUpperCase())) {
            cteAliasMap.set(alias, tbl);
        }
    }
    if (cteAliasMap.size > 0) {
        const qualColRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
        while ((match = qualColRe.exec(sql)) !== null) {
            const qualifier = match[1].toLowerCase();
            const col = match[2].toLowerCase();
            const cteName = cteAliasMap.get(qualifier);
            if (!cteName) continue;
            const cols = cteSchema.get(cteName);
            if (!cols?.has(col)) continue;
            const start = match.index + match[1].length + 1; // offset of col after the dot
            const end = start + match[2].length;
            if (rangeOverlapsOpaque(opaque, start, end)) continue;
            let overlaps = false;
            for (let i = start; i < end; i++) { if (occupied.has(i)) { overlaps = true; break; } }
            if (overlaps) continue;
            addUniqueRange(columnRanges, seenColumns, start, end);
            for (let i = start; i < end; i++) occupied.add(i);
        }
    }

    return { tableRanges, columnRanges, aliasRanges, colAliasRanges, cteSchema };
}

module.exports = {
    findCTENames,
    findQualifiedReferences,
    findSemanticEntityRanges,
    findSemanticWarnings,
    findTableReferences,
    rangeOverlapsOpaque,
};
