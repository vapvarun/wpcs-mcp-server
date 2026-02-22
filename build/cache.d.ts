/**
 * WPCS MCP Server - File Hash Cache
 * Provides incremental checking by caching results keyed by file hash + checker.
 */
export declare class FileCache {
    private store;
    private cachePath;
    private dirty;
    constructor(projectPath: string);
    private load;
    /**
     * Compute an MD5 hash of a file's contents.
     */
    hashFile(filePath: string): string;
    /**
     * Build a cache key from file path, checker name, and config hash.
     */
    private buildKey;
    /**
     * Check if a file has changed since last check.
     * Returns the cached results if unchanged, or null if the file needs re-checking.
     */
    get(filePath: string, checkerName: string, configHash: string): Record<string, unknown> | null;
    /**
     * Store results for a file + checker combination.
     */
    set(filePath: string, checkerName: string, configHash: string, results: Record<string, unknown>): void;
    /**
     * Persist the cache to disk.
     */
    save(): void;
    /**
     * Clear all cached entries.
     */
    clear(): void;
    /**
     * Hash the config object to detect config changes.
     */
    static hashConfig(config: Record<string, unknown>): string;
}
