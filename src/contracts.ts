export type UpdateMode = 'manual' | 'watch' | 'post-commit';

export interface AgentConfig {
  readmePath: string;
  include: string[];
  exclude: string[];
  startMarker: string;
  endMarker: string;
  updateMode: UpdateMode;
  ai?: {
    enabled?: boolean;
    provider?: 'gemini';
    model?: string;
  };
}

export interface ChangeSet {
  changedFiles: string[];
  diff: string;
}

export interface UpdateContext {
  repositoryRoot: string;
  readmeText: string;
  selectedFileContents: Record<string, string>;
  diff: string;
}

export type FindRepoRoot = (cwd: string) => Promise<string>;
export type GetChangeSet = (root: string) => Promise<ChangeSet>;
export type CreateDefaultConfig = (root: string) => Promise<AgentConfig>;
export type LoadConfig = (root: string) => Promise<AgentConfig>;
export type RunInit = (cwd: string) => Promise<void>;
export type RunUpdate = (cwd: string) => Promise<void>;