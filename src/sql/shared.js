'use strict';

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
    'DUPLICATE', 'KEY',
    'LATERAL', 'RECURSIVE', 'MATCH', 'AGAINST', 'REGEXP', 'RLIKE',
    'EXPLAIN', 'ANALYZE', 'TRUNCATE', 'REPLACE',
    'ROLLUP', 'CUBE', 'GROUPING', 'SEPARATOR',
    'MERGE', 'MATCHED',
    'ESCAPE', 'COLLATE', 'BINARY', 'STRAIGHT_JOIN', 'WITHIN',
    'JSON_ARRAYAGG', 'JSON_OBJECTAGG',
    'POSITION', 'LOCATE', 'FIND_IN_SET', 'FIELD',
    'UUID', 'DATABASE', 'SCHEMA',
    'QUALIFY', 'TABLESAMPLE', 'PIVOT', 'UNPIVOT',
    'STRUCT', 'ARRAY', 'UNNEST',
    'TIMESTAMP', 'DATETIME', 'TIME',
    'FOLLOWING', 'PRECEDING', 'UNBOUNDED',
    'ROWS', 'RANGE',
    'IGNORE', 'RESPECT',
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
    const m = a.length;
    const n = b.length;
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
    let best = null;
    let bestDist = Infinity;

    for (const kw of ALL_SQL_KEYWORDS) {
        if (Math.abs(kw.length - word.length) > 2) continue;
        const distance = levenshtein(word, kw);
        if (distance < bestDist) {
            bestDist = distance;
            best = kw;
        }
    }

    return bestDist <= 2 ? best : null;
}

function matchKeyword(s, i, kw) {
    if (i > 0 && /\w/.test(s[i - 1])) return false;
    if (s.slice(i, i + kw.length).toUpperCase() !== kw) return false;
    const after = s[i + kw.length];
    return !after || !/\w/.test(after);
}

function splitTopLevelCommas(str) {
    const parts = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') depth--;
        else if (str[i] === ',' && depth === 0) {
            parts.push(str.slice(start, i).trim());
            start = i + 1;
        }
    }

    parts.push(str.slice(start).trim());
    return parts.filter(Boolean);
}

function isJinjaControlTag(text) {
    return /^\{%-?[\s\S]*?-?%\}$/.test(text);
}

function buildOpaqueMask(sql) {
    const opaque = new Array(sql.length).fill(false);

    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === '-' && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') opaque[i++] = true;
            i--;
            continue;
        }

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

module.exports = {
    ALL_SQL_KEYWORDS,
    buildOpaqueMask,
    findClosestKeyword,
    isJinjaControlTag,
    levenshtein,
    matchKeyword,
    splitTopLevelCommas,
};
