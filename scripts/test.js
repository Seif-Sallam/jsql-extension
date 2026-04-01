'use strict';

const assert = require('assert');
const { loadExtensionInternals } = require('./load-formatter');

const { formatSQL, findSQLRanges } = loadExtensionInternals();

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
            '    WHEN score > 90 THEN \'A\'',
            '    WHEN score > 80 THEN \'B\'',
            '    ELSE \'C\'',
            'END AS grade',
            'FROM exams',
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

function main() {
    runFormatCases();
    runRangeCases();
    console.log(`Passed ${formatCases.length + rangeCases.length} tests.`);
}

main();
