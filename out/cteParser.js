"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCtes = parseCtes;
function buildLineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            offsets.push(i + 1);
        }
    }
    return offsets;
}
function offsetToLine(lineOffsets, offset) {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineOffsets[mid] <= offset) {
            lo = mid;
        }
        else {
            hi = mid - 1;
        }
    }
    return lo;
}
function isWordChar(ch) {
    if (!ch)
        return false;
    return /[a-zA-Z0-9_]/.test(ch);
}
function skipWhitespaceAndComments(text, i, len) {
    while (i < len) {
        const ch = text[i];
        // Whitespace
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }
        // Single-line comment
        if (ch === '-' && i + 1 < len && text[i + 1] === '-') {
            i += 2;
            while (i < len && text[i] !== '\n')
                i++;
            if (i < len)
                i++; // skip the \n
            continue;
        }
        // Block comment
        if (ch === '/' && i + 1 < len && text[i + 1] === '*') {
            i += 2;
            while (i + 1 < len && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            if (i + 1 < len)
                i += 2; // skip */
            continue;
        }
        break;
    }
    return i;
}
function matchesKeyword(text, i, keyword) {
    const len = text.length;
    const kLen = keyword.length;
    if (i + kLen > len)
        return false;
    for (let j = 0; j < kLen; j++) {
        if (text[i + j].toUpperCase() !== keyword[j].toUpperCase())
            return false;
    }
    // Check word boundaries
    if (i > 0 && isWordChar(text[i - 1]))
        return false;
    if (i + kLen < len && isWordChar(text[i + kLen]))
        return false;
    return true;
}
function skipStringLiteral(text, i, len) {
    // i is at the opening quote '
    i++; // skip opening '
    while (i < len) {
        if (text[i] === '\'') {
            if (i + 1 < len && text[i + 1] === '\'') {
                i += 2; // escaped ''
            }
            else {
                i++; // closing '
                return i;
            }
        }
        else {
            i++;
        }
    }
    return i;
}
function readIdentifier(text, i, len) {
    if (i >= len)
        return null;
    // Double-quoted identifier
    if (text[i] === '"') {
        const start = i + 1;
        i++;
        while (i < len && text[i] !== '"')
            i++;
        const name = text.substring(start, i);
        if (i < len)
            i++; // skip closing "
        return name.length > 0 ? { name, end: i } : null;
    }
    // Unquoted identifier
    if (/[a-zA-Z_]/.test(text[i])) {
        const start = i;
        while (i < len && isWordChar(text[i]))
            i++;
        return { name: text.substring(start, i), end: i };
    }
    return null;
}
function findTopLevelWith(text, len) {
    let i = 0;
    while (i < len) {
        const ch = text[i];
        // Skip string literals
        if (ch === '\'') {
            i = skipStringLiteral(text, i, len);
            continue;
        }
        // Skip single-line comments
        if (ch === '-' && i + 1 < len && text[i + 1] === '-') {
            i += 2;
            while (i < len && text[i] !== '\n')
                i++;
            if (i < len)
                i++;
            continue;
        }
        // Skip block comments
        if (ch === '/' && i + 1 < len && text[i + 1] === '*') {
            i += 2;
            while (i + 1 < len && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            if (i + 1 < len)
                i += 2;
            continue;
        }
        // Check for WITH keyword
        if (matchesKeyword(text, i, 'WITH')) {
            return i;
        }
        i++;
    }
    return -1;
}
function extractCteBody(text, i, len) {
    // i should be at '('
    if (i >= len || text[i] !== '(')
        return null;
    const bodyStart = i;
    i++; // skip opening (
    let depth = 1;
    while (i < len && depth > 0) {
        const ch = text[i];
        if (ch === '\'') {
            i = skipStringLiteral(text, i, len);
            continue;
        }
        if (ch === '-' && i + 1 < len && text[i + 1] === '-') {
            i += 2;
            while (i < len && text[i] !== '\n')
                i++;
            if (i < len)
                i++;
            continue;
        }
        if (ch === '/' && i + 1 < len && text[i + 1] === '*') {
            i += 2;
            while (i + 1 < len && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            if (i + 1 < len)
                i += 2;
            continue;
        }
        if (ch === '(') {
            depth++;
            i++;
            continue;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0) {
                const body = text.substring(bodyStart + 1, i).trim();
                return { body, end: i };
            }
            i++;
            continue;
        }
        i++;
    }
    return null;
}
function parseCtes(text) {
    const result = { ctes: new Map(), cteList: [] };
    const len = text.length;
    const lineOffsets = buildLineOffsets(text);
    // Find the WITH keyword
    const withPos = findTopLevelWith(text, len);
    if (withPos === -1)
        return result;
    let i = withPos + 4; // skip "WITH"
    // Check for RECURSIVE
    let j = skipWhitespaceAndComments(text, i, len);
    if (matchesKeyword(text, j, 'RECURSIVE')) {
        i = j + 9;
    }
    // Parse CTE definitions
    while (i < len) {
        // Expect alias
        i = skipWhitespaceAndComments(text, i, len);
        const aliasStart = i;
        const ident = readIdentifier(text, i, len);
        if (!ident)
            break;
        i = ident.end;
        // Expect AS
        i = skipWhitespaceAndComments(text, i, len);
        if (!matchesKeyword(text, i, 'AS'))
            break;
        i += 2;
        // Expect (
        i = skipWhitespaceAndComments(text, i, len);
        const bodyResult = extractCteBody(text, i, len);
        if (!bodyResult)
            break;
        const cteDef = {
            name: ident.name,
            nameLower: ident.name.toLowerCase(),
            body: bodyResult.body,
            nameOffset: aliasStart,
            bodyStartOffset: i,
            bodyEndOffset: bodyResult.end,
            startLine: offsetToLine(lineOffsets, aliasStart),
            endLine: offsetToLine(lineOffsets, bodyResult.end),
        };
        result.ctes.set(cteDef.nameLower, cteDef);
        result.cteList.push(cteDef);
        i = bodyResult.end + 1; // skip closing )
        // Check for comma (next CTE) or end
        i = skipWhitespaceAndComments(text, i, len);
        if (i < len && text[i] === ',') {
            i++;
            continue;
        }
        break;
    }
    return result;
}
//# sourceMappingURL=cteParser.js.map