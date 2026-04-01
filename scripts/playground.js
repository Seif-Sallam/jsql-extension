'use strict';

const fs = require('fs');
const path = require('path');
const { loadExtensionInternals } = require('./load-formatter');

const { formatSQL } = loadExtensionInternals();

const FIXTURES = {
    union: 'select a from table_a union select b from table_b',
    'union-comments': [
        'select a from table_a',
        '-- before union',
        'union',
        '-- after union',
        'select b from table_b',
    ].join('\n'),
    select: 'select a, b, coalesce(c, 0), d from metrics where a = 1 and b = 2 and c = 3',
    cte: [
        'with users as (select id, email from app_users where active = true)',
        'select id, email from users',
    ].join('\n'),
    case: 'select case when score > 90 then \'A\' when score > 80 then \'B\' else \'C\' end as grade from exams',
};

function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

function printUsage() {
    console.log('Usage:');
    console.log('  npm run playground');
    console.log('  npm run playground -- --case union-comments');
    console.log('  npm run playground -- --file ./sample.sql');
    console.log('  cat sample.sql | npm run playground -- --stdin');
    console.log('');
    console.log('Available cases: ' + Object.keys(FIXTURES).join(', '));
}

function printCase(title, input) {
    console.log(`=== ${title} ===`);
    console.log('');
    console.log('-- input --');
    console.log(input);
    console.log('');
    console.log('-- output --');
    console.log(formatSQL(input));
    console.log('');
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        return;
    }

    if (args.includes('--stdin')) {
        const input = await readStdin();
        printCase('stdin', input.trim());
        return;
    }

    const caseIndex = args.indexOf('--case');
    if (caseIndex !== -1) {
        const caseName = args[caseIndex + 1];
        if (!caseName || !FIXTURES[caseName]) {
            throw new Error(`Unknown case "${caseName}".`);
        }
        printCase(`fixture:${caseName}`, FIXTURES[caseName]);
        return;
    }

    const fileIndex = args.indexOf('--file');
    if (fileIndex !== -1) {
        const fileArg = args[fileIndex + 1];
        if (!fileArg) throw new Error('Missing file path after --file.');
        const filePath = path.resolve(process.cwd(), fileArg);
        const input = fs.readFileSync(filePath, 'utf8');
        printCase(`file:${fileArg}`, input.trim());
        return;
    }

    for (const [name, input] of Object.entries(FIXTURES)) {
        printCase(`fixture:${name}`, input);
    }
}

main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
});
