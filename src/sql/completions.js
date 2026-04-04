'use strict';

const { ALL_SQL_KEYWORD_LIST, SQL_FUNCTIONS, SQL_KEYWORDS } = require('./shared');

const MIN_SQL_COMPLETION_PREFIX = 2;

function findSqlWordCompletions(prefix) {
    const normalizedPrefix = (prefix || '').trim().toUpperCase();
    if (normalizedPrefix.length < MIN_SQL_COMPLETION_PREFIX) return [];

    return ALL_SQL_KEYWORD_LIST
        .filter(label => label.startsWith(normalizedPrefix))
        .map(label => ({
            label,
            kind: SQL_FUNCTIONS.has(label)
                ? (SQL_KEYWORDS.has(label) ? 'mixed' : 'function')
                : 'keyword',
        }));
}

module.exports = {
    findSqlWordCompletions,
    MIN_SQL_COMPLETION_PREFIX,
};
