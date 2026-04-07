'use strict';

const {
    ALL_SQL_KEYWORDS,
    SQL_IDENTIFIER_PATH_RE_SRC,
    SQL_IDENTIFIER_TOKEN_RE_SRC,
    buildSemanticOpaqueMask,
    normalizeSqlIdentifier,
} = require('./shared');
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
    return normalizeSqlIdentifier(name);
}

function isIdentifierStart(ch) {
    return !!ch && /[A-Za-z_]/.test(ch);
}

function isIdentifierChar(ch) {
    return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function skipIgnorable(sql, index, opaque) {
    let i = index;
    while (i < sql.length) {
        if (/\s/.test(sql[i]) || opaque[i]) {
            i++;
            continue;
        }

        if (sql[i] === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? sql.length : end + 2;
            continue;
        }

        break;
    }
    return i;
}

function hasKeywordAt(sql, index, keyword, opaque) {
    if (index < 0 || index + keyword.length > sql.length) return false;
    if (rangeOverlapsOpaque(opaque, index, index + keyword.length)) return false;
    if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) return false;
    return !isIdentifierChar(sql[index - 1]) && !isIdentifierChar(sql[index + keyword.length]);
}

function readIdentifier(sql, index, opaque) {
    if (!isIdentifierStart(sql[index]) || opaque[index]) return null;
    let end = index + 1;
    while (end < sql.length && isIdentifierChar(sql[end]) && !opaque[end]) end++;
    return {
        value: sql.slice(index, end),
        start: index,
        end,
    };
}

function findBalancedParenEnd(sql, openIndex, opaque) {
    if (sql[openIndex] !== '(' || opaque[openIndex]) return -1;
    let depth = 1;

    for (let i = openIndex + 1; i < sql.length; i++) {
        if (opaque[i]) continue;
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

function findCTEDefinitions(sql, opaque = buildSemanticOpaqueMask(sql)) {
    const definitions = [];
    const withRe = /\bWITH\b/gi;
    let withMatch;

    while ((withMatch = withRe.exec(sql)) !== null) {
        if (rangeOverlapsOpaque(opaque, withMatch.index, withMatch.index + withMatch[0].length)) continue;

        let i = withMatch.index + withMatch[0].length;
        i = skipIgnorable(sql, i, opaque);
        if (hasKeywordAt(sql, i, 'RECURSIVE', opaque)) {
            i += 'RECURSIVE'.length;
        }

        let parsedAny = false;
        while (i < sql.length) {
            i = skipIgnorable(sql, i, opaque);

            const nameToken = readIdentifier(sql, i, opaque);
            if (!nameToken) break;
            if (ALL_SQL_KEYWORDS.has(nameToken.value.toUpperCase())) break;
            i = nameToken.end;

            let columnList = null;
            let columnListStart = -1;

            i = skipIgnorable(sql, i, opaque);
            if (sql[i] === '(' && !opaque[i]) {
                const columnListEnd = findBalancedParenEnd(sql, i, opaque);
                if (columnListEnd === -1) break;
                columnListStart = i + 1;
                columnList = sql.slice(columnListStart, columnListEnd);
                i = columnListEnd + 1;
            }

            i = skipIgnorable(sql, i, opaque);
            if (!hasKeywordAt(sql, i, 'AS', opaque)) break;
            i += 2;

            i = skipIgnorable(sql, i, opaque);
            if (sql[i] !== '(' || opaque[i]) break;

            const bodyOpen = i;
            const bodyClose = findBalancedParenEnd(sql, bodyOpen, opaque);
            if (bodyClose === -1) break;

            definitions.push({
                cteName: nameToken.value.toLowerCase(),
                nameStart: nameToken.start,
                nameEnd: nameToken.end,
                columnList,
                columnListStart,
                bodyStart: bodyOpen + 1,
                bodyEnd: bodyClose,
            });
            parsedAny = true;

            i = skipIgnorable(sql, bodyClose + 1, opaque);
            if (sql[i] === ',') {
                i++;
                continue;
            }
            break;
        }

        if (parsedAny) withRe.lastIndex = i;
    }

    return definitions;
}

function findCTENames(sql, opaque = buildSemanticOpaqueMask(sql)) {
    const cteNames = new Set();
    for (const definition of findCTEDefinitions(sql, opaque)) {
        cteNames.add(definition.cteName);
    }
    return cteNames;
}

function findTableReferences(sql, schemaMetadata, cteNames, opaque = buildSemanticOpaqueMask(sql)) {
    const tableReferences = [];
    const aliasMap = new Map();
    const tableRefRe = new RegExp(
        `\\b(FROM|JOIN|UPDATE|INTO|TABLE|DELETE\\s+FROM)\\s+(${SQL_IDENTIFIER_PATH_RE_SRC})(?:\\s+(?:AS\\s+)?([A-Za-z_][A-Za-z0-9_]*))?`,
        'gi'
    );
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

function hasDerivedTableReferences(sql, opaque = buildSemanticOpaqueMask(sql)) {
    const derivedTableRe = /\b(?:FROM|JOIN)\s*\(/gi;
    let match;

    while ((match = derivedTableRe.exec(sql)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (!rangeOverlapsOpaque(opaque, start, end)) return true;
    }

    return false;
}

function findQualifiedReferences(sql, tableReferences, opaque = buildSemanticOpaqueMask(sql)) {
    const qualifiedReferences = [];
    const occupied = new Set();
    const qualifiedRe = new RegExp(`(${SQL_IDENTIFIER_TOKEN_RE_SRC})\\.(${SQL_IDENTIFIER_TOKEN_RE_SRC})`, 'g');
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
    const opaque = buildSemanticOpaqueMask(sql);
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
        const qualifier = normalizeSqlIdentifier(reference.qualifier);
        const column = normalizeSqlIdentifier(reference.column);
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
    for (const definition of findCTEDefinitions(sql, opaque)) {
        const cteName = definition.cteName;
        const cols = new Map();

        // Case 1: explicit column list — cte_name(col1, col2) AS (
        if (definition.columnList) {
            let searchFrom = definition.columnListStart;
            for (const col of definition.columnList.split(',')) {
                const trimmed = col.trim();
                if (!trimmed || ALL_SQL_KEYWORDS.has(trimmed.toUpperCase())) continue;
                const colOffset = sql.indexOf(trimmed, searchFrom);
                if (colOffset !== -1 && colOffset < definition.bodyStart) {
                    cols.set(trimmed.toLowerCase(), colOffset);
                    searchFrom = colOffset + trimmed.length;
                }
            }
            cteSchema.set(cteName, cols);
            continue;
        }

        // Case 2: implicit — parse SELECT aliases from the CTE body
        const body = sql.slice(definition.bodyStart, definition.bodyEnd);
        const bodyOffset = definition.bodyStart;

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

        // Direct column references in SELECT clause: bare identifiers and table.col patterns
        const fromIdx = body.search(/\bFROM\b/i);
        const selectClause = fromIdx !== -1 ? body.slice(0, fromIdx) : body;
        // Bare identifiers: SELECT id, name — not followed by ( (function call)
        const bareColRe = /(?:(?:SELECT(?:\s+DISTINCT)?|,)\s+)([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|\s*$))/gi;
        let bm;
        while ((bm = bareColRe.exec(selectClause)) !== null) {
            const col = bm[1].toLowerCase();
            if (ALL_SQL_KEYWORDS.has(bm[1].toUpperCase())) continue;
            if (!cols.has(col)) cols.set(col, bodyOffset + bm.index + bm[0].length - bm[1].length);
        }
        // Qualified column references: SELECT t.id, t.name — extract the column part
        const qualColRe = /(?:(?:SELECT(?:\s+DISTINCT)?|,)\s+)[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|\s*$))/gi;
        let qm;
        while ((qm = qualColRe.exec(selectClause)) !== null) {
            const col = qm[1].toLowerCase();
            if (ALL_SQL_KEYWORDS.has(qm[1].toUpperCase())) continue;
            if (!cols.has(col)) cols.set(col, bodyOffset + qm.index + qm[0].length - qm[1].length);
        }

        cteSchema.set(cteName, cols);
    }

    return cteSchema;
}

function findSemanticEntityRanges(sql, schemaMetadata = createEmptySchemaMetadata()) {
    const opaque = buildSemanticOpaqueMask(sql);
    const tableRanges = [];
    const columnRanges = [];
    const aliasRanges = [];
    const seenTables = new Set();
    const seenColumns = new Set();
    const seenAliases = new Set();
    const occupied = new Set();
    const tableRefRe = new RegExp(
        `\\b(?:FROM|JOIN|UPDATE|INTO|TABLE|DELETE\\s+FROM)\\s+(${SQL_IDENTIFIER_PATH_RE_SRC})`,
        'gi'
    );
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
    const tableAliasRe = new RegExp(
        `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${SQL_IDENTIFIER_PATH_RE_SRC}\\s+(?:AS\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\b`,
        'gi'
    );
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
