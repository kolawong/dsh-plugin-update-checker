/**
 * dsh-plugin-update-checker — Server half (Version 1.4.2)
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

import { execSync, spawn, exec } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, readlinkSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import https from "node:https";
import { join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";

function asyncExec(cmd, cwd = undefined, timeout = 4000) {
  return new Promise((resolve) => {
    try {
      exec(cmd, { cwd, timeout, encoding: "utf8" }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, out: "", err: stderr || err.message });
        } else {
          resolve({ ok: true, out: (stdout || "").trim(), err: "" });
        }
      });
    } catch (e) {
      resolve({ ok: false, out: "", err: e?.message || "exec failed" });
    }
  });
}

export const Config = z.object({
  autoCheck: z.boolean().default(true),
  checkIntervalHours: z.number().default(0.5),
  checkIntervalMinutes: z.number().default(30),
  githubRepo: z.string().default("deepseek-ai/deepseek-harness"),
  branch: z.string().default("master"),
  coreRepoPath: z.string().default(""),
  extraPlugins: z.array(z.any()).default([]),
});
Config.meta.volatile = true;

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
    typeof cachedPluginConfig?.coreRepoPath === "string" && cachedPluginConfig.coreRepoPath.trim()
      ? cachedPluginConfig.coreRepoPath.trim()
      : null,
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

/** Upstream branch tracked for core update checks (config `branch`, default master). */
function coreBranchName() {
  const b = cachedPluginConfig?.branch;
  if (typeof b === "string" && /^[A-Za-z0-9._/-]{1,120}$/.test(b.trim())) return b.trim();
  return "master";
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

/** Read localized and standard descriptions for a plugin. */
function readPluginDescriptions(dir, pPkg) {
  let description = pPkg?.description || "";
  let descriptionZh = pPkg?.descriptionZh || "";

  if (dir) {
    const zhJsonPaths = [
      join(dir, "locale", "zh.json"),
      join(dir, "locale", "zh-CN.json"),
      join(dir, "locales", "zh.json"),
      join(dir, "locales", "zh-CN.json"),
    ];
    for (const p of zhJsonPaths) {
      if (existsSync(p)) {
        try {
          const loc = JSON.parse(readFileSync(p, "utf8"));
          if (loc?.meta?.description) {
            descriptionZh = loc.meta.description;
            break;
          }
          if (loc?.description) {
            descriptionZh = loc.description;
            break;
          }
        } catch {}
      }
    }
  }

  return { description, descriptionZh };
}

/**
 * Inspect one plugin's git update state vs its origin remote.
 * Non-git installs (or broken checkouts) are uncheckable and carry a reason.
 */
async function inspectPluginGitState(plugin) {
  const state = {
    checkable: false,
    reason: null,
    branch: null,
    behindCount: 0,
    behindCountExact: true,
    hasUpdate: false,
    remoteUrl: plugin.repositoryUrl || null,
    localCommit: null,
    remoteCommit: null,
    dirtyCount: 0,
    fetchOk: false,
    checkedAt: null,
  };
  const dir = plugin.path;
  let workDir = dir;
  if (dir && !existsSync(join(dir, ".git"))) {
    const topLevel = safeExec("git rev-parse --show-toplevel", dir);
    if (topLevel && existsSync(join(topLevel, ".git"))) {
      workDir = topLevel;
    }
  }
  if (!workDir || !existsSync(join(workDir, ".git"))) {
    state.reason = dir ? "not-a-git-checkout" : "no-local-path";
    return state;
  }

  const branch = safeExec("git rev-parse --abbrev-ref HEAD", workDir);
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

  const originUrl = readGitConfigUrl(workDir);
  if (originUrl) {
    state.remoteUrl = normalizeRepoUrl(originUrl);
  }
  if (!state.remoteUrl) {
    state.reason = "no-remote";
    return state;
  }

  state.localCommit = safeExec("git rev-parse --short HEAD", workDir) || null;
  state.dirtyCount = safeExec("git status --porcelain", workDir)
    .split("\n")
    .filter(Boolean).length;

  // Fetch the remote silently and asynchronously. The timeout is generous on
  // purpose: a fetch killed mid-transfer leaves `origin/<branch>` stale, and an
  // answer computed from a stale ref is a false "up to date".
  const fetch = await asyncExec("GIT_TERMINAL_PROMPT=0 git fetch origin --quiet", workDir, 20000);
  state.fetchOk = fetch.ok;

  const upstreamRef = `origin/${branch}`;
  if (fetch.ok) {
    state.remoteCommit = safeExec(`git rev-parse --short ${upstreamRef}`, workDir) || null;
    const behindStr = safeExec(`git rev-list --count HEAD..${upstreamRef}`, workDir);
    if (!state.remoteCommit || behindStr === "") {
      state.reason = "no-upstream-branch";
      return state;
    }
    state.behindCount = parseInt(behindStr, 10) || 0;
    state.behindCountExact = true;
    state.hasUpdate = state.behindCount > 0;
    state.checkable = true;
    state.checkedAt = new Date().toISOString();
    return state;
  }

  // Fetch failed — never answer from the possibly-stale tracking ref. Fall back
  // to a lightweight ls-remote SHA comparison so a moved upstream is still
  // detected instead of being silently reported as "up to date".
  const ls = await asyncExec(
    `GIT_TERMINAL_PROMPT=0 git ls-remote --heads origin refs/heads/${branch}`,
    dir,
    10000
  );
  if (!ls.ok) {
    state.reason = "network-unreachable";
    return state;
  }
  const remoteSha = pickRemoteHeadSha(ls.out.split("\n"), branch);
  if (!remoteSha) {
    state.reason = "no-upstream-branch";
    return state;
  }
  const localSha = safeExec("git rev-parse HEAD", workDir);
  state.remoteCommit = remoteSha.slice(0, 10);
  const moved = !!localSha && remoteSha !== localSha;
  state.behindCount = moved ? 1 : 0;
  state.behindCountExact = !moved;
  state.hasUpdate = moved;
  state.checkable = true;
  state.checkedAt = new Date().toISOString();
  return state;
}

/** Enrich every discovered plugin with its git or npm update state, in parallel. */

function parseSemver(v) {
  if (!v || typeof v !== "string") return [0, 0, 0, ""];
  const clean = v.trim().replace(/^[v^~=]/, "");
  const [main, ...pre] = clean.split("-");
  const parts = main.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return [...parts.slice(0, 3), pre.join("-")];
}

function compareSemver(v1, v2) {
  const [maj1, min1, pat1, pre1] = parseSemver(v1);
  const [maj2, min2, pat2, pre2] = parseSemver(v2);
  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  if (pre1 && !pre2) return -1;
  if (!pre1 && pre2) return 1;
  if (pre1 && pre2) return pre1.localeCompare(pre2);
  return 0;
}

/**
 * Best release-tag version (e.g. `dsh-v0.1.7-alpha.1`) from `git ls-remote`
 * output lines, chosen by semver — not by date or lexicographic order.
 */
function pickLatestTagVersion(lines) {
  let best = null;
  for (const line of lines || []) {
    const m = String(line).trim().match(/^[0-9a-f]{40}\s+refs\/tags\/(.+)$/);
    if (!m) continue;
    const rawName = m[1];
    if (rawName.endsWith("^{}")) continue;
    const ver = rawName.replace(/^dsh-/, "").replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+/.test(ver)) continue;
    if (best === null || compareSemver(ver, best) > 0) best = ver;
  }
  return best;
}

/** Extract the full commit SHA for `refs/heads/<branch>` from ls-remote output. */
function pickRemoteHeadSha(lines, branch) {
  const want = `refs/heads/${branch}`;
  for (const line of lines || []) {
    const parts = String(line).trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === want) return parts[0];
  }
  return "";
}

const npmVersionCache = new Map();
const NPM_CACHE_TTL = 15 * 60 * 1000;

function fetchUrlJson(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { timeout: timeoutMs, headers: { "User-Agent": "dsh-update-checker/1.4" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 200000) {
            req.destroy();
            resolve(null);
          }
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function fetchNpmLatestVersion(pkgName, timeoutMs = 3500) {
  if (!pkgName) return null;
  const now = Date.now();
  const cached = npmVersionCache.get(pkgName);
  if (cached && now - cached.timestamp < NPM_CACHE_TTL) {
    return cached.version;
  }

  const encodedName = pkgName.startsWith("@")
    ? `@${encodeURIComponent(pkgName.slice(1))}`
    : encodeURIComponent(pkgName);
  const officialUrl = `https://registry.npmjs.org/${encodedName}/latest`;
  let data = await fetchUrlJson(officialUrl, timeoutMs);

  if (!data?.version) {
    const mirrorUrl = `https://registry.npmmirror.com/${encodedName}/latest`;
    data = await fetchUrlJson(mirrorUrl, timeoutMs);
  }

  if (data?.version) {
    npmVersionCache.set(pkgName, { version: data.version, timestamp: now });
    return data.version;
  }
  return null;
}

async function enrichPluginsWithGitState(plugins) {
  await Promise.all(
    (plugins || []).map(async (p) => {
      try {
        const dir = p.path;
        const isGit = dir && existsSync(join(dir, ".git"));
        const npmPkg = p.npmPackage || (p.id === "hindsight" ? "@vectorize-io/hindsight-coding-agents" : null);

        if (!isGit && npmPkg) {
          const latestVersion = await fetchNpmLatestVersion(npmPkg);
          if (latestVersion) {
            const hasUpdate = compareSemver(latestVersion, p.version) > 0;
            p.gitState = {
              checkable: true,
              type: "npm",
              npmPackage: npmPkg,
              latestVersion,
              hasUpdate,
              branch: null,
              behindCount: hasUpdate ? 1 : 0,
              remoteUrl: p.repositoryUrl || `https://www.npmjs.com/package/${npmPkg}`,
              localCommit: null,
              remoteCommit: null,
              dirtyCount: 0,
              fetchOk: true,
              checkedAt: new Date().toISOString(),
              reason: null,
            };
            return;
          } else {
            p.gitState = {
              checkable: false,
              type: "npm",
              npmPackage: npmPkg,
              reason: "npm-registry-failed",
              branch: null,
              behindCount: 0,
              hasUpdate: false,
              remoteUrl: p.repositoryUrl || `https://www.npmjs.com/package/${npmPkg}`,
              localCommit: null,
              remoteCommit: null,
              dirtyCount: 0,
              fetchOk: false,
              checkedAt: new Date().toISOString(),
            };
            return;
          }
        }

        p.gitState = await inspectPluginGitState(p);
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
 * Read local core repo info instantly (0ms, no network).
 */
function getLocalCoreStatus() {
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
  }

  return {
    repoPath: coreDir,
    currentVersion,
    currentCommit,
    currentCommitDate,
    currentCommitMsg,
    currentBranch,
    latestVersion: currentVersion,
    remoteVersion: currentVersion,
    latestCommit: currentCommit,
    remoteCommit: currentCommit,
    latestCommitDate: currentCommitDate,
    latestCommitMsg: currentCommitMsg,
    behindCount: 0,
    behindCountExact: true,
    hasUpdate: false,
    fetchOk: null,
    checkStale: false,
    checkReason: null,
    recentCommits: [],
  };
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
  let fetchOk = false;
  const branchName = coreBranchName();
  const upstreamRef = `origin/${branchName}`;

  if (existsSync(join(coreDir, ".git"))) {
    currentCommit = safeExec("git rev-parse --short HEAD", coreDir) || "";
    currentCommitDate = safeExec('git log -1 --format="%ci" HEAD', coreDir) || "";
    currentCommitMsg = safeExec('git log -1 --format="%s" HEAD', coreDir) || "";
    currentBranch = safeExec("git rev-parse --abbrev-ref HEAD", coreDir) || "master";

    // Fetch origin silently to compare commits (async). The timeout is generous
    // on purpose: a fetch killed mid-transfer leaves the tracking ref stale, and
    // every answer computed from a stale ref is a false "up to date" — exactly
    // how the dsh-v0.1.7-alpha.1 release (1299 commits + a new tag) stayed
    // invisible behind the old hard 4s kill.
    const fetch = await asyncExec(
      `GIT_TERMINAL_PROMPT=0 git fetch origin ${branchName} --tags --quiet`,
      coreDir,
      60000
    );
    fetchOk = fetch.ok;
  }

  let latestCommit = currentCommit;
  let latestCommitDate = currentCommitDate;
  let latestCommitMsg = currentCommitMsg;
  let latestVersion = currentVersion;
  let behindCount = 0;
  let behindCountExact = true;
  let checkStale = false;
  let checkReason = null;
  const recentCommits = [];

  if (existsSync(join(coreDir, ".git")) && fetchOk) {
    latestCommit = safeExec(`git rev-parse --short ${upstreamRef}`, coreDir) || currentCommit;
    latestCommitDate = safeExec(`git log -1 --format="%ci" ${upstreamRef}`, coreDir) || currentCommitDate;
    latestCommitMsg = safeExec(`git log -1 --format="%s" ${upstreamRef}`, coreDir) || currentCommitMsg;

    // 1. Try reading version from remote origin/<branch>:package.json
    try {
      const remotePkgJson = safeExec(`git show ${upstreamRef}:package.json`, coreDir);
      if (remotePkgJson) {
        const parsed = JSON.parse(remotePkgJson);
        if (parsed && parsed.version) {
          latestVersion = parsed.version;
        }
      }
    } catch {}

    // 2. If tag exists, compare or use tag
    const tag = safeExec(`git describe --tags --abbrev=0 ${upstreamRef}`, coreDir);
    if (tag) {
      const cleanTag = tag.replace(/^dsh-v?/, "");
      if (cleanTag && latestVersion === currentVersion) {
        latestVersion = cleanTag;
      }
    }

    const behindStr = safeExec(`git rev-list --count HEAD..${upstreamRef}`, coreDir);
    behindCount = parseInt(behindStr, 10) || 0;
    behindCountExact = true;

    const logLines = safeExec(`git log -n 12 --format="%h%x09%an%x09%ci%x09%s" ${upstreamRef}`, coreDir);
    if (logLines) {
      for (const line of logLines.split("\n")) {
        const [sha, author, date, message] = line.split("\t");
        if (sha) {
          recentCommits.push({ sha, author, date, message });
        }
      }
    }
  } else if (existsSync(join(coreDir, ".git"))) {
    // Fetch failed (typically a hard timeout killing a large delta mid
    // transfer). Never answer from the possibly-stale tracking ref — fall back
    // to a lightweight ls-remote so a moved upstream is still detected instead
    // of being silently reported as "up to date".
    const ls = await asyncExec("GIT_TERMINAL_PROMPT=0 git ls-remote --heads --tags origin", coreDir, 10000);
    const lines = ls.ok ? ls.out.split("\n") : [];
    const remoteHeadSha = ls.ok ? pickRemoteHeadSha(lines, branchName) : "";
    const tagVersion = ls.ok ? pickLatestTagVersion(lines) : null;

    if (!ls.ok) {
      checkStale = true;
      checkReason = "network-unreachable";
      latestVersion = null;
    } else if (!remoteHeadSha) {
      checkStale = true;
      checkReason = "no-upstream-branch";
      latestVersion = tagVersion;
    } else {
      const localSha = safeExec("git rev-parse HEAD", coreDir);
      const moved = !!localSha && remoteHeadSha !== localSha;
      latestCommit = moved ? remoteHeadSha.slice(0, 10) : currentCommit;
      latestVersion = tagVersion || (moved ? null : currentVersion);
      behindCount = moved ? 1 : 0; // at least one; the exact count needs a successful fetch
      behindCountExact = !moved;
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
    remoteVersion: latestVersion,
    latestCommit,
    remoteCommit: latestCommit,
    latestCommitDate,
    latestCommitMsg,
    behindCount,
    behindCountExact,
    hasUpdate: behindCount > 0,
    fetchOk,
    checkStale,
    checkReason,
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

            // Prefer a git checkout over a plain copy when the same plugin id is
            // discovered in multiple places (e.g. a ~/.dsh/plugins deployment copy
            // shadowing the ~/ workspace checkout): update checks and one-click
            // upgrades need the real .git directory.
            const existingEntry = pluginsMap.get(id);
            const candidateIsGit = existsSync(join(full, ".git"));
            const preferCandidate =
              !existingEntry ||
              (candidateIsGit &&
                existingEntry.path &&
                !existsSync(join(existingEntry.path, ".git")));
            if (preferCandidate) {
              const descInfo = readPluginDescriptions(full, pPkg);
              pluginsMap.set(id, {
                id,
                name: id,
                dirName: entry,
                path: full,
                version: pPkg.version || "1.0.0",
                description: descInfo.description,
                descriptionZh: descInfo.descriptionZh,
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
    let descriptionZh = "";
    const pluginPkgPath = join(profileDir, profile, "node_modules", b, "package.json");
    if (existsSync(pluginPkgPath)) {
      try {
        const pPkg = JSON.parse(readFileSync(pluginPkgPath, "utf8"));
        version = pPkg.version || version;
        const descInfo = readPluginDescriptions(join(profileDir, profile, "node_modules", b), pPkg);
        description = descInfo.description;
        descriptionZh = descInfo.descriptionZh;
      } catch {}
    } else if (deps[b] && (deps[b].startsWith("file:") || deps[b].startsWith("link:"))) {
      description = `Local package: ${deps[b].replace(/^(file|link):/, "")}`;
    }

    let pluginPath = "";
    if (deps[b] && (deps[b].startsWith("file:") || deps[b].startsWith("link:"))) {
      const rawPath = deps[b].replace(/^(file|link):/, "");
      pluginPath = resolve(profileDir, profile, rawPath);
    }
    const isSelf = b === "dsh-plugin-update-checker";
    pluginsMap.set(b, {
      id: b,
      name: b,
      dirName: b,
      path: pluginPath,
      version,
      description,
      descriptionZh,
      repositoryUrl: resolveRepoUrl(null, pluginPath),
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
      let descriptionZh = "";
      if (pPath && existsSync(join(pPath, "package.json"))) {
        try {
          const pPkg = JSON.parse(readFileSync(join(pPath, "package.json"), "utf8"));
          version = pPkg.version || version;
          const descInfo = readPluginDescriptions(pPath, pPkg);
          description = descInfo.description;
          descriptionZh = descInfo.descriptionZh;
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
          descriptionZh,
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
      if (typeof sctx.settings?.register === "function") {
        sctx.settings.register("update-checker", Config, { base: cachedPluginConfig });
      }
    } catch (e) {
      ctx.logger?.warn?.("[update-checker] settings registration:", e);
    }
  });

  ctx.on("settings/document-updated", (ns) => {
    if (ns === "update-checker") {
      const entries = ctx.root?.configEditor?.entries?.() || [];
      const entry = entries.find((r) => r.options?.id === "update-checker");
      if (entry?.options?.config) {
        cachedPluginConfig = { ...cachedPluginConfig, ...entry.options.config };
      }
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
          if (!cachedState.core) {
            cachedState.core = getLocalCoreStatus();
          }
          if (!cachedState.plugins || cachedState.plugins.length === 0) {
            cachedState.plugins = rescanPluginsPreservingGitState();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, data: cachedState }));

          // Stale-While-Revalidate: trigger background check if never checked or last check is older than 30m
          const STALE_MS = 30 * 60 * 1000;
          const isStale = !cachedState.lastChecked || (Date.now() - new Date(cachedState.lastChecked).getTime() > STALE_MS);
          if (isStale && !cachedState.isChecking) {
            runFullCheck().catch(() => {});
          }
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
          // `pull` is followed by `prune`: when upstream deletes or renames a
          // workspace package, the gitignored build leftovers of its old path
          // survive the pull and the build's `packages/*/*` workspace glob picks
          // their stale `lib/types/*.js` up as entries — which fails the build
          // against the new sources (this hid the 0.1.7-alpha.1 upgrade twice).
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

PRE=$(git rev-parse HEAD 2>/dev/null || true)

echo ""
echo "[PHASE] pull | Pulling upstream updates (git pull --ff-only)"
if ! git pull --ff-only origin master; then
  echo "[FAIL] git pull failed - upgrade aborted"
  exit 20
fi

echo ""
echo "[PHASE] prune | Pruning build leftovers of removed packages"
if [ -n "$PRE" ]; then
  git diff --no-renames --name-only --diff-filter=D "$PRE"..HEAD | grep -E '(^|/)package\\.json$' | while IFS= read -r f; do
    d=$(dirname "$f")
    [ "$d" = "." ] && continue
    [ -d "$d" ] || continue
    [ -f "$d/package.json" ] && continue
    [ -n "$(git ls-files "$d")" ] && continue
    for e in lib node_modules .typecheck; do
      if [ -e "$d/$e" ]; then
        echo "[INFO] removing generated leftovers: $d/$e"
        rm -rf "$d/$e"
      fi
    done
    rmdir "$d" 2>/dev/null || true
  done
else
  echo "[INFO] unknown base commit; skipping prune"
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
              const isGit = pluginDir && existsSync(join(pluginDir, ".git"));
              const isHindsight = plugin?.id === "hindsight" || plugin?.npmPackage === "@vectorize-io/hindsight-coding-agents";
              const isNpm = Boolean(isHindsight || plugin?.npmPackage || plugin?.gitState?.type === "npm");

              if (!isGit && !isNpm) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    ok: false,
                    error: `Plugin ${pluginId} is neither a git checkout nor an npm package; one-click upgrade is unavailable`,
                  })
                );
                return;
              }

              resetUpgradeRuntime({ type: "plugin", id: pluginId, name: plugin?.name || pluginId });

              if (isHindsight) {
                const upgradeScript = `
set -u
echo ""
echo "[PHASE] install | Updating Hindsight coding agents runtime via npx..."
if ! npx --yes @vectorize-io/hindsight-coding-agents@latest update; then
  echo "[FAIL] npx update failed - upgrade aborted"
  exit 30
fi

echo ""
echo "[PHASE] sync | Verifying updated Hindsight version..."
if [ -f "/root/.hindsight/coding-agents/package.json" ]; then
  NEW_VER=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync("/root/.hindsight/coding-agents/package.json")).version); } catch {}')
  echo "[INFO] Hindsight runtime successfully upgraded to v$NEW_VER"
else
  echo "[WARN] Could not find package.json in /root/.hindsight/coding-agents"
fi

echo ""
echo "=== Hindsight Upgrade Completed at $(date) ==="
`;
                const child = startUpgradeScript(upgradeScript, resolveDshHome());
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
                return;
              }

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

    const intervalMs = config?.checkIntervalMinutes
      ? config.checkIntervalMinutes * 60 * 1000
      : (config?.checkIntervalHours ? config.checkIntervalHours * 3600 * 1000 : 30 * 60 * 1000);
    ctx.logger?.info?.(`[update-checker] Background check scheduled every ${Math.round(intervalMs / 60000)} minutes`);
    setInterval(() => {
      runFullCheck().catch(() => {});
    }, intervalMs);
  }

  ctx.logger?.info?.("[update-checker] DeepSeek Harness System & Plugin Manager initialized");
}
