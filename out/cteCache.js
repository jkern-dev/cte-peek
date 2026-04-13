"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedCtes = getCachedCtes;
exports.clearCache = clearCache;
exports.disposeCache = disposeCache;
const cteParser_1 = require("./cteParser");
const cache = new Map();
function getCachedCtes(document) {
    const key = document.uri.toString();
    const entry = cache.get(key);
    if (entry && entry.version === document.version) {
        return entry.result;
    }
    const result = (0, cteParser_1.parseCtes)(document.getText());
    cache.set(key, { version: document.version, result });
    return result;
}
function clearCache(uri) {
    cache.delete(uri.toString());
}
function disposeCache() {
    cache.clear();
}
//# sourceMappingURL=cteCache.js.map