/**
 * WPCS MCP Server - Main Implementation (v2.0.0)
 */
export declare class WpcsMcpServer {
    private server;
    private phpcsRunner;
    constructor();
    private setupToolHandlers;
    private checkStagedFiles;
    private checkFile;
    private checkDirectory;
    private fixFile;
    private preCommitWorkflow;
    private checkPhpCompatibility;
    private qualityCheck;
    private frontendCheck;
    private codeAnalysis;
    private validateProject;
    private fullCheck;
    private runPhpCompatibility;
    private formatCheckResult;
    private successResult;
    private errorResult;
    private submissionCheck;
    private reportGenerate;
    private phpstanCheck;
    run(): Promise<void>;
}
