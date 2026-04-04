'use strict';

const {
    buildOpaqueMask,
    isJinjaControlTag,
    matchKeyword,
    splitTopLevelCommas,
} = require('./shared');

function extractCaseContent(sql, start) {
    let depth = 1;
    let i = start;
    while (i < sql.length && depth > 0) {
        if (matchKeyword(sql, i, 'CASE')) {
            depth++;
            i += 4;
        } else if (matchKeyword(sql, i, 'END')) {
            depth--;
            if (depth === 0) {
                return { content: sql.slice(start, i), afterEnd: i + 3 };
            }
            i += 3;
        } else {
            i++;
        }
    }
    return { content: sql.slice(start), afterEnd: sql.length };
}

function splitCaseContent(content) {
    const parts = [];
    let i = 0;
    let start = 0;
    let parenDepth = 0;
    let caseDepth = 0;
    let currentType = null;
    while (i <= content.length) {
        const ch = content[i];
        if (ch === '(') {
            parenDepth++;
            i++;
            continue;
        }
        if (ch === ')') {
            parenDepth--;
            i++;
            continue;
        }
        if (parenDepth === 0) {
            if (matchKeyword(content, i, 'CASE')) {
                caseDepth++;
                i += 4;
                continue;
            }
            if (caseDepth > 0 && matchKeyword(content, i, 'END')) {
                caseDepth--;
                i += 3;
                continue;
            }
            if (caseDepth === 0) {
                const kw = matchKeyword(content, i, 'WHEN')
                    ? 'WHEN'
                    : matchKeyword(content, i, 'ELSE')
                        ? 'ELSE'
                        : null;
                if (kw || i === content.length) {
                    if (currentType !== null) {
                        parts.push({ type: currentType, text: content.slice(start, i).trim() });
                    }
                    if (kw) {
                        currentType = kw;
                        i += kw.length;
                        start = i;
                        continue;
                    }
                }
            }
        }
        i++;
    }
    return parts;
}

function expandCaseBlocks(sql, baseIndent) {
    let result = '';
    let i = 0;
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
            const formatted = parts
                .map(part => innerIndent + part.type + ' ' + expandCaseBlocks(part.text, innerIndent))
                .join('\n');
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
    let result = '';
    let i = 0;
    while (i < sql.length) {
        if (matchKeyword(sql, i, 'AS')) {
            let j = i + 2;
            while (j < sql.length && sql[j] === ' ') j++;
            if (sql[j] === '(') {
                const lineStart = sql.lastIndexOf('\n', i) + 1;
                const lineIndent = sql.slice(lineStart, i).match(/^([ \t]*)/)[1];
                const bodyIndent = lineIndent + '    ';

                result += 'AS (\n';
                j++;

                let depth = 1;
                const bodyStart = j;
                while (j < sql.length && depth > 0) {
                    if (sql[j] === '(') depth++;
                    else if (sql[j] === ')') depth--;
                    if (depth > 0) j++;
                    else break;
                }

                const bodyLines = sql.slice(bodyStart, j)
                    .split('\n')
                    .map(line => line.trimEnd())
                    .filter(line => line.trim())
                    .map(line => bodyIndent + line);

                result += bodyLines.join('\n') + '\n' + lineIndent + ')';
                i = j + 1;

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
    let i = 0;
    let start = 0;
    let parenDepth = 0;
    let caseDepth = 0;
    let currentOp = null;
    while (i <= content.length) {
        if (i < content.length) {
            if (content[i] === '(') {
                parenDepth++;
                i++;
                continue;
            }
            if (content[i] === ')') {
                parenDepth--;
                i++;
                continue;
            }
        }
        if (parenDepth === 0) {
            if (matchKeyword(content, i, 'CASE')) {
                caseDepth++;
                i += 4;
                continue;
            }
            if (caseDepth > 0 && matchKeyword(content, i, 'END')) {
                caseDepth--;
                i += 3;
                continue;
            }
            if (caseDepth === 0) {
                const kw = matchKeyword(content, i, 'AND')
                    ? 'AND'
                    : matchKeyword(content, i, 'OR')
                        ? 'OR'
                        : null;
                if (kw || i === content.length) {
                    const expr = content.slice(start, i).trim();
                    if (expr) parts.push({ op: currentOp, expr });
                    if (kw) {
                        currentOp = kw;
                        i += kw.length;
                        start = i;
                        continue;
                    }
                    break;
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
            const lines = parts.map(part => innerIndent + (part.op ? part.op + ' ' : '') + part.expr);
            return `${indent}${op} (\n${lines.join('\n')}\n${indent})`;
        }
    );
}

function detectUnionCommentAdjacency(sql) {
    const unionRe = /^(UNION(?: ALL)?|INTERSECT|EXCEPT)\b/i;
    const commentRe = /^--/;
    const lines = sql.split('\n').map(line => line.trim()).filter(line => line);
    const pre = [];
    const post = [];
    for (let i = 0; i < lines.length; i++) {
        if (unionRe.test(lines[i])) {
            pre.push(i > 0 && commentRe.test(lines[i - 1]));
            post.push(i < lines.length - 1 && commentRe.test(lines[i + 1]));
        }
    }
    return { pre, post };
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
    if (!match) return null;
    return {
        code: match[1].trimEnd(),
        comment: match[2].trimStart(),
    };
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

function isStandaloneAt(sql, start, end) {
    const lineStart = sql.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = sql.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? sql.length : lineEndIdx;
    const before = sql.slice(lineStart, start).trim();
    const after = sql.slice(end, lineEnd).trim();
    return !before && !after;
}

function restoreOpaqueRegions(sql, saved) {
    return sql.replace(/\x00(\d+)\x00/g, (_, index) => {
        const item = saved[+index];
        return item.standalone ? `\x01${index}\x01` : item.text;
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
    return lines.map(line => (line.trim() ? line.slice(minIndent) : ''));
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
        const replacement = '(\n'
            + dedented.map(line => (line ? innerIndent + line : '')).join('\n')
            + '\n'
            + baseIndent
            + ')';
        result = result.slice(0, start) + replacement + result.slice(end + 1);
    }

    return result;
}

function formatSetAssignments(sql) {
    return sql.replace(
        /^([ \t]*)(SET|ON DUPLICATE KEY UPDATE)\s+(.+)$/gim,
        (match, indent, keyword, rest) => {
            const assignments = splitTopLevelCommas(rest);
            if (assignments.length <= 2) return match;
            return indent + keyword + '\n'
                + assignments.map((assignment, index) => (
                    indent + '    ' + assignment.trim() + (index < assignments.length - 1 ? ',' : '')
                )).join('\n');
        }
    );
}

function formatInsertValues(sql) {
    return sql.replace(
        /^(VALUES)\s*(.+)$/gim,
        (match, keyword, rest) => {
            const rows = splitTopLevelCommas(rest);
            if (rows.length <= 1) return match;
            return keyword + '\n'
                + rows.map((row, index) => '    ' + row.trim() + (index < rows.length - 1 ? ',' : '')).join('\n');
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
        let result = '';
        let i = 0;
        let parenDepth = 0;
        let caseDepth = 0;

        while (i < clauseBody.length) {
            if (clauseBody[i] === '(') {
                parenDepth++;
                result += clauseBody[i++];
                continue;
            }
            if (clauseBody[i] === ')') {
                parenDepth--;
                result += clauseBody[i++];
                continue;
            }
            if (matchKeyword(clauseBody, i, 'CASE')) {
                caseDepth++;
                result += 'CASE';
                i += 4;
                continue;
            }
            if (caseDepth > 0 && matchKeyword(clauseBody, i, 'END')) {
                caseDepth--;
                result += 'END';
                i += 3;
                continue;
            }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(clauseBody, i, 'AND')) {
                result += '\n' + lineIndent + '    AND';
                i += 3;
                continue;
            }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(clauseBody, i, 'OR')) {
                result += '\n' + lineIndent + '    OR';
                i += 2;
                continue;
            }
            result += clauseBody[i++];
        }

        const parts = result.split('\n');
        parts[0] = lineIndent + keyword + (parts[0].trim() ? ' ' + parts[0].trim() : '');
        return parts.map(part => part.trimEnd());
    }).join('\n');
}

function formatSQL(sql) {
    const unionAdj = detectUnionCommentAdjacency(sql);

    const saved = [];
    const opaqueRe = /\{#[\s\S]*?#\}|\{%-?[\s\S]*?-?%\}|\{\{[\s\S]*?\}\}|--[^\n]*|'[^']*'|"[^"]*"|:[a-zA-Z_][a-zA-Z0-9_]*/g;
    let result = sql.replace(opaqueRe, (match, offset, whole) => {
        saved.push({
            text: normalizeStringQuotes(match),
            standalone: isStandaloneOpaqueToken(match) && isStandaloneAt(whole, offset, offset + match.length),
        });
        return `\x00${saved.length - 1}\x00`;
    });

    result = result.replace(/\s+/g, ' ').trim();

    result = result.replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|WITH|AS|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|EXISTS|CASE|WHEN|THEN|ELSE|END|RETURNING|PARTITION|OVER|WINDOW|ASC|DESC|NULLS|FIRST|LAST|TRUE|FALSE|INTERVAL|MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH|POWER|ROW|JSON|QUALIFY|TABLESAMPLE|PIVOT|UNPIVOT|STRUCT|ARRAY|UNNEST|TIMESTAMP|DATETIME|TIME|FOLLOWING|PRECEDING|UNBOUNDED|ROWS|RANGE|IGNORE|RESPECT|LATERAL|RECURSIVE|MATCH|AGAINST|REGEXP|RLIKE|EXPLAIN|ANALYZE|TRUNCATE|REPLACE|ROLLUP|CUBE|GROUPING|SEPARATOR|MERGE|MATCHED|ESCAPE|COLLATE|BINARY|STRAIGHT_JOIN|WITHIN|DUPLICATE|KEY)\b/gi, keyword => keyword.toUpperCase());

    result = result.replace(
        /\b(UNION ALL|GROUP BY|ORDER BY|INSERT INTO|REPLACE INTO|DELETE FROM|ON DUPLICATE KEY UPDATE|WHEN MATCHED|WHEN NOT MATCHED|SELECT|FROM|WHERE|HAVING|QUALIFY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|RETURNING|VALUES|SET|WITH|MERGE|EXPLAIN|ANALYZE|TRUNCATE)\b/g,
        '\n$1'
    );

    result = result.replace(/\b((?:LEFT|RIGHT|INNER|CROSS|FULL|NATURAL)(?: OUTER)? )?JOIN\b/g, match => '\n' + match.trimStart());

    {
        let rebuilt = '';
        let i = 0;
        let parenDepth = 0;
        let caseDepth = 0;
        while (i < result.length) {
            if (result[i] === '(') {
                parenDepth++;
                rebuilt += result[i++];
                continue;
            }
            if (result[i] === ')') {
                parenDepth--;
                rebuilt += result[i++];
                continue;
            }
            if (matchKeyword(result, i, 'CASE')) {
                caseDepth++;
                rebuilt += 'CASE';
                i += 4;
                continue;
            }
            if (caseDepth > 0 && matchKeyword(result, i, 'END')) {
                caseDepth--;
                rebuilt += 'END';
                i += 3;
                continue;
            }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(result, i, 'AND')) {
                rebuilt += '\n    AND';
                i += 3;
                continue;
            }
            if (parenDepth === 0 && caseDepth === 0 && matchKeyword(result, i, 'OR')) {
                rebuilt += '\n    OR';
                i += 2;
                continue;
            }
            rebuilt += result[i++];
        }
        result = rebuilt;
    }

    const lines = result.split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim())
        .flatMap(line => {
            if (!line.startsWith('SELECT ')) return [line];
            let rest = line.slice('SELECT '.length);
            let keyword = 'SELECT';
            if (rest.startsWith('DISTINCT ')) {
                keyword = 'SELECT DISTINCT';
                rest = rest.slice('DISTINCT '.length);
            }
            const cols = splitTopLevelCommas(rest);
            if (cols.length <= 1) return [`${keyword} ${cols.join(', ')}`];
            return [keyword, ...cols.map((column, index) => '    ' + column + (index < cols.length - 1 ? ',' : ''))];
        });

    result = expandBracketedConditions(lines.join('\n'));
    result = formatInlineCaseExpressions(result);
    result = formatCTEBlocks(result);
    result = placeStandaloneOpaqueLines(restoreOpaqueRegions(result, saved), saved);
    result = placeJinjaControlTagsOnOwnLines(result);
    result = splitWhereHavingConditions(result);
    result = expandBracketedConditions(result);
    result = normalizeJinjaControlIndentation(result);
    result = formatParenthesizedSubqueries(result);
    result = formatInsertValues(result);
    result = formatSetAssignments(result);

    const unionLine = /^\s*(UNION(?: ALL)?|INTERSECT|EXCEPT)(\s*--.*)?$/i;
    const commentLine = /^\s*--/;
    const sqlLines = result.split('\n');
    const out = [];
    let unionIdx = 0;
    for (let i = 0; i < sqlLines.length; i++) {
        let line = sqlLines[i];
        if (unionLine.test(line)) {
            const prevComment = (i > 0 && commentLine.test(sqlLines[i - 1])) || !!unionAdj.pre[unionIdx];
            const nextComment = (i < sqlLines.length - 1 && commentLine.test(sqlLines[i + 1])) || !!unionAdj.post[unionIdx];

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
    const triple = /('''|""")/g;
    const sqlStart = /^\s*(?:(?:--[^\n]*|\/\*[\s\S]*?\*\/)\s*)*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i;
    const dialectHint = /^--(bq|spanner|sql)\s*(?:\n|$)/i;
    let match;
    while ((match = triple.exec(text)) !== null) {
        const quote = match[1];
        const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
        const beforeQuote = text.slice(lineStart, match.index);
        if (!beforeQuote.trim()) {
            const closingIdx = text.indexOf(quote, match.index + quote.length);
            if (closingIdx !== -1) triple.lastIndex = closingIdx + quote.length;
            continue;
        }
        const start = match.index + quote.length;
        const end = text.indexOf(quote, start);
        if (end !== -1 && sqlStart.test(text.slice(start, end))) {
            const content = text.slice(start, end);
            const hintMatch = dialectHint.exec(content);
            const hintValue = hintMatch ? hintMatch[1].toLowerCase() : 'sql';
            const dialect = (hintValue === 'bq' || hintValue === 'spanner') ? 'bq' : 'sql';
            ranges.push({
                start,
                end,
                fullStart: match.index,
                fullEnd: end + quote.length,
                quote,
                dialect,
            });
            triple.lastIndex = end + quote.length;
        }
    }
    return ranges;
}

function buildFormattedSQLBlock(text, sqlRange) {
    const outerQuote = '\'\'\'';
    const original = text.slice(sqlRange.start, sqlRange.end);

    const indentMatch = original.match(/\n([ \t]+)/);
    const indent = indentMatch ? indentMatch[1] : '    ';
    const formattedLines = formatSQL(original.trim()).split('\n').map(line => indent + line).join('\n');

    const openingLineStart = text.lastIndexOf('\n', sqlRange.fullStart - 1) + 1;
    const baseIndent = (text.slice(openingLineStart, sqlRange.fullStart).match(/^[ \t]*/) || [''])[0];
    const continuationIndent = baseIndent + '    ';

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

module.exports = {
    buildFormattedSQLBlock,
    detectUnionCommentAdjacency,
    findMatchingBracket,
    findSQLRanges,
    findUnmatchedBrackets,
    formatSQL,
};
