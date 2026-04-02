'use strict';

const assert = require('assert');
const { loadExtensionInternals } = require('./load-formatter');

const { formatSQL, findSQLRanges, detectMissingSelectCommas, findMatchingBracket, findUnmatchedBrackets } = loadExtensionInternals();

const formatCases = [
    {
        name: 'adds blank lines around plain UNION',
        input: 'select a from table_a union select b from table_b',
        expected: [
            'SELECT a',
            'FROM table_a',
            '',
            'UNION',
            '',
            'SELECT b',
            'FROM table_b',
        ].join('\n'),
    },
    {
        name: 'treats adjacent comment lines as the separator around UNION',
        input: [
            'select a from table_a',
            '-- before union',
            'union',
            '-- after union',
            'select b from table_b',
        ].join('\n'),
        expected: [
            'SELECT a',
            'FROM table_a',
            '-- before union',
            'UNION',
            '-- after union',
            'SELECT b',
            'FROM table_b',
        ].join('\n'),
    },
    {
        name: 'keeps inline comments on UNION lines inline',
        input: [
            'select a from table_a',
            'union -- keep this note',
            'select b from table_b',
        ].join('\n'),
        expected: [
            'SELECT a',
            'FROM table_a',
            '',
            'UNION -- keep this note',
            '',
            'SELECT b',
            'FROM table_b',
        ].join('\n'),
    },
    {
        name: 'preserves inline UNION comments and splits a following standalone comment',
        input: [
            'select a from table_a',
            'union -- keep this note',
            '-- after union',
            'select b from table_b',
        ].join('\n'),
        expected: [
            'SELECT a',
            'FROM table_a',
            '',
            'UNION -- keep this note',
            '-- after union',
            'SELECT b',
            'FROM table_b',
        ].join('\n'),
    },
    {
        name: 'matches indented UNION lines',
        input: [
            'select a from table_a',
            '    union',
            'select b from table_b',
        ].join('\n'),
        expected: [
            'SELECT a',
            'FROM table_a',
            '',
            'UNION',
            '',
            'SELECT b',
            'FROM table_b',
        ].join('\n'),
    },
    {
        name: 'expands SELECT lists with more than two columns',
        input: 'select a, b, coalesce(c, 0), d from metrics',
        expected: [
            'SELECT',
            '    a,',
            '    b,',
            '    coalesce(c, 0),',
            '    d',
            'FROM metrics',
        ].join('\n'),
    },
    {
        name: 'formats CASE expressions across multiple lines',
        input: 'select case when score > 90 then \'A\' when score > 80 then \'B\' else \'C\' end as grade from exams',
        expected: [
            'SELECT CASE',
            '    WHEN score > 90 THEN "A"',
            '    WHEN score > 80 THEN "B"',
            '    ELSE "C"',
            'END AS grade',
            'FROM exams',
        ].join('\n'),
    },
    {
        name: 'keeps GROUP BY, HAVING, and ORDER BY as distinct clauses in SQL order',
        input: 'select team, count(*) from matches group by team having count(*) > 1 order by count(*) desc',
        expected: [
            'SELECT team, count(*)',
            'FROM matches',
            'GROUP BY team',
            'HAVING count(*) > 1',
            'ORDER BY count(*) DESC',
        ].join('\n'),
    },
];

const rangeCases = [
    {
        name: 'finds SQL inside triple-quoted Python strings',
        input: [
            'query = """',
            'select id from users',
            '"""',
            '',
            'x = 1',
        ].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'ignores non-SQL triple-quoted strings',
        input: [
            'message = """',
            'hello world',
            '"""',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'ignores Python docstrings (triple quote at start of line)',
        input: [
            'def get_users():',
            '    """',
            '    Returns all active users.',
            '    """',
            '    return db.query()',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'ignores inline docstrings that happen to contain SQL-like words',
        input: [
            'def select_users():',
            '    """Select users from the database."""',
            '    pass',
        ].join('\n'),
        expectedCount: 0,
    },
];

const commaWarningCases = [
    {
        name: 'warns on missing comma between multiline SELECT columns',
        input: [
            'SELECT',
            '    first_name',
            '    last_name',
            'FROM users',
        ].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'does not warn when SELECT columns are comma separated',
        input: [
            'SELECT',
            '    first_name,',
            '    last_name,',
            '    email',
            'FROM users',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn after GROUP BY, HAVING, or ORDER BY',
        input: [
            'SELECT',
            '    team,',
            '    COUNT(*)',
            'FROM matches',
            'GROUP BY team',
            'HAVING COUNT(*) > 1',
            'ORDER BY COUNT(*) DESC',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'stops checking once FROM starts, even with JOIN clauses after it',
        input: [
            'SELECT',
            '    u.id,',
            '    u.email',
            'FROM users u',
            'JOIN teams t ON t.id = u.team_id',
            'WHERE u.active = TRUE',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn for unformatted SELECT line that already includes FROM before JOINs',
        input: [
            'SELECT 1 FROM access_request ar',
            'LEFT JOIN request_type rt ON ar.id_request_type = rt.id_request_type',
            'LEFT JOIN status s ON ar.id_status = s.id_status',
            'WHERE ar.id_user = :id_user',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn when consecutive SELECT columns are multiline CASE expressions',
        input: [
            'SELECT DISTINCT',
            '    COALESCE(f.name, a.name, p.name, ug.name, CASE',
            '        WHEN aar.entity_id IS NULL THEN \'All entities of this type in business unit\'',
            '        ELSE \'Unknown entity\'',
            '    END) AS entity_name,',
            '    CASE',
            '        WHEN aar.entity_id IS NULL THEN TRUE',
            '        ELSE FALSE',
            '    END AS is_business_unit_wide',
            'FROM access_approval_member aam',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn when first column of a subquery SELECT is a CASE expression',
        input: [
            'SELECT 1,',
            '    (SELECT',
            '        CASE',
            '            WHEN u.is_suspended = 1 THEN \'Suspended\'',
            '            ELSE \'Active\'',
            '        END',
            '    FROM users u2',
            '    WHERE u2.id_user = u.id_user',
            '    ) AS status',
            'FROM users u',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'warns when a multiline CASE expression is missing its trailing comma before the next column',
        input: [
            'SELECT DISTINCT',
            '    COALESCE(f.name, a.name, p.name, ug.name, CASE',
            '        WHEN aar.entity_id IS NULL THEN \'All entities of this type in business unit\'',
            '        ELSE \'Unknown entity\'',
            '    END) AS entity_name',
            '    CASE',
            '        WHEN aar.entity_id IS NULL THEN TRUE',
            '        ELSE FALSE',
            '    END AS is_business_unit_wide',
            'FROM access_approval_member aam',
        ].join('\n'),
        expectedCount: 1,
    },
];

const bracketCases = [
    {
        name: 'finds matching parentheses in nested SQL expressions',
        input: 'COALESCE(a, (b + c), d)',
        cursorOffset: 'COALESCE'.length,
        expected: { start: 8, end: 22 },
    },
    {
        name: 'ignores parentheses inside quoted strings',
        input: "CONCAT('(' , value, ')')",
        cursorOffset: 6,
        expected: { start: 6, end: 23 },
    },
    {
        name: 'returns unmatched bracket when no closing bracket exists',
        input: 'COALESCE(a, (b + c, d)',
        cursorOffset: 'COALESCE'.length,
        expected: { unmatched: 8 },
    },
];

const unmatchedBracketCases = [
    {
        name: 'finds unmatched opening brackets without cursor context',
        input: 'SELECT (a + (b * c) FROM t',
        expected: [7],
    },
    {
        name: 'finds unmatched closing brackets without cursor context',
        input: 'SELECT a + b) FROM t',
        expected: [12],
    },
];

function runFormatCases() {
    for (const testCase of formatCases) {
        assert.strictEqual(
            formatSQL(testCase.input),
            testCase.expected,
            `formatSQL failed: ${testCase.name}`
        );
    }
}

function runRangeCases() {
    for (const testCase of rangeCases) {
        assert.strictEqual(
            findSQLRanges(testCase.input).length,
            testCase.expectedCount,
            `findSQLRanges failed: ${testCase.name}`
        );
    }
}

function runCommaWarningCases() {
    for (const testCase of commaWarningCases) {
        assert.strictEqual(
            detectMissingSelectCommas(testCase.input).length,
            testCase.expectedCount,
            `detectMissingSelectCommas failed: ${testCase.name}`
        );
    }
}

function runBracketCases() {
    for (const testCase of bracketCases) {
        assert.strictEqual(
            JSON.stringify(findMatchingBracket(testCase.input, testCase.cursorOffset)),
            JSON.stringify(testCase.expected),
            `findMatchingBracket failed: ${testCase.name}`
        );
    }
}

function runUnmatchedBracketCases() {
    for (const testCase of unmatchedBracketCases) {
        assert.strictEqual(
            JSON.stringify(findUnmatchedBrackets(testCase.input)),
            JSON.stringify(testCase.expected),
            `findUnmatchedBrackets failed: ${testCase.name}`
        );
    }
}

function main() {
    runFormatCases();
    runRangeCases();
    runCommaWarningCases();
    runBracketCases();
    runUnmatchedBracketCases();
    console.log(`Passed ${formatCases.length + rangeCases.length + commaWarningCases.length + bracketCases.length + unmatchedBracketCases.length} tests.`);
}

main();
