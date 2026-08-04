'use strict';

const { buildOpaqueMask } = require('./shared');

// A named bind param like :id_user. The negative lookbehind avoids ::type casts
// and matching inside a longer identifier; a leading letter/underscore skips
// time literals such as :30.
const BIND_PARAM_RE = /(?<![:\w]):([A-Za-z_]\w*)/g;

// Returns the unique :param names in source order, skipping any that fall inside
// strings, comments, or Jinja tags (per buildOpaqueMask).
function extractBindParams(sql) {
    const opaque = buildOpaqueMask(sql);
    const names = [];
    const seen = new Set();
    BIND_PARAM_RE.lastIndex = 0;
    let m;
    while ((m = BIND_PARAM_RE.exec(sql)) !== null) {
        if (opaque[m.index]) continue;
        const name = m[1];
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}

function isListParam(name) {
    return name.endsWith('_list');
}

// Parse a user-typed value into a JS value for the Jinja/render context: JSON
// when it parses (numbers, true/false/null, arrays, objects, quoted strings),
// otherwise the raw string.
function parseParamValue(raw) {
    if (typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (trimmed === '') return '';
    try {
        return JSON.parse(trimmed);
    } catch {
        return raw;
    }
}

// Merges discovered Jinja variables and bind params into a single ordered list
// (Jinja first), tagging each with how it is used. A name that is both a Jinja
// variable and a bind param carries both flags.
function buildParamItems(jinjaVars, bindParams) {
    const byName = new Map();
    const order = [];
    const ensure = name => {
        let it = byName.get(name);
        if (!it) {
            it = { name, isList: false, isJinja: false, isBind: false };
            byName.set(name, it);
            order.push(it);
        }
        return it;
    };
    for (const name of jinjaVars || []) ensure(name).isJinja = true;
    for (const name of bindParams || []) {
        const it = ensure(name);
        it.isBind = true;
        if (isListParam(name)) it.isList = true;
    }
    return order;
}

// Splits the prompted values into the two payloads the render helper needs:
//   context — typed values for Jinja rendering + list expansion. Unfilled Jinja
//             variables become null so `{% if x %}` evaluates falsy.
//   raw     — verbatim strings for filled scalar bind params, inserted as-is.
// Unfilled bind params are simply omitted, so they stay as `:name` in the output.
// items: [{ name, isList, isJinja, isBind }]; values: { name: rawString }.
function buildRenderPayload(template, items, values) {
    const context = {};
    const raw = {};
    for (const it of items) {
        const rawStr = values && values[it.name] != null ? String(values[it.name]) : '';
        const filled = rawStr.trim() !== '';
        if (filled) {
            context[it.name] = parseParamValue(rawStr);
            if (it.isBind && !it.isList) raw[it.name] = rawStr;
        } else if (it.isJinja) {
            context[it.name] = null;
        }
    }
    return { template, context, raw };
}

module.exports = { extractBindParams, isListParam, parseParamValue, buildParamItems, buildRenderPayload };
