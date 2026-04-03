'use strict';
const vscode = require('vscode');

const THEMES = {
    dracula: {
        identifier: { color: '#A0ACBE' },     // brighter blue-gray — readable, not blackish
        table: { color: '#F4C56E' },           // warm gold
        column: { color: '#82B1FF' },          // periwinkle blue
        alias: { color: '#5DE3C0' },           // bright mint — table alias
        col_alias: { color: '#D4AAFF' },       // soft lavender — column/output alias
        keyword: { color: '#6BB8C8', fontWeight: 'bold' },
        function: { color: '#FF79C6' },
        param: { color: '#FFB86C' },
        jinja: { color: '#BD93F9' },
        comment: { color: '#6272A4', fontStyle: 'italic' },
        number: { color: '#F1FA8C' },
        string: { color: '#50FA7B' },
        json_path: { color: '#E5C07B' },
        operator: { color: '#8BE9FD' },
        boolean: { color: '#FF8585', fontWeight: 'bold' },
    },
    monokai: {
        identifier: { color: '#B0B8C8' },      // brighter neutral
        table: { color: '#E07850' },            // terracotta
        column: { color: '#7EC8E3' },           // sky blue
        alias: { color: '#5BCFB5' },            // teal mint — table alias
        col_alias: { color: '#C9A0DC' },        // mauve — column/output alias
        keyword: { color: '#F92672', fontWeight: 'bold' },
        function: { color: '#A6E22E' },
        param: { color: '#FD971F' },
        jinja: { color: '#AE81FF' },
        comment: { color: '#75715E', fontStyle: 'italic' },
        number: { color: '#AE81FF' },
        string: { color: '#E6DB74' },
        json_path: { color: '#FD971F' },
        operator: { color: '#F92672' },
        boolean: { color: '#66D9E8', fontWeight: 'bold' },
    },
    'one-dark': {
        identifier: { color: '#9DA5B4' },       // brighter neutral
        table: { color: '#4EC9B0' },            // VS Code teal
        column: { color: '#7ECAE9' },           // light cornflower
        alias: { color: '#56D6AE' },            // softer mint teal — table alias
        col_alias: { color: '#C0A0E8' },        // lavender — column/output alias
        keyword: { color: '#C678DD', fontWeight: 'bold' },
        function: { color: '#61AFEF' },
        param: { color: '#D19A66' },
        jinja: { color: '#56B6C2' },
        comment: { color: '#5C6370', fontStyle: 'italic' },
        number: { color: '#D19A66' },
        string: { color: '#98C379' },
        json_path: { color: '#E5C07B' },
        operator: { color: '#56B6C2' },
        boolean: { color: '#E06C75', fontWeight: 'bold' },
    },
};

const ALL_SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'IS', 'NULL',
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL', 'ON', 'USING', 'WITH',
    'AS', 'DISTINCT', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT',
    'EXCEPT', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER',
    'DROP', 'TABLE', 'VIEW', 'INDEX', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'RETURNING', 'TRUE', 'FALSE',
    'PARTITION', 'OVER', 'WINDOW', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
    'INTERVAL', 'MICROSECOND', 'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR',
    'SECOND_MICROSECOND', 'MINUTE_MICROSECOND', 'MINUTE_SECOND', 'HOUR_MICROSECOND', 'HOUR_SECOND',
    'HOUR_MINUTE', 'DAY_MICROSECOND', 'DAY_SECOND', 'DAY_MINUTE', 'DAY_HOUR', 'YEAR_MONTH',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'IFNULL', 'IF', 'ROW', 'CONCAT', 'CONCAT_WS',
    'SUBSTRING', 'SUBSTR', 'LENGTH', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER', 'REPLACE', 'INSTR',
    'DATE', 'DATE_FORMAT', 'TIME_FORMAT', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'NOW', 'CURDATE', 'CAST', 'CONVERT',
    'GROUP_CONCAT', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE',
    'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'ABS', 'MOD', 'POWER', 'GREATEST', 'LEAST', 'TIMESTAMPDIFF', 'EXTRACT',
    'JSON', 'JSON_EXTRACT', 'JSON_UNQUOTE',
    // General SQL keywords
    'DUPLICATE', 'KEY',
    'LATERAL', 'RECURSIVE', 'MATCH', 'AGAINST', 'REGEXP', 'RLIKE',
    'EXPLAIN', 'ANALYZE', 'TRUNCATE', 'REPLACE',
    'ROLLUP', 'CUBE', 'GROUPING', 'SEPARATOR',
    'MERGE', 'MATCHED',
    'ESCAPE', 'COLLATE', 'BINARY', 'STRAIGHT_JOIN', 'WITHIN',
    // General SQL functions
    'JSON_ARRAYAGG', 'JSON_OBJECTAGG',
    'POSITION', 'LOCATE', 'FIND_IN_SET', 'FIELD',
    'UUID', 'DATABASE', 'SCHEMA',
    // BigQuery / Spanner clauses and type keywords
    'QUALIFY', 'TABLESAMPLE', 'PIVOT', 'UNPIVOT',
    'STRUCT', 'ARRAY', 'UNNEST',
    'TIMESTAMP', 'DATETIME', 'TIME',
    'FOLLOWING', 'PRECEDING', 'UNBOUNDED',
    'ROWS', 'RANGE',
    'IGNORE', 'RESPECT',
    // BigQuery / Spanner functions
    'STRING_AGG', 'ARRAY_AGG', 'ARRAY_LENGTH', 'ARRAY_TO_STRING', 'ARRAY_CONCAT', 'ARRAY_REVERSE', 'GENERATE_ARRAY',
    'ANY_VALUE', 'COUNTIF', 'LOGICAL_AND', 'LOGICAL_OR', 'APPROX_COUNT_DISTINCT',
    'PERCENTILE_CONT', 'PERCENTILE_DISC', 'PERCENT_RANK', 'CUME_DIST', 'NTILE', 'NTH_VALUE',
    'REGEXP_REPLACE', 'REGEXP_EXTRACT', 'REGEXP_CONTAINS',
    'DATE_TRUNC', 'TIMESTAMP_TRUNC', 'DATETIME_TRUNC',
    'DATETIME_ADD', 'DATETIME_SUB', 'DATETIME_DIFF',
    'TIMESTAMP_ADD', 'TIMESTAMP_SUB', 'TIMESTAMP_DIFF',
    'DATE_DIFF', 'PARSE_DATE', 'PARSE_TIMESTAMP', 'PARSE_DATETIME',
    'FORMAT_DATE', 'FORMAT_TIMESTAMP', 'FORMAT_DATETIME',
    'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_DATETIME',
    'SAFE_DIVIDE', 'SAFE_CAST',
    'GENERATE_UUID',
    'SPLIT', 'STARTS_WITH', 'ENDS_WITH', 'STRPOS', 'LPAD', 'RPAD', 'REPEAT', 'REVERSE',
    'CHAR_LENGTH', 'BYTE_LENGTH', 'FORMAT', 'TO_BASE64', 'FROM_BASE64', 'TO_HEX', 'FROM_HEX',
    'SHA256', 'MD5', 'FARM_FINGERPRINT',
    'JSON_VALUE', 'JSON_QUERY', 'JSON_EXTRACT_SCALAR', 'JSON_EXTRACT_ARRAY', 'JSON_OBJECT', 'JSON_ARRAY',
    'BIT_AND', 'BIT_OR', 'BIT_XOR', 'BIT_COUNT',
    'RANGE_BUCKET',
]);

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function findClosestKeyword(word) {
    let best = null, bestDist = Infinity;
    for (const kw of ALL_SQL_KEYWORDS) {
        if (Math.abs(kw.length - word.length) > 2) continue;
        const d = levenshtein(word, kw);
        if (d < bestDist) { bestDist = d; best = kw; }
    }
    return bestDist <= 2 ? best : null;
}

// ── CASE formatter helpers ──────────────────────────────────────────────────

function matchKeyword(s, i, kw) {
    if (i > 0 && /\w/.test(s[i - 1])) return false;
    if (s.slice(i, i + kw.length).toUpperCase() !== kw) return false;
    const after = s[i + kw.length];
    return !after || !/\w/.test(after);
}

function extractCaseContent(sql, start) {
    let depth = 1, i = start;
    while (i < sql.length && depth > 0) {
        if (matchKeyword(sql, i, 'CASE')) { depth++; i += 4; }
        else if (matchKeyword(sql, i, 'END')) { depth--; if (depth === 0) return { content: sql.slice(start, i), afterEnd: i + 3 }; i += 3; }
        else i++;
    }
    return { content: sql.slice(start), afterEnd: sql.length };
}

function splitCaseContent(content) {
    const parts = [];
    let i = 0, start = 0, parenDepth = 0, caseDepth = 0, currentType = null;
    while (i <= content.length) {
        const ch = content[i];
        if (ch === '(') { parenDepth++; i++; continue; }
        else if (ch === ')') { parenDepth--; i++; continue; }
        if (parenDepth === 0) {
            if (matchKeyword(content, i, 'CASE')) { caseDepth++; i += 4; continue; }
            if (caseDepth > 0 && matchKeyword(content, i, 'END')) { caseDepth--; i += 3; continue; }
            if (caseDepth === 0) {
                const kw = matchKeyword(content, i, 'WHEN') ? 'WHEN' : matchKeyword(content, i, 'ELSE') ? 'ELSE' : null;
                if (kw || i === content.length) {
                    if (currentType !== null) parts.push({ type: currentType, text: content.slice(start, i).trim() });
                    if (kw) { currentType = kw; i += kw.length; start = i; continue; }
                }
            }
        }
        i++;
    }
    return parts;
}

function expandCaseBlocks(sql, baseIndent) {
    let result = '', i = 0;
    while (i < sql.length) {
        if (matchKeyword(sql, i, 'CASE')) {
            const { content, afterEnd } = extractCaseContent(sql, i + 4);
            if (/\(\s*(SELECT|WITH)\b/i.test(content)) {
                result += 'CASE' + content + 'END';
                i = afterEnd;
                continue;
            }
            const innerIndent = baseIndent + '    ';
            const parts = splitCaseContent(content);
            const formatted = parts.map(p => innerIndent + p.type + ' ' + expandCaseBlocks(p.text, innerIndent)).join('\n');
            result += 'CASE\n' + formatted + '\n' + baseIndent + 'END';
            i = afterEnd;
        } else {
            result += sql[i++];
        }
    }
    return result;
}

function formatInlineCaseExpressions(sql) {
    return sql.split('\n').flatMap(line => {
        const lineIndent = line.match(/^([ \t]*)/)[1];
        const body = line.slice(lineIndent.length);
        if (!/\bCASE\b[\s\S]*\bEND\b/i.test(body)) return [line];
        if (/\(\s*(SELECT|WITH)\b/i.test(body)) return [line];

        const expanded = expandCaseBlocks(body, lineIndent);
        const parts = expanded.split('\n');
        parts[0] = lineIndent + parts[0];
        return parts;
    }).join('\n');
}

function formatCTEBlocks(sql) {
    let result = '', i = 0;
    while (i < sql.length) {
        if (matchKeyword(sql, i, 'AS')) {
            let j = i + 2;
            while (j < sql.length && sql[j] === ' ') j++;
            if (sql[j] === '(') {
                // Determine indentation of the line containing this AS
                const lineStart = sql.lastIndexOf('\n', i) + 1;
                const lineIndent = sql.slice(lineStart, i).match(/^([ \t]*)/)[1];
                const bodyIndent = lineIndent + '    ';

                result += 'AS (\n';
                j++; // skip '('

                // Extract content until matching ')'
                let depth = 1, bodyStart = j;
                while (j < sql.length && depth > 0) {
                    if (sql[j] === '(') depth++;
                    else if (sql[j] === ')') depth--;
                    if (depth > 0) j++;
                    else break;
                }

                // Re-indent each body line (preserving relative indentation)
                const bodyLines = sql.slice(bodyStart, j)
                    .split('\n')
                    .map(l => l.trimEnd())
                    .filter(l => l.trim())
                    .map(l => bodyIndent + l);

                result += bodyLines.join('\n') + '\n' + lineIndent + ')';
                i = j + 1; // skip ')'

                // If a comma follows (another CTE), put it then newline
                if (i < sql.length && sql[i] === ',') {
                    result += ',\n';
                    i++;
                    while (i < sql.length && sql[i] === ' ') i++;
                }
                continue;
            }
        }
        result += sql[i++];
    }
    return result;
}

function splitTopLevelAndOr(content) {
    const parts = [];
    let i = 0, start = 0, parenDepth = 0, caseDepth = 0, currentOp = null;
    while (i <= content.length) {
        if (i < content.length) {
            if (content[i] === '(') { parenDepth++; i++; continue; }
            if (content[i] === ')') { parenDepth--; i++; continue; }
        }
        if (parenDepth === 0) {
            if (matchKeyword(content, i, 'CASE')) { caseDepth++; i += 4; continue; }
            if (caseDepth > 0 && matchKeyword(content, i, 'END')) { caseDepth--; i += 3; continue; }
            if (caseDepth === 0) {
                const kw = matchKeyword(content, i, 'AND') ? 'AND' : matchKeyword(content, i, 'OR') ? 'OR' : null;
                if (kw || i === content.length) {
                    const expr = content.slice(start, i).trim();
                    if (expr) parts.push({ op: currentOp, expr });
                    if (kw) { currentOp = kw; i += kw.length; start = i; continue; }
                    else break;
                }
            }
        }
        i++;
    }
    return parts;
}

function expandBracketedConditions(sql) {
    return sql.replace(
        /^([ \t]*)(AND|OR)\s+\((.+)\)\s*$/gm,
        (match, indent, op, inner) => {
            const parts = splitTopLevelAndOr(inner);
            if (parts.length < 3) return match;
            const innerIndent = indent + '    ';
            const lines = parts.map(p => innerIndent + (p.op ? p.op + ' ' : '') + p.expr);
            return `${indent}${op} (\n${lines.join('\n')}\n${indent})`;
        }
    );
}

// ────────────────────────────────────────────────────────────────────────────

function detectUnionCommentAdjacency(sql) {
    // Scan the original SQL (before any processing) to find which UNION/INTERSECT/EXCEPT
    // occurrences have a standalone comment line immediately before or after them.
    const UNION_RE = /^(UNION(?: ALL)?|INTERSECT|EXCEPT)\b/i;
    const COMMENT_RE = /^--/;
    const lines = sql.split('\n').map(l => l.trim()).filter(l => l);
    const pre = [], post = [];
    for (let i = 0; i < lines.length; i++) {
        if (UNION_RE.test(lines[i])) {
            pre.push(i > 0 && COMMENT_RE.test(lines[i - 1]));
            post.push(i < lines.length - 1 && COMMENT_RE.test(lines[i + 1]));
        }
    }
    return { pre, post };
}

function splitTopLevelCommas(str) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') depth--;
        else if (str[i] === ',' && depth === 0) {
            parts.push(str.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(str.slice(start).trim());
    return parts.filter(p => p);
}

function splitTrailingInlineComment(line) {
    const match = line.match(/^(.*?)(\s+--.*)$/);
    if (!match) return null;
    const code = match[1].trimEnd();
    const comment = match[2].trimStart();
    if (!code) return null;
    return { code, comment };
}

function splitUnionLineForFollowingComment(line) {
    const match = line.match(/^(.*?\s--.*?)(\s--.*)$/);
    if (match) {
        return {
            code: match[1].trimEnd(),
            comment: match[2].trimStart(),
        };
    }
    return null;
}

function normalizeStringQuotes(str) {
    if (!str || (str[0] !== '\'' && str[0] !== '"')) return str;

    const quote = str[0];
    const inner = str.slice(1, -1);

    if (quote === '\'') {
        return `"${inner.replace(/"/g, '""')}"`;
    }

    return str;
}

function isStandaloneOpaqueToken(text) {
    return /^\{%-?[\s\S]*?-?%\}$/.test(text) || /^--[^\n]*$/.test(text);
}

function isJinjaControlTag(text) {
    return /^\{%-?[\s\S]*?-?%\}$/.test(text);
}

function isStandaloneAt(sql, start, end) {
    const lineStart = sql.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = sql.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? sql.length : lineEndIdx;
    const before = sql.slice(lineStart, start).trim();
    const after = sql.slice(end, lineEnd).trim();
    return !before && !after;
}

function restoreOpaqueRegions(sql, saved) {
    return sql.replace(/\x00(\d+)\x00/g, (_, i) => {
        const item = saved[+i];
        return item.standalone ? `\x01${i}\x01` : item.text;
    });
}

function placeStandaloneOpaqueLines(sql, saved) {
    const markerRe = /\x01(\d+)\x01/;
    const out = [];

    for (const rawLine of sql.split('\n')) {
        const queue = [rawLine];

        while (queue.length > 0) {
            const line = queue.shift();
            const match = markerRe.exec(line);

            if (!match) {
                if (line.trim()) out.push(line.trimEnd());
                continue;
            }

            const leadingIndent = line.match(/^([ \t]*)/)[1];
            const before = line.slice(0, match.index).trimEnd();
            const after = line.slice(match.index + match[0].length).trim();
            const standaloneText = saved[+match[1]].text.trim();

            if (before.trim()) out.push(before);
            out.push(isJinjaControlTag(standaloneText) ? standaloneText : (before.trim() ? '' : leadingIndent) + standaloneText);
            if (after) queue.unshift(leadingIndent + after);
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function placeJinjaControlTagsOnOwnLines(sql) {
    const controlRe = /\{%-?[\s\S]*?-?%\}/;
    const out = [];

    for (const rawLine of sql.split('\n')) {
        const queue = [rawLine];

        while (queue.length > 0) {
            const line = queue.shift();
            const match = controlRe.exec(line);

            if (!match) {
                if (line.trim()) out.push(line.trimEnd());
                continue;
            }

            const leadingIndent = line.match(/^([ \t]*)/)[1];
            const before = line.slice(0, match.index).trimEnd();
            const after = line.slice(match.index + match[0].length).trim();

            if (before.trim()) out.push(before);
            out.push(match[0].trim());
            if (after) queue.unshift(leadingIndent + after);
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getJinjaIndent(lines, index) {
    const current = lines[index].trim();
    const isClosing = /^\{%-?\s*(endif|endfor|endblock|endmacro|else|elif)\b/i.test(current);

    const prevSqlIndent = (() => {
        for (let i = index - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            if (!trimmed || isJinjaControlTag(trimmed)) continue;
            return lines[i].match(/^([ \t]*)/)[1];
        }
        return '';
    })();

    const nextSqlIndent = (() => {
        for (let i = index + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || isJinjaControlTag(trimmed)) continue;
            return lines[i].match(/^([ \t]*)/)[1];
        }
        return '';
    })();

    return isClosing ? (prevSqlIndent || nextSqlIndent) : (nextSqlIndent || prevSqlIndent);
}

function normalizeJinjaControlIndentation(sql) {
    const lines = sql.split('\n').map(line => line.trimEnd());
    return lines.map((line, index) => {
        const trimmed = line.trim();
        if (!isJinjaControlTag(trimmed)) return line;
        return getJinjaIndent(lines, index) + trimmed;
    }).join('\n');
}

function dedentLines(lines) {
    const indents = lines
        .filter(line => line.trim())
        .map(line => (line.match(/^([ \t]*)/) || ['', ''])[1].length);
    const minIndent = indents.length ? Math.min(...indents) : 0;
    return lines.map(line => line.trim() ? line.slice(minIndent) : '');
}

function findParenthesizedSubqueries(sql) {
    const ranges = [];
    const opaque = buildOpaqueMask(sql);

    for (let i = 0; i < sql.length; i++) {
        if (opaque[i] || sql[i] !== '(') continue;
        if (!/^\s*(SELECT|WITH)\b/i.test(sql.slice(i + 1))) continue;

        let depth = 1;
        for (let j = i + 1; j < sql.length; j++) {
            if (opaque[j]) continue;
            if (sql[j] === '(') depth++;
            else if (sql[j] === ')') depth--;
            if (depth === 0) {
                ranges.push({ start: i, end: j });
                i = j;
                break;
            }
        }
    }

    return ranges;
}

function formatParenthesizedSubqueries(sql) {
    let result = sql;
    const ranges = findParenthesizedSubqueries(sql);

    for (let i = ranges.length - 1; i >= 0; i--) {
        const { start, end } = ranges[i];
        const lineStart = result.lastIndexOf('\n', start) + 1;
        const baseIndent = (result.slice(lineStart, start).match(/^([ \t]*)/) || ['', ''])[1];
        const innerIndent = baseIndent + '    ';
        const inner = result.slice(start + 1, end).trim();
        const dedented = dedentLines(inner.split('\n').map(line => line.trimEnd()));
        const replacement = '(\n' + dedented.map(line => line ? innerIndent + line : '').join('\n') + '\n' + baseIndent + ')';
        result = result.slice(0, start) + replacement + result.slice(end + 1);
    }

    return result;
}

function formatSetAssignments(sql) {
    // Expand SET col=val, col2=val2 → one assignment per line (3+ items)
    // Also handles ON DUPLICATE KEY UPDATE the same way
    return sql.replace(
        /^([ \t]*)(SET|ON DUPLICATE KEY UPDATE)\s+(.+)$/gim,
        (match, indent, keyword, rest) => {
            const assignments = splitTopLevelCommas(rest);
            if (assignments.length <= 2) return match;
            return indent + keyword + '\n' +
                assignments.map((a, i) => indent + '    ' + a.trim() + (i < assignments.length - 1 ? ',' : '')).join('\n');
        }
    );
}

function formatInsertValues(sql) {
    return sql.replace(
        /^(VALUES)\s*(.+)$/gim,
        (match, keyword, rest) => {
            const rows = splitTopLevelCommas(rest);
            if (rows.length <= 1) return match;
            return keyword + '\n' + rows.map((r, i) => '    ' + r.trim() + (i < rows.length - 1 ? ',' : '')).join('\n');
        }
    );
}

function splitWhereHavingConditions(sql) {
    return sql.split('\n').flatMap(line => {
        const lineIndent = line.match(/^([ \t]*)/)[1];
        const body = line.slice(lineIndent.length);
        const clauseMatch = /^(WHERE|HAVING)\b\s*(.*)$/i.exec(body);
        if (!clauseMatch) return [line];

        const keyword = clauseMatch[1].toUpperCase();
        const clauseBody = clauseMatch[2];
        let r = '', i = 0, parenDepth = 0, caseDepth = 0;

        while (i < clauseBody.length) {
            if (clauseBody[i] === '(') { parenDepth++; r += clauseBody[i++]; continue; }
            if (clauseBody[i] === ')') { parenDepth--; r += clauseBody[i++]; continue; }
            if (matchKeyword(clauseBody, i, 'CASE')) { caseDepth++; r += 'CASE'; i += 4; continue; }
            if (caseDepth > 0 && matchKeyword(clauseBody, i, 'END')) { caseDepth--; r += 'END'; i += 3; continue; }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(clauseBody, i, 'AND')) { r += '\n' + lineIndent + '    AND'; i += 3; continue; }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(clauseBody, i, 'OR')) { r += '\n' + lineIndent + '    OR'; i += 2; continue; }
            r += clauseBody[i++];
        }

        const parts = r.split('\n');
        parts[0] = lineIndent + keyword + (parts[0].trim() ? ' ' + parts[0].trim() : '');
        return parts.map(part => part.trimEnd());
    }).join('\n');
}

function formatSQL(sql) {
    // Scan original SQL for UNION-comment adjacency before any processing destroys line structure
    const unionAdj = detectUnionCommentAdjacency(sql);

    // Protect opaque regions from modification
    const saved = [];
    const OPAQUE_RE = /\{#[\s\S]*?#\}|\{%-?[\s\S]*?-?%\}|\{\{[\s\S]*?\}\}|--[^\n]*|'[^']*'|"[^"]*"|:[a-zA-Z_][a-zA-Z0-9_]*/g;
    let s = sql.replace(OPAQUE_RE, (m, offset, whole) => {
        saved.push({
            text: normalizeStringQuotes(m),
            standalone: isStandaloneOpaqueToken(m) && isStandaloneAt(whole, offset, offset + m.length),
        });
        return `\x00${saved.length - 1}\x00`;
    });

    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();

    // Uppercase keywords
    s = s.replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|TRUE|FALSE|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH|POWER|ROW|JSON|QUALIFY|TABLESAMPLE|PIVOT|UNPIVOT|STRUCT|ARRAY|UNNEST|TIMESTAMP|DATETIME|TIME|FOLLOWING|PRECEDING|UNBOUNDED|ROWS|RANGE|IGNORE|RESPECT|LATERAL|RECURSIVE|MATCH|AGAINST|REGEXP|RLIKE|EXPLAIN|ANALYZE|TRUNCATE|REPLACE|ROLLUP|CUBE|GROUPING|SEPARATOR|MERGE|MATCHED|ESCAPE|COLLATE|BINARY|STRAIGHT_JOIN|WITHIN|DUPLICATE|KEY)\b/gi, m => m.toUpperCase());

    // Break before top-level clauses — longer phrases first to avoid partial matches
    s = s.replace(
        /\b(UNION ALL|GROUP BY|ORDER BY|INSERT INTO|REPLACE INTO|DELETE FROM|ON DUPLICATE KEY UPDATE|WHEN MATCHED|WHEN NOT MATCHED|SELECT|FROM|WHERE|HAVING|QUALIFY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|RETURNING|VALUES|SET|WITH|MERGE|EXPLAIN|ANALYZE|TRUNCATE)\b/g,
        '\n$1'
    );

    // Break before JOINs
    s = s.replace(/\b((?:LEFT|RIGHT|INNER|CROSS|FULL|NATURAL)(?: OUTER)? )?JOIN\b/g, m => '\n' + m.trimStart());

    // Indent AND / OR — skip content inside parentheses AND inside CASE...END blocks
    {
        let r = '', i = 0, parenDepth = 0, caseDepth = 0;
        while (i < s.length) {
            if (s[i] === '(') { parenDepth++; r += s[i++]; continue; }
            if (s[i] === ')') { parenDepth--; r += s[i++]; continue; }
            if (matchKeyword(s, i, 'CASE')) { caseDepth++; r += 'CASE'; i += 4; continue; }
            if (caseDepth > 0 && matchKeyword(s, i, 'END')) { caseDepth--; r += 'END'; i += 3; continue; }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(s, i, 'AND')) { r += '\n    AND'; i += 3; continue; }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(s, i, 'OR')) { r += '\n    OR'; i += 2; continue; }
            r += s[i++];
        }
        s = r;
    }

    // Trim trailing whitespace only (preserve leading indent on AND/OR lines), drop blank lines
    // then expand SELECT columns
    const lines = s.split('\n').map(l => l.trimEnd()).filter(l => l.trim()).flatMap(line => {
        if (!line.startsWith('SELECT ')) return [line];
        let rest = line.slice('SELECT '.length);
        let keyword = 'SELECT';
        if (rest.startsWith('DISTINCT ')) { keyword = 'SELECT DISTINCT'; rest = rest.slice('DISTINCT '.length); }
        const cols = splitTopLevelCommas(rest);
        if (cols.length <= 1) return [`${keyword} ${cols.join(', ')}`];
        return [keyword, ...cols.map((c, i) => '    ' + c + (i < cols.length - 1 ? ',' : ''))];
    });

    // Expand bracketed conditions with 3+ sub-conditions (AND/OR inside parens are still single-line)
    s = expandBracketedConditions(lines.join('\n'));

    // Expand inline CASE expressions, but leave multiline/subquery CASE blocks intact.
    s = formatInlineCaseExpressions(s);

    // Indent CTE bodies (WITH name AS (...) → body indented one level)
    s = formatCTEBlocks(s);

    // Restore opaque regions and put standalone Jinja/comment lines back on their own lines.
    s = placeStandaloneOpaqueLines(restoreOpaqueRegions(s, saved), saved);
    s = placeJinjaControlTagsOnOwnLines(s);
    s = splitWhereHavingConditions(s);
    s = expandBracketedConditions(s);
    s = normalizeJinjaControlIndentation(s);
    s = formatParenthesizedSubqueries(s);
    s = formatInsertValues(s);
    s = formatSetAssignments(s);

    // Empty line around UNION / UNION ALL / INTERSECT / EXCEPT
    // Use pre-scanned adjacency info (comment positions are lost after whitespace collapse)
    const UNION_LINE = /^\s*(UNION(?: ALL)?|INTERSECT|EXCEPT)(\s*--.*)?$/i;
    const COMMENT_LINE = /^\s*--/;
    const sqlLines = s.split('\n');
    const out = [];
    let unionIdx = 0;
    for (let i = 0; i < sqlLines.length; i++) {
        let line = sqlLines[i];
        if (UNION_LINE.test(line)) {
            const prevComment =
                (i > 0 && COMMENT_LINE.test(sqlLines[i - 1])) ||
                !!unionAdj.pre[unionIdx];
            const nextComment =
                (i < sqlLines.length - 1 && COMMENT_LINE.test(sqlLines[i + 1])) ||
                !!unionAdj.post[unionIdx];

            if (prevComment && out.length > 0) {
                const splitPrev = splitTrailingInlineComment(out[out.length - 1]);
                if (splitPrev) {
                    out[out.length - 1] = splitPrev.code;
                    out.push(splitPrev.comment);
                }
            }

            if (nextComment) {
                const splitCurrent = splitUnionLineForFollowingComment(line);
                if (splitCurrent) {
                    line = splitCurrent.code;
                    sqlLines.splice(i + 1, 0, splitCurrent.comment);
                }
            }

            if (!prevComment) out.push('');
            out.push(line);
            if (!nextComment) out.push('');
            unionIdx++;
        } else {
            out.push(line);
        }
    }
    return out.join('\n');
}

const _PATTERNS_HEAD = [
    { re: /\{#[\s\S]*?#\}/g, key: 'comment' },
    { re: /\{%-?[\s\S]*?-?%\}/g, key: 'jinja' },
    { re: /\{\{[\s\S]*?\}\}/g, key: 'jinja' },
    { re: /--[^\n]*/g, key: 'comment' },
    { re: /(?<=->>?[ \t]*)('[^']*'|"[^"]*")/g, key: 'json_path' },
    { re: /'[^']*'/g, key: 'string' },
    { re: /"[^"]*"/g, key: 'string' },
    { re: /`[^`]+`/g, key: 'identifier' },
    { re: /:[a-zA-Z_][a-zA-Z0-9_]*/g, key: 'param' },
    { re: /\b(TRUE|FALSE|NULL)\b/gi, key: 'boolean' },
];
const _PATTERNS_TAIL = [
    { re: /\b\d+(\.\d+)?\b/g, key: 'number' },
    { re: /->>|->|!=|<>|<=|>=|[<>=]/g, key: 'operator' },
];

const SPECIFIC_PATTERNS_SQL = [
    ..._PATTERNS_HEAD,
    {
        re: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH|JSON|LATERAL|RECURSIVE|MATCH|AGAINST|REGEXP|RLIKE|EXPLAIN|ANALYZE|TRUNCATE|REPLACE|ROLLUP|CUBE|GROUPING|SEPARATOR|MERGE|MATCHED|ESCAPE|COLLATE|BINARY|STRAIGHT_JOIN|WITHIN|DUPLICATE|KEY)\b/gi,
        key: 'keyword'
    },
    {
        re: /\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|IFNULL|IF|ROW|CONCAT|CONCAT_WS|SUBSTRING|SUBSTR|LENGTH|TRIM|LTRIM|RTRIM|UPPER|LOWER|REPLACE|INSTR|DATE|DATE_FORMAT|TIME_FORMAT|DATE_ADD|DATE_SUB|DATEDIFF|NOW|CURDATE|CAST|CONVERT|GROUP_CONCAT|ROW_NUMBER|RANK|DENSE_RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|ROUND|FLOOR|CEIL|CEILING|ABS|MOD|POWER|GREATEST|LEAST|TIMESTAMPDIFF|EXTRACT|JSON_EXTRACT|JSON_UNQUOTE|GROUPING|JSON_ARRAYAGG|JSON_OBJECTAGG|POSITION|LOCATE|FIND_IN_SET|FIELD|UUID|DATABASE|SCHEMA)\s*(?=\()/gi,
        key: 'function'
    },
    ..._PATTERNS_TAIL,
];

const SPECIFIC_PATTERNS_BQ = [
    ..._PATTERNS_HEAD,
    {
        re: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH|JSON|QUALIFY|TABLESAMPLE|PIVOT|UNPIVOT|STRUCT|ARRAY|UNNEST|TIMESTAMP|DATETIME|TIME|FOLLOWING|PRECEDING|UNBOUNDED|ROWS|RANGE|IGNORE|RESPECT|LATERAL|RECURSIVE|MATCH|AGAINST|REGEXP|RLIKE|EXPLAIN|ANALYZE|TRUNCATE|REPLACE|ROLLUP|CUBE|GROUPING|SEPARATOR|MERGE|MATCHED|ESCAPE|COLLATE|BINARY|STRAIGHT_JOIN|WITHIN|DUPLICATE|KEY)\b/gi,
        key: 'keyword'
    },
    {
        re: /\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|IFNULL|IF|CONCAT|CONCAT_WS|SUBSTRING|SUBSTR|LENGTH|TRIM|LTRIM|RTRIM|UPPER|LOWER|REPLACE|INSTR|DATE|DATE_FORMAT|TIME_FORMAT|DATE_ADD|DATE_SUB|DATEDIFF|NOW|CURDATE|CAST|CONVERT|GROUP_CONCAT|ROW_NUMBER|RANK|DENSE_RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|ROUND|FLOOR|CEIL|CEILING|ABS|MOD|POWER|GREATEST|LEAST|TIMESTAMPDIFF|EXTRACT|JSON_EXTRACT|JSON_UNQUOTE|GROUPING|JSON_ARRAYAGG|JSON_OBJECTAGG|POSITION|LOCATE|FIND_IN_SET|FIELD|UUID|DATABASE|SCHEMA|STRING_AGG|ARRAY_AGG|ARRAY_LENGTH|ARRAY_TO_STRING|ARRAY_CONCAT|ARRAY_REVERSE|GENERATE_ARRAY|ANY_VALUE|COUNTIF|LOGICAL_AND|LOGICAL_OR|APPROX_COUNT_DISTINCT|PERCENTILE_CONT|PERCENTILE_DISC|PERCENT_RANK|CUME_DIST|NTILE|NTH_VALUE|REGEXP_REPLACE|REGEXP_EXTRACT|REGEXP_CONTAINS|DATE_TRUNC|TIMESTAMP_TRUNC|DATETIME_TRUNC|DATETIME_ADD|DATETIME_SUB|DATETIME_DIFF|TIMESTAMP_ADD|TIMESTAMP_SUB|TIMESTAMP_DIFF|DATE_DIFF|PARSE_DATE|PARSE_TIMESTAMP|PARSE_DATETIME|FORMAT_DATE|FORMAT_TIMESTAMP|FORMAT_DATETIME|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|CURRENT_DATETIME|SAFE_DIVIDE|SAFE_CAST|GENERATE_UUID|SPLIT|STARTS_WITH|ENDS_WITH|STRPOS|LPAD|RPAD|REPEAT|REVERSE|CHAR_LENGTH|BYTE_LENGTH|FORMAT|TO_BASE64|FROM_BASE64|TO_HEX|FROM_HEX|SHA256|MD5|FARM_FINGERPRINT|JSON_VALUE|JSON_QUERY|JSON_EXTRACT_SCALAR|JSON_EXTRACT_ARRAY|JSON_OBJECT|JSON_ARRAY|BIT_AND|BIT_OR|BIT_XOR|BIT_COUNT|RANGE_BUCKET|STRUCT|UNNEST|ARRAY)\s*(?=\()/gi,
        key: 'function'
    },
    ..._PATTERNS_TAIL,
];

const IDENT_RE = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
const CAPS_WORD_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
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

    const opaque = buildOpaqueMask(sql);
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

function buildOpaqueMask(sql) {
    const opaque = new Array(sql.length).fill(false);
    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === '-' && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') opaque[i++] = true;
            i--;
            continue;
        }

        // Jinja blocks: {{ }}, {% %}, {# #} (with optional - trimming)
        if (sql[i] === '{' && i + 1 < sql.length) {
            let close = null;
            if (sql[i + 1] === '{') close = '}}';
            else if (sql[i + 1] === '%') close = '%}';
            else if (sql[i + 1] === '#') close = '#}';
            if (close) {
                const end = sql.indexOf(close, i + 2);
                const until = end === -1 ? sql.length : end + close.length;
                for (let j = i; j < until; j++) opaque[j] = true;
                i = until - 1;
                continue;
            }
        }

        if (sql[i] === '\'' || sql[i] === '"' || sql[i] === '`') {
            const quote = sql[i];
            opaque[i] = true;
            i++;
            while (i < sql.length) {
                opaque[i] = true;
                if (sql[i] === quote) {
                    if (sql[i + 1] === quote) {
                        opaque[i + 1] = true;
                        i += 2;
                        continue;
                    }
                    break;
                }
                i++;
            }
        }
    }
    return opaque;
}

function findMatchingBracket(sql, cursorOffset) {
    const pairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        ')': '(',
        ']': '[',
        '}': '{',
    };
    const opening = new Set(['(', '[', '{']);
    const closing = new Set([')', ']', '}']);
    const opaque = buildOpaqueMask(sql);

    const candidates = [cursorOffset, cursorOffset - 1];
    let bracketIndex = -1;
    let bracket = null;
    for (const idx of candidates) {
        if (idx < 0 || idx >= sql.length || opaque[idx]) continue;
        if (pairs[sql[idx]]) {
            bracketIndex = idx;
            bracket = sql[idx];
            break;
        }
    }
    if (bracketIndex === -1) return null;

    if (opening.has(bracket)) {
        let depth = 1;
        for (let i = bracketIndex + 1; i < sql.length; i++) {
            if (opaque[i]) continue;
            if (sql[i] === bracket) depth++;
            else if (sql[i] === pairs[bracket]) depth--;
            if (depth === 0) return { start: bracketIndex, end: i };
        }
        return { unmatched: bracketIndex };
    }

    if (closing.has(bracket)) {
        let depth = 1;
        for (let i = bracketIndex - 1; i >= 0; i--) {
            if (opaque[i]) continue;
            if (sql[i] === bracket) depth++;
            else if (sql[i] === pairs[bracket]) depth--;
            if (depth === 0) return { start: i, end: bracketIndex };
        }
        return { unmatched: bracketIndex };
    }

    return null;
}

function findUnmatchedBrackets(sql) {
    const unmatched = [];
    const opaque = buildOpaqueMask(sql);
    const stack = [];
    const openingToClosing = { '(': ')', '[': ']', '{': '}' };
    const closingToOpening = { ')': '(', ']': '[', '}': '{' };

    for (let i = 0; i < sql.length; i++) {
        if (opaque[i]) continue;
        const ch = sql[i];

        if (openingToClosing[ch]) {
            stack.push({ ch, index: i });
            continue;
        }

        if (closingToOpening[ch]) {
            const expected = closingToOpening[ch];
            if (stack.length > 0 && stack[stack.length - 1].ch === expected) {
                stack.pop();
            } else {
                unmatched.push(i);
            }
        }
    }

    while (stack.length > 0) {
        unmatched.push(stack.pop().index);
    }

    return unmatched.sort((a, b) => a - b);
}

function findSQLRanges(text) {
    const ranges = [];
    const TRIPLE = /('''|""")/g;
    const SQL_START = /^\s*(?:(?:--[^\n]*|\/\*[\s\S]*?\*\/)\s*)*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i;
    const DIALECT_HINT = /^--(bq|spanner|sql)\s*(?:\n|$)/i;
    let m;
    while ((m = TRIPLE.exec(text)) !== null) {
        const quote = m[1];
        const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
        const beforeQuote = text.slice(lineStart, m.index);
        if (!beforeQuote.trim()) {
            // Skip past the closing quote so it isn't treated as a new opening
            const closingIdx = text.indexOf(quote, m.index + quote.length);
            if (closingIdx !== -1) TRIPLE.lastIndex = closingIdx + quote.length;
            continue;
        }
        const start = m.index + quote.length;
        const end = text.indexOf(quote, start);
        if (end !== -1 && SQL_START.test(text.slice(start, end))) {
            const content = text.slice(start, end);
            const hintMatch = DIALECT_HINT.exec(content);
            const hintValue = hintMatch ? hintMatch[1].toLowerCase() : 'sql';
            const dialect = (hintValue === 'bq' || hintValue === 'spanner') ? 'bq' : 'sql';
            ranges.push({
                start,
                end,
                fullStart: m.index,
                fullEnd: end + quote.length,
                quote,
                dialect,
            });
            TRIPLE.lastIndex = end + quote.length;
        }
    }
    return ranges;
}

function buildFormattedSQLBlock(text, sqlRange) {
    const outerQuote = '\'\'\'';
    const original = text.slice(sqlRange.start, sqlRange.end);

    // Detect base indentation from the first indented SQL line.
    const indentMatch = original.match(/\n([ \t]+)/);
    const indent = indentMatch ? indentMatch[1] : '    ';
    const formattedLines = formatSQL(original.trim()).split('\n').map(line => indent + line).join('\n');

    const openingLineStart = text.lastIndexOf('\n', sqlRange.fullStart - 1) + 1;
    const baseIndent = (text.slice(openingLineStart, sqlRange.fullStart).match(/^[ \t]*/) || [''])[0];
    const continuationIndent = baseIndent + '    ';

    const closingQuoteStart = sqlRange.fullEnd - sqlRange.quote.length;
    const closingLineEndIdx = text.indexOf('\n', sqlRange.fullEnd);
    const closingLineEnd = closingLineEndIdx === -1 ? text.length : closingLineEndIdx;
    const trailingClosingLine = text.slice(sqlRange.fullEnd, closingLineEnd);
    const trailing = trailingClosingLine.trim();
    let closingSuffix = '';
    let continuation = '';

    if (trailing) {
        if (trailing.startsWith(',')) {
            closingSuffix = ',';
            const rest = trailing.slice(1).trim();
            if (rest) continuation = '\n' + continuationIndent + rest;
        } else {
            continuation = '\n' + continuationIndent + trailing;
        }
    }

    return {
        start: sqlRange.fullStart,
        end: closingLineEnd,
        formatted: `${outerQuote}\n${formattedLines}${outerQuote}${closingSuffix}${continuation}`,
    };
}

function createEmptySchemaMetadata() {
    return {
        tables: new Set(),
        columns: new Set(),
        tableColumns: new Map(),
        columnTypes: new Map(),      // table -> Map<column, type>
        tableLocations: new Map(),   // table -> { uri, offset }
        columnLocations: new Map(),  // table -> Map<column, { uri, offset }>
        sourceUris: new Set(),
    };
}

function extractColumnType(raw) {
    if (!raw) return '';
    const t = raw.trim();
    if (/^ForeignKey\b/i.test(t)) return '';
    // Unwrap namespace: sa.String -> String, types.JSON -> JSON
    const parts = t.split('.');
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
            for (const [col, loc] of colLocs.entries()) {
                if (!target.columnLocations.get(tableName).has(col))
                    target.columnLocations.get(tableName).set(col, loc);
            }
        }
    }

    for (const [tableName, colTypes] of source.columnTypes.entries()) {
        let targetColTypes = target.columnTypes.get(tableName);
        if (!targetColTypes) {
            targetColTypes = new Map();
            target.columnTypes.set(tableName, targetColTypes);
        }
        for (const [col, type] of colTypes.entries()) {
            targetColTypes.set(col, type);
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
        // Offset of __tablename__ line within the full text (for Go to Definition)
        const tableOffset = blockStart + tableNameMatch.index;
        const columnRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:[\w.]+\.)?(?:Column|mapped_column)\s*\(\s*((?:[^,()]+|\([^)]*\))*)/gm;
        let columnMatch;
        while ((columnMatch = columnRe.exec(block)) !== null) {
            const colName = columnMatch[1].toLowerCase();
            columns.add(colName);
            metadata.columns.add(colName);
            const colType = extractColumnType(columnMatch[2]);
            if (colType) colTypes.set(colName, colType);
            colLocs.set(colName, { offset: blockStart + columnMatch.index });
        }

        metadata.tables.add(tableName);
        metadata.tableColumns.set(tableName, columns);
        metadata.columnTypes.set(tableName, colTypes);
        metadata.tableLocations.set(tableName, { offset: tableOffset });
        metadata.columnLocations.set(tableName, colLocs);
    }

    return metadata;
}

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

function buildDecorations(themeName) {
    const colors = THEMES[themeName] || THEMES['dracula'];
    return Object.fromEntries(
        Object.entries(colors).map(([k, style]) => [k, vscode.window.createTextEditorDecorationType(style)])
    );
}

function activate(context) {
    const cfg = () => vscode.workspace.getConfiguration('jsqlSyntax');
    let dec = buildDecorations(cfg().get('theme', 'dracula'));
    let bracketDec = vscode.window.createTextEditorDecorationType({
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorBracketMatch.border'),
        backgroundColor: new vscode.ThemeColor('editorBracketMatch.background'),
        borderRadius: '2px',
        overviewRulerColor: new vscode.ThemeColor('editorBracketMatch.border'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    let bracketErrorDec = vscode.window.createTextEditorDecorationType({
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorError.foreground'),
        backgroundColor: 'rgba(255, 0, 0, 0.18)',
        borderRadius: '2px',
        overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    const diagnostics = vscode.languages.createDiagnosticCollection('jsqlSyntax');
    context.subscriptions.push(diagnostics);
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

        welcomePanel.webview.html = `<!DOCTYPE html>
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
  <button class="btn btn-primary" data-command="jsqlSyntax.manageScopes">⚙ Manage Schema Scopes</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.selectTheme">🎨 Select Theme</button>
  <button class="btn btn-secondary" data-command="jsqlSyntax.formatSQL">⌥⇧F Format SQL</button>
</div>

<!-- Highlighting -->
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

<!-- Schema -->
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

<!-- Formatting -->
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

<!-- Navigation -->
<div class="section">
  <h2>Navigation</h2>
  <p class="subtitle">Jump around your SQL and Python files without leaving the keyboard.</p>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a table name <span>→ jumps to <code>__tablename__</code> in the Python model file</span></div>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a qualified column &nbsp;<code class="al">uc</code><code>.</code><code class="col">created_at</code> <span>→ jumps to the FROM/JOIN line in the query</span></div>
  <div class="shortcut-row"><kbd class="kbd">F12</kbd> on a table alias &nbsp;<code class="al">uc</code> <span>→ jumps to the FROM/JOIN where the alias is defined</span></div>
  <div class="shortcut-row"><kbd class="kbd">F2</kbd> on any alias <span>→ renames it everywhere in the SQL block (table aliases and column aliases)</span></div>
  <div class="shortcut-row"><code class="al">uc</code><code>.</code> <span>→ autocomplete dropdown of all columns on <code class="tbl">user_contract</code> with types</span></div>
</div>

<!-- Diagnostics -->
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
            dec = buildDecorations(items[0].label);
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
                dec = buildDecorations(originalTheme);
                vscode.window.visibleTextEditors.forEach(applyDecorations);
            }
            qp.dispose();
        });

        qp.show();
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('jsqlSyntax.theme')) {
            Object.values(dec).forEach(d => d.dispose());
            dec = buildDecorations(cfg().get('theme', 'dracula'));
            bracketDec.dispose();
            bracketErrorDec.dispose();
            bracketDec = vscode.window.createTextEditorDecorationType({
                border: '1px solid',
                borderColor: new vscode.ThemeColor('editorBracketMatch.border'),
                backgroundColor: new vscode.ThemeColor('editorBracketMatch.background'),
                borderRadius: '2px',
                overviewRulerColor: new vscode.ThemeColor('editorBracketMatch.border'),
                overviewRulerLane: vscode.OverviewRulerLane.Right,
            });
            bracketErrorDec = vscode.window.createTextEditorDecorationType({
                border: '1px solid',
                borderColor: new vscode.ThemeColor('editorError.foreground'),
                backgroundColor: 'rgba(255, 0, 0, 0.18)',
                borderRadius: '2px',
                overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
                overviewRulerLane: vscode.OverviewRulerLane.Right,
            });
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
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) applyDecorations(editor);
    }, null, context.subscriptions);
    vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== 'python') return;
        if (!getConfiguredTableDefinitionFiles().length) return;
        scheduleSchemaRefresh();
    }, null, context.subscriptions);

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('python', {
            provideDefinition(doc, position) {
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

    context.subscriptions.push(bracketDec);
    context.subscriptions.push(bracketErrorDec);
    vscode.window.visibleTextEditors.forEach(applyDecorations);
    scheduleSchemaRefresh();
}

function deactivate() { }
module.exports = { activate, deactivate, detectMissingSelectCommas, detectDuplicateAliases, detectAmbiguousColumns, findMatchingBracket, findUnmatchedBrackets };
