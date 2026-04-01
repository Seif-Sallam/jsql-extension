'use strict';
const vscode = require('vscode');

const THEMES = {
    dracula: {
        identifier: { color: '#B0B8C1' },
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
        identifier: { color: '#F8F8F2' },
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
        identifier: { color: '#ABB2BF' },
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
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'IFNULL', 'IF', 'CONCAT', 'CONCAT_WS',
    'SUBSTRING', 'SUBSTR', 'LENGTH', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER', 'REPLACE', 'INSTR',
    'DATE', 'DATE_FORMAT', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'NOW', 'CURDATE', 'CAST', 'CONVERT',
    'GROUP_CONCAT', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE',
    'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'ABS', 'MOD', 'POWER', 'GREATEST', 'LEAST', 'TIMESTAMPDIFF', 'EXTRACT',
    'JSON_EXTRACT', 'JSON_UNQUOTE',
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
    return splitTrailingInlineComment(line);
}

function formatSQL(sql) {
    // Scan original SQL for UNION-comment adjacency before any processing destroys line structure
    const unionAdj = detectUnionCommentAdjacency(sql);

    // Protect opaque regions from modification
    const saved = [];
    const OPAQUE_RE = /\{#[\s\S]*?#\}|\{%-?[\s\S]*?-?%\}|\{\{[\s\S]*?\}\}|--[^\n]*|'[^']*'|"[^"]*"/g;
    let s = sql.replace(OPAQUE_RE, m => { saved.push(m); return `\x00${saved.length - 1}\x00`; });

    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();

    // Uppercase keywords
    s = s.replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|TRUE|FALSE|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH|POWER)\b/gi, m => m.toUpperCase());

    // Break before top-level clauses — longer phrases first to avoid partial matches
    s = s.replace(
        /\b(UNION ALL|GROUP BY|ORDER BY|INSERT INTO|DELETE FROM|SELECT|FROM|WHERE|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|RETURNING|VALUES|SET|WITH)\b/g,
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
        if (cols.length <= 2) return [`${keyword} ${cols.join(', ')}`];
        return [keyword, ...cols.map((c, i) => '    ' + c + (i < cols.length - 1 ? ',' : ''))];
    });

    // Expand bracketed conditions with 3+ sub-conditions (AND/OR inside parens are still single-line)
    s = expandBracketedConditions(lines.join('\n'));

    // Expand CASE blocks per line (recursive, handles nesting)
    s = s.split('\n').flatMap(line => {
        const lineIndent = line.match(/^([ \t]*)/)[1];
        const expanded = expandCaseBlocks(line.slice(lineIndent.length), lineIndent);
        const parts = expanded.split('\n');
        parts[0] = lineIndent + parts[0];
        return parts;
    }).join('\n');

    // Indent CTE bodies (WITH name AS (...) → body indented one level)
    s = formatCTEBlocks(s);

    // Restore opaque regions first so comment lines are visible for UNION spacing
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => saved[+i]);

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

const SPECIFIC_PATTERNS = [
    { re: /\{#[\s\S]*?#\}/g, key: 'comment' },
    { re: /\{%-?[\s\S]*?-?%\}/g, key: 'jinja' },
    { re: /\{\{[\s\S]*?\}\}/g, key: 'jinja' },
    { re: /--[^\n]*/g, key: 'comment' },
    { re: /(?<=->>?[ \t]*)('[^']*'|"[^"]*")/g, key: 'json_path' },
    { re: /'[^']*'/g, key: 'string' },
    { re: /"[^"]*"/g, key: 'string' },
    { re: /:[a-zA-Z_][a-zA-Z0-9_]*/g, key: 'param' },
    { re: /\b(TRUE|FALSE)\b/gi, key: 'boolean' },
    {
        re: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH)\b/gi,
        key: 'keyword'
    },
    {
        re: /\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|IFNULL|IF|CONCAT|CONCAT_WS|SUBSTRING|SUBSTR|LENGTH|TRIM|LTRIM|RTRIM|UPPER|LOWER|REPLACE|INSTR|DATE|DATE_FORMAT|DATE_ADD|DATE_SUB|DATEDIFF|NOW|CURDATE|CAST|CONVERT|GROUP_CONCAT|ROW_NUMBER|RANK|DENSE_RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|ROUND|FLOOR|CEIL|CEILING|ABS|MOD|POWER|GREATEST|LEAST|TIMESTAMPDIFF|EXTRACT|JSON_EXTRACT|JSON_UNQUOTE)\s*(?=\()/gi,
        key: 'function'
    },
    { re: /\b\d+(\.\d+)?\b/g, key: 'number' },
    { re: /->>|->|!=|<>|<=|>=|[<>=]/g, key: 'operator' },
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
    return /^[A-Za-z_("*`[]/i.test(text);
}

function lineEndsLikeColumnContinuation(text) {
    return /(?:[,([]|->>|->|\+|-|\*|\/|%|=|<|>|<>|!=|<=|>=|AND|OR|WHEN|THEN|ELSE|CASE)$/i.test(text);
}

function splitAtFrom(text) {
    const match = /\bFROM\b/i.exec(text);
    if (!match) return null;
    return {
        beforeFrom: text.slice(0, match.index).trim(),
        afterFrom: text.slice(match.index).trim(),
    };
}

function detectMissingSelectCommas(sql) {
    const diagnostics = [];
    const lines = sql.split('\n');
    let offset = 0;
    let inSelect = false;
    let previousColumn = null;

    for (const rawLine of lines) {
        const lineOffset = offset;
        offset += rawLine.length + 1;

        const withoutComment = stripComment(rawLine);
        const trimmed = withoutComment.trim();
        if (!trimmed) continue;

        if (!inSelect) {
            if (!SELECT_START_RE.test(trimmed)) continue;
            previousColumn = null;

            if (!SELECT_ONLY_RE.test(trimmed)) {
                const selectRemainder = trimmed.replace(SELECT_PREFIX_RE, '').trim();
                const inlineSplit = splitAtFrom(selectRemainder);
                const inlineColumn = inlineSplit ? inlineSplit.beforeFrom : selectRemainder;
                if (inlineColumn) {
                    previousColumn = { text: inlineColumn };
                }
                inSelect = !inlineSplit;
            } else {
                inSelect = true;
            }
            continue;
        }

        const lineSplit = splitAtFrom(trimmed);
        if (lineSplit) {
            inSelect = false;
            previousColumn = null;
            continue;
        }

        if (!lineLooksLikeColumnStart(trimmed)) {
            if (previousColumn) previousColumn = { text: trimmed };
            continue;
        }

        if (previousColumn && !previousColumn.text.endsWith(',') && !lineEndsLikeColumnContinuation(previousColumn.text)) {
            const start = lineOffset + rawLine.indexOf(trimmed);
            diagnostics.push({
                start,
                end: start + trimmed.length,
                message: 'Possible missing comma between SELECT columns.',
            });
        }

        previousColumn = { text: trimmed };
    }

    return diagnostics;
}

function findSQLRanges(text) {
    const ranges = [];
    const TRIPLE = /('''|""")/g;
    const SQL_START = /^\s*(?:(?:--[^\n]*|\/\*[\s\S]*?\*\/)\s*)*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i;
    let m;
    while ((m = TRIPLE.exec(text)) !== null) {
        const quote = m[1];
        const start = m.index + quote.length;
        const end = text.indexOf(quote, start);
        if (end !== -1 && SQL_START.test(text.slice(start, end))) {
            ranges.push({ start, end });
            TRIPLE.lastIndex = end + quote.length;
        }
    }
    return ranges;
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

    const diagnostics = vscode.languages.createDiagnosticCollection('jsqlSyntax');
    context.subscriptions.push(diagnostics);

    function applyDecorations(editor) {
        if (!editor || editor.document.languageId !== 'python') return;
        const doc = editor.document;
        const text = doc.getText();
        const collected = Object.fromEntries(Object.keys(dec).map(k => [k, []]));
        const docDiagnostics = [];

        for (const { start, end } of findSQLRanges(text)) {
            const content = text.slice(start, end);

            const occupied = new Set();
            for (const { re, key } of SPECIFIC_PATTERNS) {
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

            for (const issue of detectMissingSelectCommas(content)) {
                const range = new vscode.Range(
                    doc.positionAt(start + issue.start),
                    doc.positionAt(start + issue.end)
                );
                const diag = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Warning);
                diag.source = 'jsql';
                docDiagnostics.push(diag);
            }
        }

        for (const [key, decoration] of Object.entries(dec)) {
            editor.setDecorations(decoration, collected[key]);
        }
        diagnostics.set(doc.uri, docDiagnostics);
    }

    vscode.commands.registerCommand('jsqlSyntax.formatSQL', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') return;

        const doc = editor.document;
        const text = doc.getText();
        const cursorOffset = doc.offsetAt(editor.selection.active);
        const sqlRange = findSQLRanges(text).find(r => r.start <= cursorOffset && cursorOffset <= r.end);

        if (!sqlRange) {
            vscode.window.showInformationMessage('Cursor is not inside a JSql block.');
            return;
        }

        const original = text.slice(sqlRange.start, sqlRange.end);

        // Detect base indentation from the first indented line
        const indentMatch = original.match(/\n([ \t]+)/);
        const indent = indentMatch ? indentMatch[1] : '    ';

        const formatted = '\n' + formatSQL(original.trim()).split('\n').map(l => indent + l).join('\n');

        if (formatted === original) return;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(doc.positionAt(sqlRange.start), doc.positionAt(sqlRange.end)), formatted);
        vscode.workspace.applyEdit(edit);
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
        if (!e.affectsConfiguration('jsqlSyntax.theme')) return;
        Object.values(dec).forEach(d => d.dispose());
        dec = buildDecorations(cfg().get('theme', 'dracula'));
        vscode.window.visibleTextEditors.forEach(applyDecorations);
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(applyDecorations, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) applyDecorations(editor);
    }, null, context.subscriptions);

    vscode.window.visibleTextEditors.forEach(applyDecorations);
}

function deactivate() { }
module.exports = { activate, deactivate, detectMissingSelectCommas };
