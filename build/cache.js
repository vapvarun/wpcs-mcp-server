/**
 * WPCS MCP Server - File Hash Cache
 * Provides incremental checking by caching results keyed by file hash + checker.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const CACHE_VERSION = '2.0.0';
const CACHE_FILE_NAME = '.wpcs-cache.json';
export class FileCache {
    store;
    cachePath;
    dirty = false;
    constructor(projectPath) {
        this.cachePath = join(projectPath, CACHE_FILE_NAME);
        this.store = this.load();
    }
    load() {
        if (!existsSync(this.cachePath)) {
            return { version: CACHE_VERSION, entries: {} };
        }
        try {
            const raw = readFileSync(this.cachePath, 'utf-8');
            const data = JSON.parse(raw);
            if (data.version !== CACHE_VERSION) {
                return { version: CACHE_VERSION, entries: {} };
            }
            return data;
        }
        catch {
            return { version: CACHE_VERSION, entries: {} };
        }
    }
    /**
     * Compute an MD5 hash of a file's contents.
     */
    hashFile(filePath) {
        try {
            const content = readFileSync(filePath);
            return createHash('md5').update(content).digest('hex');
        }
        catch {
            return '';
        }
    }
    /**
     * Build a cache key from file path, checker name, and config hash.
     */
    buildKey(filePath, checkerName, configHash) {
        return `${filePath}:${checkerName}:${configHash}`;
    }
    /**
     * Check if a file has changed since last check.
     * Returns the cached results if unchanged, or null if the file needs re-checking.
     */
    get(filePath, checkerName, configHash) {
        const key = this.buildKey(filePath, checkerName, configHash);
        const entry = this.store.entries[key];
        if (!entry)
            return null;
        const currentHash = this.hashFile(filePath);
        if (currentHash === entry.hash) {
            return entry.results;
        }
        return null;
    }
    /**
     * Store results for a file + checker combination.
     */
    set(filePath, checkerName, configHash, results) {
        const key = this.buildKey(filePath, checkerName, configHash);
        const hash = this.hashFile(filePath);
        this.store.entries[key] = {
            hash,
            timestamp: Date.now(),
            results,
        };
        this.dirty = true;
    }
    /**
     * Persist the cache to disk.
     */
    save() {
        if (!this.dirty)
            return;
        try {
            writeFileSync(this.cachePath, JSON.stringify(this.store, null, 2));
            this.dirty = false;
        }
        catch {
            // Ignore write errors (read-only fs, permissions, etc.)
        }
    }
    /**
     * Clear all cached entries.
     */
    clear() {
        this.store.entries = {};
        this.dirty = true;
    }
    /**
     * Hash the config object to detect config changes.
     */
    static hashConfig(config) {
        return createHash('md5').update(JSON.stringify(config)).digest('hex');
    }
}
//# sourceMappingURL=cache.js.map