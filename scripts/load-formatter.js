'use strict';

const formatter = require('../src/sql/formatter');
const metadata = require('../src/schema/metadata');
const completions = require('../src/sql/completions');
const semantic = require('../src/sql/semantic');
const diagnostics = require('../src/sql/diagnostics');

function loadExtensionInternals() {
    return {
        buildFormattedSQLBlock: formatter.buildFormattedSQLBlock,
        createEmptySchemaMetadata: metadata.createEmptySchemaMetadata,
        detectAmbiguousColumns: diagnostics.detectAmbiguousColumns,
        detectDuplicateAliases: diagnostics.detectDuplicateAliases,
        detectMissingSelectCommas: diagnostics.detectMissingSelectCommas,
        detectUnionCommentAdjacency: formatter.detectUnionCommentAdjacency,
        findSqlWordCompletionContext: completions.findSqlWordCompletionContext,
        findTableNameCompletionContext: completions.findTableNameCompletionContext,
        findTableNameCompletions: completions.findTableNameCompletions,
        findSqlWordCompletions: completions.findSqlWordCompletions,
        findClosestName: metadata.findClosestName,
        findMatchingBracket: formatter.findMatchingBracket,
        findSemanticEntityRanges: semantic.findSemanticEntityRanges,
        findSemanticWarnings: semantic.findSemanticWarnings,
        findSQLRanges: formatter.findSQLRanges,
        findUnmatchedBrackets: formatter.findUnmatchedBrackets,
        formatSQL: formatter.formatSQL,
        isWorkspaceRelativeGlobPattern: metadata.isWorkspaceRelativeGlobPattern,
        mergeSchemaMetadata: metadata.mergeSchemaMetadata,
        parseTableDefinitionFile: metadata.parseTableDefinitionFile,
    };
}

module.exports = { loadExtensionInternals };
