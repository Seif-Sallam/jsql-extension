'use strict';

const assert = require('assert');
const { loadExtensionInternals } = require('./load-formatter');

const {
    formatSQL,
    findSQLRanges,
    buildFormattedSQLBlock,
    createEmptySchemaMetadata,
    isWorkspaceRelativeGlobPattern,
    mergeSchemaMetadata,
    parseTableDefinitionFile,
    findSemanticEntityRanges,
    findSemanticWarnings,
    detectMissingSelectCommas,
    findMatchingBracket,
    findUnmatchedBrackets
} = loadExtensionInternals();

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
        name: 'expands SELECT lists with exactly two columns',
        input: 'select a, b from metrics',
        expected: [
            'SELECT',
            '    a,',
            '    b',
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
        name: 'expands multi-row INSERT VALUES onto separate lines',
        input: "insert into t (a, b) values (1, 'x'), (2, 'y'), (3, 'z')",
        expected: [
            'INSERT INTO t (a, b)',
            'VALUES',
            "    (1, \"x\"),",
            "    (2, \"y\"),",
            "    (3, \"z\")",
        ].join('\n'),
    },
    {
        name: 'keeps GROUP BY, HAVING, and ORDER BY as distinct clauses in SQL order',
        input: 'select team, count(*) from matches group by team having count(*) > 1 order by count(*) desc',
        expected: [
            'SELECT',
            '    team,',
            '    count(*)',
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
        expectedDialect: 'sql',
    },
    {
        name: 'detects --bq dialect hint',
        input: [
            'query = """--bq',
            'SELECT ARRAY_AGG(id) FROM t',
            '"""',
        ].join('\n'),
        expectedCount: 1,
        expectedDialect: 'bq',
    },
    {
        name: 'detects --spanner dialect hint as bq',
        input: [
            'query = """--spanner',
            'SELECT ARRAY_AGG(id) FROM t',
            '"""',
        ].join('\n'),
        expectedCount: 1,
        expectedDialect: 'bq',
    },
    {
        name: 'treats --sql hint as default sql dialect',
        input: [
            'query = """--sql',
            'SELECT id FROM users',
            '"""',
        ].join('\n'),
        expectedCount: 1,
        expectedDialect: 'sql',
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

const blockFormatCases = [
    {
        name: 'keeps the closing triple quote attached to the final SQL line',
        input: [
            "query = '''",
            '                         SELECT starting_date',
            '                         FROM user_contract uc',
            '                         WHERE uc.id_user = :id_user',
            "                         AND uc.is_active = 1'''",
        ].join('\n'),
        expected: [
            "query = '''",
            '                         SELECT starting_date',
            '                         FROM user_contract uc',
            '                         WHERE uc.id_user = :id_user',
            "                             AND uc.is_active = 1'''",
        ].join('\n'),
    },
    {
        name: 'moves a standalone closing triple quote onto the final SQL line and keeps trailing args on the next line',
        input: [
            "query = '''",
            '        SELECT code, name',
            '        FROM offboarding_reason',
            '        WHERE category = :category',
            '            AND is_active = 1',
            "            ''', category=category",
        ].join('\n'),
        expected: [
            "query = '''",
            '        SELECT',
            '            code,',
            '            name',
            '        FROM offboarding_reason',
            '        WHERE category = :category',
            "            AND is_active = 1''',",
            '    category=category',
        ].join('\n'),
    },
    {
        name: 'uses the surrounding Python indentation for trailing args moved below the closing triple quote',
        input: [
            "    result = run_query('''",
            '            SELECT id',
            '            FROM users',
            "            ''', account_id=account_id)",
        ].join('\n'),
        expected: [
            "    result = run_query('''",
            '            SELECT id',
            "            FROM users''',",
            '        account_id=account_id)',
        ].join('\n'),
    },
    {
        name: 'uses triple single quotes outside while normalizing SQL string quotes to double quotes inside',
        input: [
            'query = """',
            "    SELECT 'active' AS status",
            '    FROM users',
            '"""',
        ].join('\n'),
        expected: [
            "query = '''",
            '    SELECT "active" AS status',
            "    FROM users'''",
        ].join('\n'),
    },
];

const schemaMetadataCases = [
    {
        name: 'parses table names and sqlalchemy columns from model files',
        input: [
            'class UserTaskStep(Model):',
            "    __tablename__ = 'user_task_step'",
            '    id_user_task_step = sa.Column(INT, primary_key=True)',
            '    id_user_task = sa.Column(INT, nullable=False)',
            '    id_task_step_type = sa.Column(INT, nullable=False)',
            '    order_ix = sa.Column(INT, nullable=False)',
            "    id_status = sa.Column(SMALLINT, nullable=False, server_default='1')",
            '    response = sa.Column(types.JSON, nullable=True)',
            "    created_at = sa.Column(types.TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'), nullable=False)",
            '    tasks = relationship("Task")',
        ].join('\n'),
        expectedTables: ['user_task_step'],
        expectedColumns: ['created_at', 'id_status', 'id_task_step_type', 'id_user_task', 'id_user_task_step', 'order_ix', 'response'],
    },
];

const semanticHighlightCases = [
    {
        name: 'highlights heuristic table references even without loaded metadata',
        input: [
            'SELECT a.id_user, u.email',
            'FROM account a',
            'JOIN user u ON u.id_user = a.id_user',
        ].join('\n'),
        metadata: createEmptySchemaMetadata(),
        expectedTables: ['account', 'user'],
        expectedColumns: [],
    },
    {
        name: 'detects CTE with optional column list as a table',
        input: [
            'WITH jobs(ref) AS (VALUES ROW(1))',
            'SELECT ref FROM jobs',
        ].join('\n'),
        metadata: createEmptySchemaMetadata(),
        expectedTables: ['jobs'],
        expectedColumns: [],
    },
    {
        name: 'highlights loaded table and column names separately',
        metadataFiles: [[
            'class UserTaskStep(Model):',
            "    __tablename__ = 'user_task_step'",
            '    id_user_task_step = sa.Column(INT, primary_key=True)',
            '    id_user_task = sa.Column(INT, nullable=False)',
            '    response = sa.Column(types.JSON, nullable=True)',
            '    id_status = sa.Column(SMALLINT, nullable=False)',
        ].join('\n'), [
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
            '    name = sa.Column(VARCHAR(255), nullable=False)',
        ].join('\n')],
        input: [
            'SELECT uts.id_user_task_step, uts.response, ut.name',
            'FROM user_task_step uts',
            'JOIN user_task ut ON ut.id_user_task = uts.id_user_task',
            'WHERE uts.id_status = 1',
        ].join('\n'),
        expectedTables: ['user_task', 'user_task_step'],
        expectedColumns: ['id_status', 'id_user_task', 'id_user_task_step', 'name', 'response'],
    },
];

const workspacePatternCases = [
    { name: 'accepts workspace-relative globstar patterns', input: '**/tables.py', expected: true },
    { name: 'accepts nested relative paths', input: 'backend/models/*.py', expected: true },
    { name: 'rejects absolute unix paths', input: '/Users/me/project/tables.py', expected: false },
    { name: 'rejects home-expanded paths', input: '~/project/tables.py', expected: false },
    { name: 'rejects parent directory traversal', input: '../shared/tables.py', expected: false },
];

const semanticWarningCases = [
    {
        name: 'warns on unknown table names using loaded metadata',
        metadataFiles: [[
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
            '    name = sa.Column(VARCHAR(255), nullable=False)',
        ].join('\n')],
        input: [
            'SELECT ut.id_user_task',
            'FROM user_taks ut',
        ].join('\n'),
        expectedMessages: ['Unknown table "user_taks" — did you mean user_task?'],
    },
    {
        name: 'warns on unknown qualified columns for known aliases',
        metadataFiles: [[
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
            '    name = sa.Column(VARCHAR(255), nullable=False)',
        ].join('\n')],
        input: [
            'SELECT ut.id_user',
            'FROM user_task ut',
        ].join('\n'),
        expectedMessages: ['Unknown column "id_user" on alias "ut" — did you mean id_user_task?'],
    },
    {
        name: 'warns on unknown aliases when no derived tables are present',
        metadataFiles: [[
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
            '    name = sa.Column(VARCHAR(255), nullable=False)',
        ].join('\n')],
        input: [
            'SELECT ux.id_user_task',
            'FROM user_task ut',
        ].join('\n'),
        expectedMessages: ['Unknown table or alias "ux" — did you mean ut?'],
    },
    {
        name: 'does not warn on cte-qualified columns without known cte metadata',
        metadataFiles: [[
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
        ].join('\n')],
        input: [
            'WITH latest AS (',
            '    SELECT id_user_task',
            '    FROM user_task',
            ')',
            'SELECT latest.id_user_task',
            'FROM latest',
        ].join('\n'),
        expectedMessages: [],
    },
    {
        name: 'does not warn on unresolved qualifiers when derived tables are present',
        metadataFiles: [[
            'class UserTask(Model):',
            "    __tablename__ = 'user_task'",
            '    id_user_task = sa.Column(INT, primary_key=True)',
        ].join('\n')],
        input: [
            'SELECT x.id_user_task',
            'FROM (SELECT id_user_task FROM user_task) x',
        ].join('\n'),
        expectedMessages: [],
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
    // Subquery nesting — multi-line subquery columns
    {
        name: 'warns when multi-line subquery column is missing trailing comma',
        input: [
            'SELECT',
            '    (',
            '        SELECT MAX(id)',
            '        FROM inner_t',
            '    ) AS max_id',
            '    col2',
            'FROM outer_t',
        ].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'does not warn when multi-line subquery column has trailing comma',
        input: [
            'SELECT',
            '    (',
            '        SELECT MAX(id)',
            '        FROM inner_t',
            '    ) AS max_id,',
            '    col2',
            'FROM outer_t',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'warns when a nested subquery returns to an outer SELECT item that is missing a trailing comma',
        input: [
            'SELECT',
            '    (',
            '        SELECT',
            '            (',
            '                SELECT MAX(id)',
            '                FROM deepest_t',
            '            ) AS nested_value,',
            '            middle_value',
            '        FROM middle_t',
            '    ) AS subquery_result',
            '    outer_value',
            'FROM outer_t',
        ].join('\n'),
        expectedCount: 1,
    },
    // CASE depth — nested CASE expressions
    {
        name: 'does not warn for nested CASE expressions with correct commas',
        input: [
            'SELECT',
            '    CASE',
            '        WHEN x = 1 THEN',
            '            CASE',
            '                WHEN y = 1 THEN "a"',
            '                ELSE "b"',
            '            END',
            '        ELSE "c"',
            '    END AS result,',
            '    col2',
            'FROM t',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'warns for missing comma after nested CASE expression',
        input: [
            'SELECT',
            '    CASE',
            '        WHEN x = 1 THEN',
            '            CASE',
            '                WHEN y = 1 THEN "a"',
            '                ELSE "b"',
            '            END',
            '        ELSE "c"',
            '    END AS result',
            '    col2',
            'FROM t',
        ].join('\n'),
        expectedCount: 1,
    },
    // CTE / WITH cases
    {
        name: 'warns on missing comma inside CTE inner SELECT',
        input: [
            'WITH cte AS (',
            '    SELECT',
            '        col1',
            '        col2',
            '    FROM t',
            ')',
            'SELECT * FROM cte',
        ].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'does not warn inside CTE when commas are present',
        input: [
            'WITH cte AS (',
            '    SELECT',
            '        col1,',
            '        col2',
            '    FROM t',
            ')',
            'SELECT * FROM cte',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'warns on missing comma in outer SELECT after CTE',
        input: [
            'WITH cte AS (SELECT id FROM t)',
            'SELECT',
            '    col1',
            '    col2',
            'FROM cte',
        ].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'warns on missing comma when column contains a subquery with FROM',
        input: [
            'SELECT',
            '    (SELECT MAX(id) FROM users) AS max_id',
            '    name',
            'FROM accounts',
        ].join('\n'),
        expectedCount: 1,
    },
    // Literal column values
    {
        name: 'warns on missing comma after number literal column',
        input: ['SELECT', '    1', '    name', 'FROM t'].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'warns on missing comma after string literal column',
        input: ['SELECT', "    'active'", '    name', 'FROM t'].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'does not warn when literal columns have commas',
        input: ['SELECT', "    1,", "    'active',", '    name', 'FROM t'].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn when subquery column has a trailing comma',
        input: [
            'SELECT',
            '    (SELECT MAX(id) FROM users) AS max_id,',
            '    name',
            'FROM accounts',
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

const { detectDuplicateAliases } = loadExtensionInternals();

const { detectAmbiguousColumns } = loadExtensionInternals();

const ambiguousColumnCases = [
    {
        name: 'flags unqualified column that exists in two joined tables',
        metadataFiles: [[
            "class UserContract(Model):\n    __tablename__ = 'user_contract'\n    id_user = sa.Column(INT)\n    created_at = sa.Column(TIMESTAMP)",
        ].join('\n'), [
            "class Task(Model):\n    __tablename__ = 'task'\n    id_user = sa.Column(INT)\n    name = sa.Column(VARCHAR(255))",
        ].join('\n')],
        input: [
            'SELECT id_user, name',
            'FROM user_contract uc',
            'JOIN task t ON t.id_user = uc.id_user',
        ].join('\n'),
        expectedCount: 1, // id_user is ambiguous; the qualified ones (uc.id_user, t.id_user) are fine
    },
    {
        name: 'does not flag qualified column references',
        metadataFiles: [[
            "class UserContract(Model):\n    __tablename__ = 'user_contract'\n    id_user = sa.Column(INT)",
        ].join('\n'), [
            "class Task(Model):\n    __tablename__ = 'task'\n    id_user = sa.Column(INT)",
        ].join('\n')],
        input: [
            'SELECT uc.id_user, t.id_user',
            'FROM user_contract uc',
            'JOIN task t ON t.id_user = uc.id_user',
        ].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not flag column that only exists in one table',
        metadataFiles: [[
            "class UserContract(Model):\n    __tablename__ = 'user_contract'\n    id_user = sa.Column(INT)\n    created_at = sa.Column(TIMESTAMP)",
        ].join('\n'), [
            "class Task(Model):\n    __tablename__ = 'task'\n    id_user = sa.Column(INT)\n    name = sa.Column(VARCHAR(255))",
        ].join('\n')],
        input: 'SELECT created_at FROM user_contract',
        expectedCount: 0,
    },
];

const duplicateAliasCases = [
    {
        name: 'warns on duplicate AS alias in SELECT',
        input: ['SELECT', '    a AS x,', '    b AS x', 'FROM t'].join('\n'),
        expectedCount: 1,
    },
    {
        name: 'does not warn when aliases are unique',
        input: ['SELECT', '    a AS x,', '    b AS y', 'FROM t'].join('\n'),
        expectedCount: 0,
    },
    {
        name: 'does not warn for same alias in separate SELECT blocks',
        input: [
            'WITH cte AS (SELECT a AS x FROM t1)',
            'SELECT b AS x FROM t2',
        ].join('\n'),
        expectedCount: 0,
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
        const ranges = findSQLRanges(testCase.input);
        assert.strictEqual(
            ranges.length,
            testCase.expectedCount,
            `findSQLRanges failed: ${testCase.name}`
        );
        if (testCase.expectedDialect !== undefined && ranges.length > 0) {
            assert.strictEqual(
                ranges[0].dialect,
                testCase.expectedDialect,
                `findSQLRanges dialect failed: ${testCase.name}`
            );
        }
    }
}

function runBlockFormatCases() {
    for (const testCase of blockFormatCases) {
        const range = findSQLRanges(testCase.input)[0];
        assert.ok(range, `buildFormattedSQLBlock failed to find SQL range: ${testCase.name}`);

        const replacement = buildFormattedSQLBlock(testCase.input, range);
        const actual =
            testCase.input.slice(0, replacement.start) +
            replacement.formatted +
            testCase.input.slice(replacement.end);

        assert.strictEqual(
            actual,
            testCase.expected,
            `buildFormattedSQLBlock failed: ${testCase.name}`
        );
    }
}

function runSchemaMetadataCases() {
    for (const testCase of schemaMetadataCases) {
        const metadata = parseTableDefinitionFile(testCase.input);
        assert.strictEqual(
            JSON.stringify(Array.from(metadata.tables).sort()),
            JSON.stringify(testCase.expectedTables),
            `parseTableDefinitionFile tables failed: ${testCase.name}`
        );
        assert.strictEqual(
            JSON.stringify(Array.from(metadata.columns).sort()),
            JSON.stringify(testCase.expectedColumns),
            `parseTableDefinitionFile columns failed: ${testCase.name}`
        );
    }
}

function runSemanticHighlightCases() {
    for (const testCase of semanticHighlightCases) {
        const metadata = testCase.metadataFiles
            ? testCase.metadataFiles.reduce((acc, fileText) => {
                mergeSchemaMetadata(acc, parseTableDefinitionFile(fileText));
                return acc;
            }, createEmptySchemaMetadata())
            : testCase.metadata;

        const semanticRanges = findSemanticEntityRanges(testCase.input, metadata);
        const tables = Array.from(new Set(semanticRanges.tableRanges.map(range => testCase.input.slice(range.start, range.end)))).sort();
        const columns = Array.from(new Set(semanticRanges.columnRanges.map(range => testCase.input.slice(range.start, range.end)))).sort();

        assert.strictEqual(
            JSON.stringify(tables),
            JSON.stringify(testCase.expectedTables),
            `findSemanticEntityRanges tables failed: ${testCase.name}`
        );
        assert.strictEqual(
            JSON.stringify(columns),
            JSON.stringify(testCase.expectedColumns),
            `findSemanticEntityRanges columns failed: ${testCase.name}`
        );
    }
}

function runWorkspacePatternCases() {
    for (const testCase of workspacePatternCases) {
        assert.strictEqual(
            isWorkspaceRelativeGlobPattern(testCase.input),
            testCase.expected,
            `isWorkspaceRelativeGlobPattern failed: ${testCase.name}`
        );
    }
}

function runSemanticWarningCases() {
    for (const testCase of semanticWarningCases) {
        const metadata = testCase.metadataFiles.reduce((acc, fileText) => {
            mergeSchemaMetadata(acc, parseTableDefinitionFile(fileText));
            return acc;
        }, createEmptySchemaMetadata());

        const warnings = findSemanticWarnings(testCase.input, metadata).map(issue => issue.message);

        assert.strictEqual(
            JSON.stringify(warnings),
            JSON.stringify(testCase.expectedMessages),
            `findSemanticWarnings failed: ${testCase.name}`
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

function runAmbiguousColumnCases() {
    for (const testCase of ambiguousColumnCases) {
        const metadata = testCase.metadataFiles.reduce((acc, fileText) => {
            mergeSchemaMetadata(acc, parseTableDefinitionFile(fileText));
            return acc;
        }, createEmptySchemaMetadata());
        assert.strictEqual(
            detectAmbiguousColumns(testCase.input, metadata).length,
            testCase.expectedCount,
            `detectAmbiguousColumns failed: ${testCase.name}`
        );
    }
}

function runDuplicateAliasCases() {
    for (const testCase of duplicateAliasCases) {
        assert.strictEqual(
            detectDuplicateAliases(testCase.input).length,
            testCase.expectedCount,
            `detectDuplicateAliases failed: ${testCase.name}`
        );
    }
}

function main() {
    runFormatCases();
    runRangeCases();
    runBlockFormatCases();
    runSchemaMetadataCases();
    runSemanticHighlightCases();
    runWorkspacePatternCases();
    runSemanticWarningCases();
    runCommaWarningCases();
    runAmbiguousColumnCases();
    runDuplicateAliasCases();
    runBracketCases();
    runUnmatchedBracketCases();
    console.log(`Passed ${formatCases.length + rangeCases.length + blockFormatCases.length + schemaMetadataCases.length + semanticHighlightCases.length + workspacePatternCases.length + semanticWarningCases.length + commaWarningCases.length + ambiguousColumnCases.length + duplicateAliasCases.length + bracketCases.length + unmatchedBracketCases.length} tests.`);
}

main();
