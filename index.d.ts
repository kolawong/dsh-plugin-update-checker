import type { Context } from "@deepseek-ai/cordis";
import type Schema from "@deepseek-ai/schemastery";

/**
 * Plugin configuration. The same-named Schemastery schema is exported at
 * runtime from index.js and validated by Cordis when the plugin loads.
 */
export interface Config {
  /** Run a version check on startup and on an interval. */
  autoCheck: boolean;
  /** Hours between background checks. */
  checkIntervalHours: number;
  /** GitHub slug advertised as the upstream project. */
  githubRepo: string;
  /** Core checkout used for version checks and upgrades; "" = auto-detect. */
  coreRepoPath: string;
  /** Upstream branch tracked and pulled during an upgrade. */
  branch: string;
  /** Directory holding the node/pnpm binaries; "" = the running Node's bin dir. */
  nodeBinDir: string;
  /** Port handed to the restarted web server. */
  webPort: number;
  /** Optional --trusted-host value passed to the restarted web server. */
  webTrustedHost: string;
  /** Restarted web server log file; "" = $DSH_HOME/dsh-web.log. */
  webLogPath: string;
}

/** Schemastery schema validated by Cordis at load time (defaults live here). */
export declare const Config: Schema<Config>;

export declare const name: string;
export declare const inject: string[];
export declare function apply(ctx: Context, config?: Config): void;
