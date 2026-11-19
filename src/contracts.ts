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
    provider?: 'openai';
    model?: string;
  };
}

export interface ChangeSet {
  changedFiles: string[];
  diff: string;
}