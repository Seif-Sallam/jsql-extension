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
        `${code}\nmodule.exports.__test = { formatSQL, findSQLRanges, detectUnionCommentAdjacency, detectMissingSelectCommas };`,
        sandbox,
        { filename: extensionPath }
    );

    return sandbox.module.exports.__test;
}

module.exports = { loadExtensionInternals };
