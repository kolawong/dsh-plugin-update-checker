import { Context } from '@deepseek-ai/cordis';

export interface UpdateCheckerConfig {
  autoCheck?: boolean;
  checkIntervalHours?: number;
  githubRepo?: string;
}

export declare const name: string;
export declare const inject: string[];
export declare function apply(ctx: Context, config?: UpdateCheckerConfig): void;
