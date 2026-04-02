'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadExtensionInternals() {
    const extensionPath = path.resolve(__dirname, '..', 'extension.js');
    const code = fs.readFileSync(extensionPath, 'utf8');
    const sandbox = {
        module: { exports: {} },
        exports: {},
        require: (name) => {
            if (name === 'vscode') return {};
            return require(name);
        },
        console,
    };

    vm.runInNewContext(
        `${code}\nmodule.exports.__test = { formatSQL, findSQLRanges, buildFormattedSQLBlock, createEmptySchemaMetadata, isWorkspaceRelativeGlobPattern, findClosestName, mergeSchemaMetadata, parseTableDefinitionFile, findSemanticEntityRanges, findSemanticWarnings, detectUnionCommentAdjacency, detectMissingSelectCommas, findMatchingBracket, findUnmatchedBrackets };`,
        sandbox,
        { filename: extensionPath }
    );

    return sandbox.module.exports.__test;
}

module.exports = { loadExtensionInternals };
