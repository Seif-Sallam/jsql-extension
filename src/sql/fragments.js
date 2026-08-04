'use strict';

// Helpers for queries that are spliced together in Python from SQL fragment
// variables, e.g.  '''SELECT ...''' + CATEGORY_ENTITY_JOINS + '''WHERE ...'''.
// findSQLRanges (formatter.js) groups the spliced segments; these helpers turn a
// group back into one logical query, resolving each fragment to its assigned SQL
// where possible and otherwise leaving a {{ NAME }} placeholder for the render
// pipeline to treat as an unfilled Jinja variable.

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Best-effort lookup of a module-level assignment  NAME = <string literal>  in
// the surrounding file. Supports ''' """ ' " with an optional r/b prefix.
// f-strings and any non-literal value are deliberately not matched (returns null)
// so dynamic fragments fall back to a placeholder.
function resolveFragment(text, name) {
    const re = new RegExp(
        '(?:^|\\n)[ \\t]*' + escapeRegExp(name) + '[ \\t]*=[ \\t]*[rbRB]{0,2}(\'\'\'|"""|\'|")'
    );
    const m = re.exec(text);
    if (!m) return null;
    const quote = m[1];
    const contentStart = m.index + m[0].length;
    const end = text.indexOf(quote, contentStart);
    if (end === -1) return null;
    return text.slice(contentStart, end);
}

// Finds the module(s) a name could be imported from, for fragments defined in
// another file. Scans `from <module> import ...` statements (single-line,
// parenthesized, and backslash-continued) and returns candidates as
// { module, sourceName } — sourceName is the name in the source module, which
// differs from `name` under `import X as name`. `import *` yields a candidate
// with sourceName === name (the source module is searched for `name` directly).
// `module` keeps any leading dots so relative imports can be resolved by the
// caller. Plain `import x` / `import x as y` is intentionally ignored: such
// fragments are referenced as `x.NAME`, not bare `NAME`, so they are not seams.
function findFragmentImportModule(text, name) {
    const candidates = [];
    const re = /(?:^|\n)[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const module = m[1];
        let i = m.index + m[0].length;
        let clause;
        if (text[i] === '(') {
            const close = text.indexOf(')', i);
            clause = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
        } else {
            let end = i;
            while (end < text.length) {
                const nl = text.indexOf('\n', end);
                if (nl === -1) { end = text.length; break; }
                if (text[nl - 1] === '\\') { end = nl + 1; continue; }
                end = nl; break;
            }
            clause = text.slice(i, end);
        }
        for (let piece of clause.split(',')) {
            piece = piece.trim();
            if (!piece) continue;
            if (piece === '*') { candidates.push({ module, sourceName: name }); continue; }
            const asM = /^([A-Za-z_]\w*)(?:[ \t]+as[ \t]+([A-Za-z_]\w*))?$/.exec(piece);
            if (!asM) continue;
            const bound = asM[2] || asM[1];
            if (bound === name) candidates.push({ module, sourceName: asM[1] });
        }
    }
    return candidates;
}

// Rebuilds the whole query from a findSQLRanges group: each segment's SQL text,
// with the spliced fragment between segments replaced by its resolved SQL (via
// `resolve(name)`) or a {{ name }} placeholder when unresolved.
function buildStitchedTemplate(text, group, resolve) {
    const segments = group.segments || [];
    const seams = group.seams || [];
    const parts = [];
    for (let i = 0; i < segments.length; i++) {
        parts.push(text.slice(segments[i].start, segments[i].end));
        if (i < seams.length) {
            const name = seams[i].name;
            const resolved = resolve ? resolve(name) : null;
            parts.push(resolved != null ? resolved : '{{ ' + name + ' }}');
        }
    }
    return parts.join('');
}

// Builds a single logical view of a spliced query for schema-aware analysis
// (alias maps, table/column references, hover, go-to-definition). The returned
// `content` is the whole query as one string — segment SQL with each fragment
// inlined (resolved SQL) or a {{ name }} placeholder — so analysis sees the
// FROM/JOIN that define aliases even when they live in a different segment than
// the references. `spans` records where each real segment landed in `content`,
// and the map helpers translate offsets between the virtual content and the
// real document. Offsets that fall inside an inlined/placeholder fragment have
// no real position (they belong to a Python variable elsewhere) and map to -1.
function buildStitchedView(text, group, resolve) {
    const segments = group.segments || [];
    const seams = group.seams || [];
    const spans = [];
    let content = '';
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const vStart = content.length;
        content += text.slice(seg.start, seg.end);
        spans.push({ vStart, vEnd: content.length, rStart: seg.start });
        if (i < seams.length) {
            const name = seams[i].name;
            const resolved = resolve ? resolve(name) : null;
            content += resolved != null ? resolved : '{{ ' + name + ' }}';
        }
    }

    function toRealOffset(vOffset) {
        for (const s of spans) {
            if (vOffset >= s.vStart && vOffset <= s.vEnd) return s.rStart + (vOffset - s.vStart);
        }
        return -1;
    }

    function toReal(vStart, vEnd) {
        for (const s of spans) {
            if (vStart >= s.vStart && vEnd <= s.vEnd) {
                return { start: s.rStart + (vStart - s.vStart), end: s.rStart + (vEnd - s.vStart) };
            }
        }
        return null; // spans a segment boundary or lands inside a fragment
    }

    function toVirtual(rOffset) {
        for (const s of spans) {
            const rEnd = s.rStart + (s.vEnd - s.vStart);
            if (rOffset >= s.rStart && rOffset <= rEnd) return s.vStart + (rOffset - s.rStart);
        }
        return -1;
    }

    return { content, spans, toRealOffset, toReal, toVirtual };
}

module.exports = { resolveFragment, findFragmentImportModule, buildStitchedTemplate, buildStitchedView };
