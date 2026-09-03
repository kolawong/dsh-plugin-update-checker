/**
 * dsh-plugin-update-checker — Server half (Version 1.4.0)
 *
 * DeepSeek Harness Cordis plugin providing:
 * 1. Core version tracking (local Git repo vs upstream GitHub)
 * 2. Multi-source plugin discovery (profile bundles, cordis.patch.yml, ~/.dsh/plugins/, and ~/ workspace plugin projects)
 * 3. Per-plugin git update state (branch, behindCount vs origin, remoteUrl; reason when uncheckable)
 * 3. Hides official built-in plugins from management surface
 * 4. Comprehensive plugin uninstall & toggle enable/disable
 * 5. REST API endpoints for Web UI (/api/update-checker/* and /api/plugins/*)
 * 6. Background upgrade and service restart management
 *
 * @license MIT
 */

import { execSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, readlinkSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";

export const name = "update-checker";
export const inject = ["webServer"];

const STATE_DIR_SEGMENTS = ["plugins", "dsh-plugin-update-checker"];
let cachedPluginConfig = {};

function resolveDshHome() {
  const env = process.env.DSH_HOME;
  if (env !== undefined && env.trim().length > 0) {
    const path = env.trim();
    if (path === "~") return homedir();
    if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
    return resolve(path);
  }
  return join(homedir(), ".dsh");
}

function getStateDir() {
  const dir = join(resolveDshHome(), ...STATE_DIR_SEGMENTS);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getStateFilePath() {
  return join(getStateDir(), "state.json");
}

function getUpgradeLogPath() {
  return join(getStateDir(), "upgrade.log");
}

function findCoreRepoPath() {
  const candidates = [
    process.env.DSH_CORE_PATH,
    "/root/deepseek-harness",
    join(homedir(), "deepseek-harness"),
    resolve(process.cwd()),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(join(dir, ".git")) && existsSync(join(dir, "package.json"))) {
      return dir;
    }
  }
  return "/root/deepseek-harness";
}

function safeExec(cmd, cwd = undefined, timeout = 15000) {
  try {
    return execSync(cmd, { cwd, timeout, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Like safeExec, but reports whether the command actually succeeded. */
function tryExec(cmd, cwd = undefined, timeout = 15000) {
  try {
    return {
      ok: true,
      out: execSync(cmd, { cwd, timeout, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    };
  } catch {
    return { ok: false, out: "" };
  }
}

/** Normalize a raw repository string (pkg.repository / git config URL) into an https GitHub URL. */
function normalizeRepoUrl(raw) {
  if (typeof raw !== "string") return null;
  const url = raw.trim().replace(/^git\+/, "").replace(/\.git$/, "");
  if (url.startsWith("git@github.com:")) {
    return "https://github.com/" + url.slice("git@github.com:".length);
  }
  if (url.startsWith("github:")) {
    return "https://github.com/" + url.slice("github:".length);
  }
  if (!url.startsWith("http://") && !url.startsWith("https://") && url.includes("/") && !url.includes(":")) {
    return "https://github.com/" + url;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return null;
}

/** Read the origin URL from a checkout's .git/config, if any. */
function readGitConfigUrl(dir) {
  try {
    const gitCfg = readFileSync(join(dir, ".git", "config"), "utf8");
    const m = gitCfg.match(/url\s*=\s*(.+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** Best-effort repository URL for a discovered plugin directory. */
function resolveRepoUrl(pkg, dir) {
  const raw =
    pkg?.repository?.url ||
    pkg?.repository ||
    pkg?.homepage ||
    (dir && existsSync(join(dir, ".git")) ? readGitConfigUrl(dir) : null);
  return normalizeRepoUrl(raw);
}

/**
 * Inspect one plugin's git update state vs its origin remote.
 * Non-git installs (or broken checkouts) are uncheckable and carry a reason.
 */
function inspectPluginGitState(plugin) {
  const state = {
    checkable: false,
    reason: null,
    branch: null,
    behindCount: 0,
    hasUpdate: false,
    remoteUrl: plugin.repositoryUrl || null,
    localCommit: null,
    remoteCommit: null,
    dirtyCount: 0,
    fetchOk: false,
    checkedAt: null,
  };
  const dir = plugin.path;
  if (!dir || !existsSync(join(dir, ".git"))) {
    state.reason = dir ? "not-a-git-checkout" : "no-local-path";
    return state;
  }

  const branch = safeExec("git rev-parse --abbrev-ref HEAD", dir);
  if (!branch) {
    state.reason = "git-command-failed";
    return state;
  }
  if (branch === "HEAD") {
    state.branch = "HEAD";
    state.reason = "detached-head";
    return state;
  }
  state.branch = branch;

  const originUrl = readGitConfigUrl(dir);
  if (originUrl) {
    state.remoteUrl = normalizeRepoUrl(originUrl);
  }
  if (!state.remoteUrl) {
    state.reason = "no-remote";
    return state;
  }

  state.localCommit = safeExec("git rev-parse --short HEAD", dir) || null;
  state.dirtyCount = safeExec("git status --porcelain", dir)
    .split("\n")
    .filter(Boolean).length;

  // Fetch the remote silently; never prompt, never hang on SSH host keys.
  const fetch = tryExec("GIT_TERMINAL_PROMPT=0 git fetch origin --quiet", dir, 25000);
  state.fetchOk = fetch.ok;

  const upstreamRef = `origin/${branch}`;
  state.remoteCommit = safeExec(`git rev-parse --short ${upstreamRef}`, dir) || null;
  const behindStr = safeExec(`git rev-list --count HEAD..${upstreamRef}`, dir);
  if (!state.remoteCommit || behindStr === "") {
    state.reason = "no-upstream-branch";
    return state;
  }
  state.behindCount = parseInt(behindStr, 10) || 0;
  state.hasUpdate = state.behindCount > 0;
  state.checkable = true;
  state.checkedAt = new Date().toISOString();
  return state;
}

/** Enrich every discovered plugin with its git update state, in parallel. */
async function enrichPluginsWithGitState(plugins) {
  await Promise.all(
    (plugins || []).map(async (p) => {
      try {
        p.gitState = inspectPluginGitState(p);
      } catch (err) {
        p.gitState = {
          checkable: false,
          reason: "inspect-failed",
          branch: null,
          behindCount: 0,
          hasUpdate: false,
          remoteUrl: p.repositoryUrl || null,
          localCommit: null,
          remoteCommit: null,
          dirtyCount: 0,
          fetchOk: false,
          checkedAt: null,
          errorMessage: err?.message || "unknown error",
        };
      }
    })
  );
  return plugins;
}

/**
 * Inspect local and remote core repository status.
 */
async function checkCoreStatus() {
  const coreDir = findCoreRepoPath();
  let currentVersion = "0.1.0";
  const pkgJsonPath = join(coreDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      currentVersion = pkg.version || currentVersion;
    } catch {}
  }

  let currentCommit = "";
  let currentCommitDate = "";
  let currentCommitMsg = "";
  let currentBranch = "master";

  if (existsSync(join(coreDir, ".git"))) {
    currentCommit = safeExec("git rev-parse --short HEAD", coreDir) || "";
    currentCommitDate = safeExec('git log -1 --format="%ci" HEAD', coreDir) || "";
    currentCommitMsg = safeExec('git log -1 --format="%s" HEAD', coreDir) || "";
    currentBranch = safeExec("git rev-parse --abbrev-ref HEAD", coreDir) || "master";

    // Fetch origin silently to compare commits
    safeExec("git fetch origin master --tags", coreDir, 20000);
  }

  let latestCommit = currentCommit;
  let latestCommitDate = currentCommitDate;
  let latestCommitMsg = currentCommitMsg;
  let latestVersion = currentVersion;
  let behindCount = 0;
  const recentCommits = [];

  if (existsSync(join(coreDir, ".git"))) {
    latestCommit = safeExec("git rev-parse --short origin/master", coreDir) || currentCommit;
    latestCommitDate = safeExec('git log -1 --format="%ci" origin/master', coreDir) || currentCommitDate;
    latestCommitMsg = safeExec('git log -1 --format="%s" origin/master', coreDir) || currentCommitMsg;

    const tag = safeExec("git describe --tags --abbrev=0 origin/master", coreDir);
    if (tag) latestVersion = tag.replace(/^dsh-v?/, "v");

    const behindStr = safeExec("git rev-list --count HEAD..origin/master", coreDir);
    behindCount = parseInt(behindStr, 10) || 0;

    const logLines = safeExec('git log -n 12 --format="%h%x09%an%x09%ci%x09%s" origin/master', coreDir);
    if (logLines) {
      for (const line of logLines.split("\n")) {
        const [sha, author, date, message] = line.split("\t");
        if (sha) {
          recentCommits.push({ sha, author, date, message });
        }
      }
    }
  }

  return {
    repoPath: coreDir,
    currentVersion,
    currentCommit,
    currentCommitDate,
    currentCommitMsg,
    currentBranch,
    latestVersion,
    latestCommit,
    latestCommitDate,
    latestCommitMsg,
    behindCount,
    hasUpdate: behindCount > 0,
    recentCommits,
  };
}

/**
 * Inspect custom / 3rd-party installed plugins across profiles, patches, ~/.dsh/plugins/, and ~/ projects
 */
function checkPluginsStatus() {
  const dshHome = resolveDshHome();
  const profileDir = join(dshHome, "profiles");
  const pluginsMap = new Map();

  const profile = "web";
  const pkgPath = join(profileDir, profile, "package.json");
  const patchPath = join(profileDir, profile, "cordis.patch.yml");
  const dshPluginsDir = join(dshHome, "plugins");

  let bundles = [];
  let deps = {};
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      bundles = pkg?.dsh?.profile?.bundles || [];
      deps = pkg?.dependencies || {};
    } catch {}
  }

  let patchText = "";
  if (existsSync(patchPath)) {
    try {
      patchText = readFileSync(patchPath, "utf8");
    } catch {}
  }

  const isOfficial = (name) => {
    if (!name) return true;
    return (
      name.startsWith("@deepseek-ai/") ||
      name.startsWith("@cordisjs/") ||
      name === "dsh-base" ||
      name === "dsh-web-app" ||
      name === "dsh-headless"
    );
  };

  function inspectDirectory(dir, source) {
    if (!existsSync(dir)) return;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") && entry !== ".dsh") continue;
        if (entry === "node_modules") continue;

        const full = join(dir, entry);
        try {
          if (!statSync(full).isDirectory() && !statSync(full).isSymbolicLink()) continue;
        } catch {
          continue;
        }

        let pkgJsonPath = join(full, "package.json");
        if (!existsSync(pkgJsonPath)) {
          try {
            const target = readlinkSync(full);
            pkgJsonPath = resolve(dir, target, "package.json");
          } catch {}
        }

        if (existsSync(pkgJsonPath)) {
          try {
            const pPkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
            const id = pPkg.name || entry;
            if (isOfficial(id)) continue;

            // Only consider directories related to dsh or having dsh bundle manifest
            const isDshRelated =
              Boolean(pPkg?.dsh?.bundle) ||
              entry.startsWith("dsh-") ||
              entry.startsWith("dsh_") ||
              entry.startsWith("DSH-") ||
              entry.includes("plugin") ||
              source === "dsh-plugins" ||
              deps[id] ||
              bundles.includes(id);

            if (!isDshRelated) continue;

            const isSelf = id === "dsh-plugin-update-checker" || entry === "dsh-plugin-update-checker";
            const inBundles = bundles.includes(id) || bundles.includes(entry);
            const inPatch = patchText.includes(id) || patchText.includes(entry);
            const isDisabled = patchText.includes(`id: ${entry}\n  disabled: true`) ||
                               patchText.includes(`id: ${id}\n  disabled: true`);
            const isEnabled = (inBundles || inPatch) && !isDisabled;

            const repositoryUrl = resolveRepoUrl(pPkg, full);

            if (!pluginsMap.has(id)) {
              pluginsMap.set(id, {
                id,
                name: id,
                dirName: entry,
                path: full,
                version: pPkg.version || "1.0.0",
                description: pPkg.description || "",
                repositoryUrl,
                enabled: isEnabled,
                isSelf,
                removable: !isSelf,
                source: isEnabled ? (inBundles ? "bundle" : "patch") : source,
                profile,
              });
            }
          } catch {}
        }
      }
    } catch {}
  }

  // 1. Scan ~/.dsh/plugins/
  inspectDirectory(dshPluginsDir, "dsh-plugins");

  // 2. Scan ~ (home directory for standalone dsh plugin workspaces)
  if (existsSync(homedir())) {
    inspectDirectory(homedir(), "workspace");
  }

  // 3. Scan package.json bundles & dependencies
  for (const b of [...bundles, ...Object.keys(deps)]) {
    if (isOfficial(b)) continue;
    if (pluginsMap.has(b)) continue;

    let version = deps[b] || "1.0.0";
    let description = "";
    const pluginPkgPath = join(profileDir, profile, "node_modules", b, "package.json");
    if (existsSync(pluginPkgPath)) {
      try {
        const pPkg = JSON.parse(readFileSync(pluginPkgPath, "utf8"));
        version = pPkg.version || version;
        description = pPkg.description || description;
      } catch {}
    } else if (deps[b] && (deps[b].startsWith("file:") || deps[b].startsWith("link:"))) {
      description = `Local package: ${deps[b].replace(/^(file|link):/, "")}`;
    }

    const isSelf = b === "dsh-plugin-update-checker";
    pluginsMap.set(b, {
      id: b,
      name: b,
      dirName: b,
      path: "",
      version,
      description,
      enabled: bundles.includes(b),
      isSelf,
      removable: !isSelf,
      source: "bundle",
      profile,
    });
  }

  // 4. Scan ~/.hindsight/ (Hindsight coding-agent daemon)
  const hindsightDir = join(homedir(), ".hindsight", "coding-agents");
  if (existsSync(hindsightDir)) {
    const hindsightPkg = join(hindsightDir, "package.json");
    if (existsSync(hindsightPkg)) {
      try {
        const pPkg = JSON.parse(readFileSync(hindsightPkg, "utf8"));
        const id = "hindsight";
        const name = "hindsight-coding-agents";
        const repoUrl = "https://github.com/vectorize-io/hindsight";
        if (!pluginsMap.has(id) && !pluginsMap.has(name) && !pluginsMap.has(pPkg.name)) {
          pluginsMap.set(id, {
            id,
            name: "Hindsight (Coding Agents Memory)",
            dirName: "hindsight",
            path: hindsightDir,
            version: pPkg.version || "0.4.3",
            description: pPkg.description || "Reflect-only Hindsight long-term memory for coding agents",
            repositoryUrl: repoUrl,
            npmPackage: pPkg.name || "@vectorize-io/hindsight-coding-agents",
            enabled: true,
            isSelf: false,
            removable: false,
            source: "system-daemon",
            profile,
          });
        }
      } catch {}
    }
  }

  // 5. Scan config.extraPlugins (from cordis.patch.yml or profile config)
  const extraList = cachedPluginConfig?.extraPlugins;
  if (Array.isArray(extraList)) {
    for (const ep of extraList) {
      if (!ep || !ep.id) continue;
      const id = ep.id;
      const pPath = ep.path || "";
      let version = ep.version || "1.0.0";
      let description = ep.description || "";
      let repositoryUrl = ep.repo || null;
      let npmPackage = ep.npm || null;
      if (pPath && existsSync(join(pPath, "package.json"))) {
        try {
          const pPkg = JSON.parse(readFileSync(join(pPath, "package.json"), "utf8"));
          version = pPkg.version || version;
          description = pPkg.description || description;
          npmPackage = npmPackage || pPkg.name;
        } catch {}
      }
      if (!pluginsMap.has(id)) {
        pluginsMap.set(id, {
          id,
          name: ep.name || (id === "hindsight" ? "Hindsight (Coding Agents Memory)" : id),
          dirName: id,
          path: pPath,
          version,
          description,
          repositoryUrl,
          npmPackage,
          enabled: true,
          isSelf: false,
          removable: false,
          source: "external",
          profile,
        });
      }
    }
  }

  return Array.from(pluginsMap.values());
}

/**
 * Uninstall a plugin from profile package.json, cordis.patch.yml, and ~/.dsh/plugins/
 */
function uninstallPlugin(pluginId, profile = "web") {
  const dshHome = resolveDshHome();
  const profileDir = join(dshHome, "profiles", profile);
  const pkgPath = join(profileDir, "package.json");
  const patchPath = join(profileDir, "cordis.patch.yml");
  const dshPluginsDir = join(dshHome, "plugins");

  // 1. Remove from package.json
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg?.dsh?.profile?.bundles) {
        pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((b) => b !== pluginId);
      }
      if (pkg?.dependencies && pkg.dependencies[pluginId]) {
        delete pkg.dependencies[pluginId];
      }
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    } catch {}
  }

  // 2. Remove from cordis.patch.yml
  if (existsSync(patchPath)) {
    try {
      let patchContent = readFileSync(patchPath, "utf8");
      const escapedId = pluginId.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const blockRegex = new RegExp(`\n\s*-\s*id:\s*[^\n]*\n\s*name:\s*['"]?${escapedId}['"]?[^\n]*(\n\s+config:[^\n]*(\n\s+[^\n]+)*)?`, "g");
      patchContent = patchContent.replace(blockRegex, "");
      writeFileSync(patchPath, patchContent, "utf8");
    } catch {}
  }

  // 3. Remove symlink from ~/.dsh/plugins/ if exists
  if (existsSync(dshPluginsDir)) {
    try {
      for (const entry of readdirSync(dshPluginsDir)) {
        const full = join(dshPluginsDir, entry);
        let match = entry === pluginId || entry === pluginId.split("/").pop();
        if (!match && existsSync(join(full, "package.json"))) {
          try {
            const pPkg = JSON.parse(readFileSync(join(full, "package.json"), "utf8"));
            if (pPkg.name === pluginId) match = true;
          } catch {}
        }
        if (match) {
          unlinkSync(full);
        }
      }
    } catch {}
  }

  // 4. Run pnpm remove in background
  try {
    const pnpmPath = "/root/.nvm/versions/node/v22.23.2/bin/pnpm";
    const env = { ...process.env, PATH: `/root/.nvm/versions/node/v22.23.2/bin:${process.env.PATH}` };
    execSync(`${existsSync(pnpmPath) ? pnpmPath : "pnpm"} remove "${pluginId}"`, {
      cwd: profileDir,
      env,
      timeout: 15000,
      stdio: "ignore",
    });
  } catch {}

  return true;
}

/**
 * Toggle plugin enabled/disabled status in dsh.profile.bundles and cordis.patch.yml.
 */
function togglePlugin(pluginId, enabled, profile = "web") {
  const dshHome = resolveDshHome();
  const profileDir = join(dshHome, "profiles", profile);
  const pkgPath = join(profileDir, "package.json");
  const patchPath = join(profileDir, "cordis.patch.yml");

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (!pkg.dsh) pkg.dsh = {};
      if (!pkg.dsh.profile) pkg.dsh.profile = {};
      if (!pkg.dsh.profile.bundles) pkg.dsh.profile.bundles = [];

      const bundles = pkg.dsh.profile.bundles;
      if (enabled) {
        if (!bundles.includes(pluginId)) bundles.push(pluginId);
      } else {
        pkg.dsh.profile.bundles = bundles.filter((b) => b !== pluginId);
      }
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    } catch {}
  }

  // If in cordis.patch.yml, toggle disabled state
  if (existsSync(patchPath)) {
    try {
      let patchContent = readFileSync(patchPath, "utf8");
      const escapedId = pluginId.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const nameRegex = new RegExp(`(name:\s*['"]?${escapedId}['"]?)`, "g");
      if (nameRegex.test(patchContent)) {
        if (!enabled) {
          patchContent = patchContent.replace(nameRegex, `$1\n      disabled: true`);
        } else {
          patchContent = patchContent.replace(/\n\s*disabled:\s*true/g, "");
        }
        writeFileSync(patchPath, patchContent, "utf8");
      }
    } catch {}
  }

  return true;
}

/**
 * Trigger background restart of the dsh web server.
 */
function triggerServerRestart() {
  const restartScript = `
    sleep 1
    pkill -f 'apps/cli/lib/bin.js' || true
    sleep 2
    export PATH=/root/.nvm/versions/node/v22.23.2/bin:$PATH
    nohup /root/.nvm/versions/node/v22.23.2/bin/node /root/deepseek-harness/apps/cli/lib/bin.js web --port 3080 --trusted-host 183.237.82.114:3080 > /root/.dsh/dsh-web.log 2>&1 < /dev/null &
  `;
  const child = spawn("bash", ["-c", restartScript], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// Global cached state
const cachedState = {
  lastChecked: null,
  isChecking: false,
  isUpgrading: false,
  core: null,
  plugins: [],
  lastUpgradeResult: null,
};

// Live upgrade process runtime (streamed output tail + current phase).
// Shared by core upgrades and per-plugin upgrades; `target` says which one is running.
const upgradeRuntime = {
  phase: null,
  phaseLabel: "",
  target: null,
  startedAt: null,
  finishedAt: null,
  tailLines: [],
  pending: "",
};

const UPGRADE_TAIL_MAX_LINES = 400;

function appendUpgradeOutput(chunk) {
  const text = upgradeRuntime.pending + chunk.toString("utf8");
  const lines = text.split("\n");
  upgradeRuntime.pending = lines.pop() ?? "";
  for (const line of lines) {
    upgradeRuntime.tailLines.push(line);
    const m = line.match(/^\[PHASE\]\s+([a-z-]+)\s*\|\s*(.*)$/);
    if (m) {
      upgradeRuntime.phase = m[1];
      upgradeRuntime.phaseLabel = m[2];
    }
  }
  if (upgradeRuntime.tailLines.length > UPGRADE_TAIL_MAX_LINES) {
    upgradeRuntime.tailLines.splice(0, upgradeRuntime.tailLines.length - UPGRADE_TAIL_MAX_LINES);
  }
}

function upgradeTailText() {
  return upgradeRuntime.tailLines.join("\n");
}

// ---- Shared upgrade process runtime (used by core AND per-plugin upgrades) ----

let upgradeSettled = false;
let upgradeHardCapTimer = null;

function resetUpgradeRuntime(target) {
  cachedState.isUpgrading = true;
  cachedState.lastUpgradeResult = null;
  upgradeSettled = false;
  upgradeRuntime.phase = "starting";
  upgradeRuntime.phaseLabel = "";
  upgradeRuntime.target = target || { type: "core" };
  upgradeRuntime.startedAt = new Date().toISOString();
  upgradeRuntime.finishedAt = null;
  upgradeRuntime.tailLines = [];
  upgradeRuntime.pending = "";
}

function finalizeUpgrade(success, error) {
  if (upgradeSettled) return;
  upgradeSettled = true;
  if (upgradeHardCapTimer) {
    clearTimeout(upgradeHardCapTimer);
    upgradeHardCapTimer = null;
  }
  cachedState.isUpgrading = false;
  upgradeRuntime.finishedAt = new Date().toISOString();
  cachedState.lastUpgradeResult = {
    success,
    error: success ? null : error,
    target: upgradeRuntime.target,
    time: upgradeRuntime.finishedAt,
  };
  if (success) {
    // Refresh version/update state so badges reflect the new code immediately.
    runFullCheck().catch(() => {});
  }
}

function startUpgradeScript(script, cwd) {
  const logPath = getUpgradeLogPath();
  const targetLabel = upgradeRuntime.target?.type === "plugin" ? `plugin:${upgradeRuntime.target.id}` : "core";
  try {
    writeFileSync(logPath, `=== DeepSeek Harness Upgrade (${targetLabel}) started at ${upgradeRuntime.startedAt} ===\n`, "utf8");
  } catch {}

  let child;
  try {
    child = spawn("bash", ["-c", script], {
      cwd,
      env: {
        ...process.env,
        PATH: `/root/.nvm/versions/node/v22.23.2/bin:${process.env.PATH || "/usr/local/bin:/usr/bin:/bin"}`,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  } catch (err) {
    appendUpgradeOutput(Buffer.from(`[FAIL] failed to spawn upgrade process: ${err.message}\n`));
    finalizeUpgrade(false, err.message);
    return null;
  }

  child.stdout.on("data", (chunk) => {
    appendUpgradeOutput(chunk);
    try { appendFileSync(logPath, chunk); } catch {}
  });
  child.stderr.on("data", (chunk) => {
    appendUpgradeOutput(chunk);
    try { appendFileSync(logPath, chunk); } catch {}
  });
  child.on("error", (err) => {
    appendUpgradeOutput(Buffer.from(`[FAIL] upgrade process error: ${err.message}\n`));
    finalizeUpgrade(false, err.message);
  });
  child.on("close", (code) => {
    const tail = code === 0 ? "\n[DONE]\n" : `\n[FAIL] upgrade exited with code ${code}\n`;
    appendUpgradeOutput(Buffer.from(tail));
    try { appendFileSync(logPath, tail); } catch {}
    finalizeUpgrade(code === 0, code === 0 ? null : `upgrade exited with code ${code}`);
  });

  // Hard safety cap: never leave isUpgrading stuck forever.
  upgradeHardCapTimer = setTimeout(() => {
    appendUpgradeOutput(Buffer.from("\n[FAIL] upgrade timed out after 15 minutes and was killed\n"));
    try { child.kill("SIGKILL"); } catch {}
    finalizeUpgrade(false, "timeout after 15 minutes");
  }, 15 * 60 * 1000);

  return child;
}

function loadPersistedState() {
  try {
    const file = getStateFilePath();
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (data.core) cachedState.core = data.core;
      if (data.plugins) cachedState.plugins = data.plugins;
      if (data.lastChecked) cachedState.lastChecked = data.lastChecked;
    }
  } catch {}
}

function persistState() {
  try {
    const file = getStateFilePath();
    writeFileSync(
      file,
      JSON.stringify(
        {
          lastChecked: cachedState.lastChecked,
          core: cachedState.core,
          plugins: cachedState.plugins,
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {}
}

/**
 * Re-scan plugins locally (fast, no network) while keeping the git update
 * state collected by the last full check — used on lightweight refreshes so
 * badges don't flicker or vanish between full checks.
 */
function rescanPluginsPreservingGitState() {
  const previous = new Map((cachedState.plugins || []).map((p) => [p.id, p]));
  const fresh = checkPluginsStatus();
  for (const p of fresh) {
    const prev = previous.get(p.id);
    if (prev && prev.gitState) p.gitState = prev.gitState;
  }
  return fresh;
}

async function runFullCheck() {
  if (cachedState.isChecking) return cachedState;
  cachedState.isChecking = true;
  try {
    const [core, plugins] = await Promise.all([
      checkCoreStatus(),
      Promise.resolve(checkPluginsStatus()),
    ]);
    await enrichPluginsWithGitState(plugins);
    cachedState.core = core;
    cachedState.plugins = plugins;
    cachedState.lastChecked = new Date().toISOString();
    persistState();
  } catch (err) {
    console.error("[update-checker] check failed:", err);
  } finally {
    cachedState.isChecking = false;
  }
  return cachedState;
}

export function apply(ctx, config) {
  cachedPluginConfig = config || {};
  loadPersistedState();

  // Register settings schema
  ctx.inject(["settings"], (sctx) => {
    try {
      sctx.settings.register(
        "update-checker",
        z.object({
          autoCheck: z.boolean().default(true),
          checkIntervalHours: z.number().default(6),
          githubRepo: z.string().default("deepseek-ai/deepseek-harness"),
        })
      );
    } catch (e) {
      ctx.logger?.warn?.("[update-checker] settings registration:", e);
    }
  });

  // Register WebServer endpoints
  if (ctx.webServer) {
    // 1. GET /api/update-checker/status
    ctx.webServer.register({
      kind: "exact",
      path: "/api/update-checker/status",
      handler: async (req, res) => {
        if (req.method === "GET") {
          if (!cachedState.core || !cachedState.lastChecked) {
            await runFullCheck();
          } else {
            cachedState.plugins = rescanPluginsPreservingGitState();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, data: cachedState }));
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 2. POST /api/update-checker/check
    ctx.webServer.register({
      kind: "exact",
      path: "/api/update-checker/check",
      handler: async (req, res) => {
        if (req.method === "POST") {
          const updated = await runFullCheck();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, data: updated }));
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 3. POST /api/update-checker/upgrade
    ctx.webServer.register({
      kind: "exact",
      path: "/api/update-checker/upgrade",
      handler: async (req, res) => {
        if (req.method === "POST") {
          if (cachedState.isUpgrading) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, message: "Upgrade already in progress" }));
            return;
          }

          resetUpgradeRuntime({ type: "core" });
          const coreDir = findCoreRepoPath();

          // Stash local modifications so a fast-forward pull can never be
          // blocked by "local changes would be overwritten", then restore them
          // after the pull. Every step streams its output to the parent process
          // (which mirrors it into upgrade.log and the live tail buffer).
          const upgradeScript = `
set -u
CORE=${JSON.stringify(coreDir)}
if [ ! -d "$CORE/.git" ]; then
  echo "[FAIL] core repo not found at $CORE"
  exit 10
fi
cd "$CORE" || exit 10

echo ""
echo "[PHASE] stash | Stashing local changes"
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
  if git stash push --include-untracked -m "dsh-upgrade auto-stash $(date '+%F %T')"; then
    STASHED=1
    echo "[INFO] local changes stashed"
  else
    echo "[WARN] git stash failed; pulling without stashing"
  fi
else
  echo "[INFO] no local changes to stash"
fi

echo ""
echo "[PHASE] pull | Pulling upstream updates (git pull --ff-only)"
if ! git pull --ff-only origin master; then
  echo "[FAIL] git pull failed - upgrade aborted"
  exit 20
fi

echo ""
echo "[PHASE] unstash | Restoring local changes"
if [ "$STASHED" -eq 1 ]; then
  if git stash pop; then
    echo "[INFO] local changes restored"
  else
    echo "[WARN] restoring local changes conflicted with upstream; your changes are kept safe in 'git stash' - resolve manually later (git stash list / git stash pop)"
  fi
else
  echo "[INFO] nothing to restore"
fi

echo ""
echo "[PHASE] install | Installing dependencies (pnpm install)"
if ! pnpm install; then
  echo "[FAIL] pnpm install failed - upgrade aborted"
  exit 30
fi

echo ""
echo "[PHASE] build | Building harness packages (pnpm build)"
if ! pnpm build; then
  echo "[FAIL] pnpm build failed - upgrade aborted"
  exit 40
fi

echo ""
echo "=== Upgrade Build Completed at $(date) ==="
`;

          const child = startUpgradeScript(upgradeScript, coreDir);
          if (!child) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, message: "Failed to spawn upgrade process" }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              message: "Upgrade process spawned in background",
              logPath: "/api/update-checker/log",
              statusPath: "/api/update-checker/upgrade/status",
            })
          );
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 4. GET /api/update-checker/upgrade/status — lightweight live progress poll
    ctx.webServer.register({
      kind: "exact",
      path: "/api/update-checker/upgrade/status",
      handler: async (req, res) => {
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              data: {
                running: Boolean(cachedState.isUpgrading),
                phase: upgradeRuntime.phase,
                phaseLabel: upgradeRuntime.phaseLabel,
                target: upgradeRuntime.target || null,
                startedAt: upgradeRuntime.startedAt,
                finishedAt: upgradeRuntime.finishedAt,
                tail: upgradeTailText(),
                result: cachedState.lastUpgradeResult,
              },
            })
          );
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 5. GET /api/update-checker/log
    ctx.webServer.register({
      kind: "exact",
      path: "/api/update-checker/log",
      handler: async (req, res) => {
        if (req.method === "GET") {
          const logPath = getUpgradeLogPath();
          // Prefer the in-memory live tail (real-time during an upgrade);
          // fall back to the persisted log file after a restart.
          let content = upgradeTailText();
          if (!content && existsSync(logPath)) {
            try {
              content = readFileSync(logPath, "utf8");
            } catch {}
          }
          if (!content) content = "No upgrade log available.";
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(content);
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 6. POST /api/plugins/uninstall
    ctx.webServer.register({
      kind: "exact",
      path: "/api/plugins/uninstall",
      handler: async (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body || "{}");
              const { pluginId, profile = "web" } = data;
              if (!pluginId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "pluginId is required" }));
                return;
              }

              uninstallPlugin(pluginId, profile);
              cachedState.plugins = rescanPluginsPreservingGitState();
              persistState();

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: true,
                  message: `Plugin ${pluginId} uninstalled successfully`,
                  plugins: cachedState.plugins,
                })
              );
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 7. POST /api/plugins/toggle
    ctx.webServer.register({
      kind: "exact",
      path: "/api/plugins/toggle",
      handler: async (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body || "{}");
              const { pluginId, enabled, profile = "web" } = data;
              if (!pluginId || enabled === undefined) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "pluginId and enabled are required" }));
                return;
              }

              togglePlugin(pluginId, Boolean(enabled), profile);
              cachedState.plugins = rescanPluginsPreservingGitState();
              persistState();

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: true,
                  message: `Plugin ${pluginId} ${enabled ? "enabled" : "disabled"}`,
                  plugins: cachedState.plugins,
                })
              );
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 8. POST /api/plugins/update — one-click upgrade for a single plugin
    //    (same scoped stash → pull --ff-only → unstash → pnpm install flow as
    //    the core upgrade, through the shared live phase/log-tail runtime)
    ctx.webServer.register({
      kind: "exact",
      path: "/api/plugins/update",
      handler: async (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body || "{}");
              const { pluginId } = data;
              if (!pluginId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "pluginId is required" }));
                return;
              }
              if (cachedState.isUpgrading) {
                res.writeHead(409, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, message: "Upgrade already in progress" }));
                return;
              }

              let plugin = (cachedState.plugins || []).find((p) => p.id === pluginId || p.name === pluginId);
              if (!plugin) {
                cachedState.plugins = rescanPluginsPreservingGitState();
                plugin = (cachedState.plugins || []).find((p) => p.id === pluginId || p.name === pluginId);
              }
              const pluginDir = plugin?.path || "";
              if (!pluginDir || !existsSync(join(pluginDir, ".git"))) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    ok: false,
                    error: `Plugin ${pluginId} is not a git checkout; one-click upgrade is unavailable`,
                  })
                );
                return;
              }

              resetUpgradeRuntime({ type: "plugin", id: pluginId, name: plugin?.name || pluginId });
              const profileDir = join(resolveDshHome(), "profiles", plugin?.profile || "web");

              // Scoped per-plugin upgrade: stash → pull --ff-only → unstash →
              // pnpm install, then refresh the profile so file: dependency
              // copies pick up the new code.
              const upgradeScript = `
set -u
PLUGIN_DIR=${JSON.stringify(pluginDir)}
PROFILE_DIR=${JSON.stringify(profileDir)}
if [ ! -d "$PLUGIN_DIR/.git" ]; then
  echo "[FAIL] plugin git repo not found at $PLUGIN_DIR"
  exit 10
fi
cd "$PLUGIN_DIR" || exit 10

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  echo "[FAIL] plugin repo is in detached HEAD state; cannot pull safely"
  exit 11
fi

echo ""
echo "[PHASE] stash | Stashing local changes"
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
  if git stash push --include-untracked -m "dsh-plugin-update auto-stash $(date '+%F %T')"; then
    STASHED=1
    echo "[INFO] local changes stashed"
  else
    echo "[WARN] git stash failed; pulling without stashing"
  fi
else
  echo "[INFO] no local changes to stash"
fi

echo ""
echo "[PHASE] pull | Pulling upstream updates (git pull --ff-only origin $BRANCH)"
if ! git pull --ff-only origin "$BRANCH"; then
  echo "[FAIL] git pull failed - upgrade aborted"
  exit 20
fi

echo ""
echo "[PHASE] unstash | Restoring local changes"
if [ "$STASHED" -eq 1 ]; then
  if git stash pop; then
    echo "[INFO] local changes restored"
  else
    echo "[WARN] restoring local changes conflicted with upstream; your changes are kept safe in 'git stash' - resolve manually later"
  fi
else
  echo "[INFO] nothing to restore"
fi

echo ""
echo "[PHASE] install | Installing plugin dependencies (pnpm install)"
if [ -f package.json ]; then
  if ! pnpm install; then
    echo "[FAIL] pnpm install failed in plugin dir - upgrade aborted"
    exit 30
  fi
else
  echo "[INFO] no package.json in plugin dir; skipping"
fi

echo ""
echo "[PHASE] sync | Syncing profile dependencies (pnpm install)"
if [ -f "$PROFILE_DIR/package.json" ]; then
  if ! (cd "$PROFILE_DIR" && pnpm install); then
    echo "[FAIL] profile pnpm install failed - upgrade aborted"
    exit 31
  fi
else
  echo "[INFO] profile package.json not found; skipping sync"
fi

echo ""
echo "=== Plugin Upgrade Completed at $(date) ==="
`;

              const child = startUpgradeScript(upgradeScript, pluginDir);
              if (!child) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, message: "Failed to spawn upgrade process" }));
                return;
              }

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: true,
                  message: `Upgrade for plugin ${pluginId} spawned in background`,
                  logPath: "/api/update-checker/log",
                  statusPath: "/api/update-checker/upgrade/status",
                })
              );
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });

    // 9. POST /api/plugins/restart
    ctx.webServer.register({
      kind: "exact",
      path: "/api/plugins/restart",
      handler: async (req, res) => {
        if (req.method === "POST") {
          triggerServerRestart();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, message: "Restarting Web Server in background..." }));
          return;
        }
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      },
    });
  }

  // Auto check on startup after 5 seconds
  if (config?.autoCheck !== false) {
    setTimeout(() => {
      runFullCheck()
        .then(() => {
          ctx.logger?.info?.(
            `[update-checker] System checked: ${cachedState.core?.currentVersion} (Behind: ${cachedState.core?.behindCount} commits)`
          );
        })
        .catch(() => {});
    }, 5000);

    const intervalMs = (config?.checkIntervalHours || 6) * 3600 * 1000;
    setInterval(() => {
      runFullCheck().catch(() => {});
    }, intervalMs);
  }

  ctx.logger?.info?.("[update-checker] DeepSeek Harness System & Plugin Manager initialized");
}
