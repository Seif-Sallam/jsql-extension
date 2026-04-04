'use strict';

const THEMES = {
    dracula: {
        identifier: { color: '#A0ACBE' },
        table: { color: '#F4C56E' },
        column: { color: '#82B1FF' },
        alias: { color: '#5DE3C0' },
        col_alias: { color: '#D4AAFF' },
        keyword: { color: '#6BB8C8', fontWeight: 'bold' },
        function: { color: '#FF79C6' },
        param: { color: '#FFB86C' },
        jinja: { color: '#BD93F9' },
        comment: { color: '#6272A4', fontStyle: 'italic' },
        number: { color: '#F1FA8C' },
        string: { color: '#50FA7B' },
        json_path: { color: '#E5C07B' },
        operator: { color: '#8BE9FD' },
        boolean: { color: '#FF8585', fontWeight: 'bold' },
    },
    monokai: {
        identifier: { color: '#B0B8C8' },
        table: { color: '#E07850' },
        column: { color: '#7EC8E3' },
        alias: { color: '#5BCFB5' },
        col_alias: { color: '#C9A0DC' },
        keyword: { color: '#F92672', fontWeight: 'bold' },
        function: { color: '#A6E22E' },
        param: { color: '#FD971F' },
        jinja: { color: '#AE81FF' },
        comment: { color: '#75715E', fontStyle: 'italic' },
        number: { color: '#AE81FF' },
        string: { color: '#E6DB74' },
        json_path: { color: '#FD971F' },
        operator: { color: '#F92672' },
        boolean: { color: '#66D9E8', fontWeight: 'bold' },
    },
    'one-dark': {
        identifier: { color: '#9DA5B4' },
        table: { color: '#4EC9B0' },
        column: { color: '#7ECAE9' },
        alias: { color: '#56D6AE' },
        col_alias: { color: '#C0A0E8' },
        keyword: { color: '#C678DD', fontWeight: 'bold' },
        function: { color: '#61AFEF' },
        param: { color: '#D19A66' },
        jinja: { color: '#56B6C2' },
        comment: { color: '#5C6370', fontStyle: 'italic' },
        number: { color: '#D19A66' },
        string: { color: '#98C379' },
        json_path: { color: '#E5C07B' },
        operator: { color: '#56B6C2' },
        boolean: { color: '#E06C75', fontWeight: 'bold' },
    },
};

function buildDecorations(vscode, themeName) {
    const colors = THEMES[themeName] || THEMES.dracula;
    return Object.fromEntries(
        Object.entries(colors).map(([key, style]) => [key, vscode.window.createTextEditorDecorationType(style)])
    );
}

function createBracketDecorations(vscode) {
    return {
        bracketDec: vscode.window.createTextEditorDecorationType({
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editorBracketMatch.border'),
            backgroundColor: new vscode.ThemeColor('editorBracketMatch.background'),
            borderRadius: '2px',
            overviewRulerColor: new vscode.ThemeColor('editorBracketMatch.border'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        }),
        bracketErrorDec: vscode.window.createTextEditorDecorationType({
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editorError.foreground'),
            backgroundColor: 'rgba(255, 0, 0, 0.18)',
            borderRadius: '2px',
            overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        }),
    };
}

module.exports = {
    THEMES,
    buildDecorations,
    createBracketDecorations,
};
