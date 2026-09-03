/**
 * dsh-plugin-update-checker — Client half (Web UI Settings Card) (Version 1.4.0)
 *
 * 100% aligned with official DSH PluginCard design specification.
 * Full reactive adaptation for Light Mode and Dark Mode.
 * Fixed 4-column single-row layout and accurate API routing.
 * Live upgrade progress: streams phase + log tail from the server.
 * Per-plugin git update badges and one-click plugin update button.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-update-checker",
  factory: (require) => {
    const exports = {};
    const React = require("react");
    const { useState, useEffect, useCallback } = React;
    const { jsxs, jsx } = require("react/jsx-runtime");
    const { IconChevronDownOutline14 } = require("@deepseek-ai/dsh-client-ui-primitives");

    const NS = "settings.plugin.update-checker";

    const zh = {
      title: "系统与插件管理",
      description: "内核升级监控与扩展插件生命周期管理",
      currentVersion: "当前版本",
      latestVersion: "远程最新",
      status: "状态",
      upToDate: "已是最新",
      updateAvailable: "发现更新",
      checking: "检查中…",
      checkBtn: "检查更新",
      upgradeBtn: "一键升级",
      upgrading: "升级中…",
      upgradeConfirm: "确定要执行后台 git pull 与重新编译吗？",
      lastChecked: "上次检查",
      never: "从未",
      commitsTab: "提交记录",
      pluginsTab: "插件管理",
      logsTab: "升级日志",
      noCommits: "暂无提交记录",
      noPlugins: "暂无扫描到第三方插件",
      aligned: "0 (已对齐)",
      behindMsg: "落后 {count} 提交",
      enabled: "已启用",
      disabled: "已停用",
      builtin: "官方内置",
      workspace: "本地工作区",
      profile: "Profile 挂载",
      systemDaemon: "系统服务",
      external: "独立安装",
      uninstall: "卸载",
      uninstallConfirm: "确定要从 Profile 中卸载插件 {name} 吗？",
      uninstallSuccess: "插件 {name} 卸载成功！",
      restartServer: "重启服务生效",
      restarting: "正在重启…",
      restartPrompt: "插件配置已更改，建议重启 Web 服务以完全生效。",
      upgradedReload: "升级完成！正在重启服务并刷新页面…",
      upgradeFailed: "升级失败，请查看日志",
      upgradeSuccessRestart: "升级完成！点击「重启服务」应用新版本。",
      phaseStash: "暂存本地修改",
      phasePull: "拉取上游更新",
      phaseUnstash: "恢复本地修改",
      phaseInstall: "安装依赖",
      phaseBuild: "编译内核",
      phaseSync: "同步 Profile 依赖",
      pluginUpToDate: "最新",
      pluginUncheckable: "无法检查",
      pluginUpdateBtn: "更新",
      pluginUpdateConfirm: "确定要升级插件 {name} 吗？将执行 git stash → pull → pnpm install。",
      pluginUpdateFailed: "插件升级失败，请查看日志",
      reasonNoPath: "无本地目录",
      reasonNotGit: "非 Git 安装",
      reasonNoRemote: "未配置远端仓库",
      reasonNoUpstream: "远端分支不存在",
      reasonDetachedHead: "处于 detached HEAD 状态",
      reasonGitFailed: "Git 命令执行失败",
      reasonInspectFailed: "检查失败",
    };

    const en = {
      title: "System & Plugins",
      description: "Core update monitor and extension plugin lifecycle management",
      currentVersion: "Current Version",
      latestVersion: "Remote Latest",
      status: "Status",
      upToDate: "Up to Date",
      updateAvailable: "Update Available",
      checking: "Checking…",
      checkBtn: "Check for Updates",
      upgradeBtn: "One-Click Upgrade",
      upgrading: "Upgrading…",
      upgradeConfirm: "Are you sure you want to pull and rebuild in the background?",
      lastChecked: "Last Checked",
      never: "Never",
      commitsTab: "Commits",
      pluginsTab: "Plugins",
      logsTab: "Upgrade Logs",
      noCommits: "No commits available",
      noPlugins: "No plugins found",
      aligned: "0 (Aligned)",
      behindMsg: "{count} commits behind",
      enabled: "Enabled",
      disabled: "Disabled",
      builtin: "Built-in",
      workspace: "Workspace",
      profile: "Profile",
      systemDaemon: "Daemon",
      external: "External",
      uninstall: "Uninstall",
      uninstallConfirm: "Are you sure you want to uninstall {name}?",
      uninstallSuccess: "Plugin {name} uninstalled successfully!",
      restartServer: "Restart Service",
      restarting: "Restarting…",
      restartPrompt: "Plugin configuration changed. Please restart Web server to apply.",
      upgradedReload: "Upgrade completed! Reloading…",
      upgradeFailed: "Upgrade failed, please inspect logs",
      upgradeSuccessRestart: "Upgrade completed! Restart the service to apply the new version.",
      phaseStash: "Stashing local changes",
      phasePull: "Pulling upstream updates",
      phaseUnstash: "Restoring local changes",
      phaseInstall: "Installing dependencies",
      phaseBuild: "Building harness packages",
      phaseSync: "Syncing profile dependencies",
      pluginUpToDate: "Up to date",
      pluginUncheckable: "Can't check",
      pluginUpdateBtn: "Update",
      pluginUpdateConfirm: "Upgrade plugin {name}? This runs git stash → pull → pnpm install.",
      pluginUpdateFailed: "Plugin upgrade failed, please inspect logs",
      reasonNoPath: "No local directory",
      reasonNotGit: "Not a git checkout",
      reasonNoRemote: "No remote configured",
      reasonNoUpstream: "No upstream branch",
      reasonDetachedHead: "Detached HEAD state",
      reasonGitFailed: "Git command failed",
      reasonInspectFailed: "Inspection failed",
    };

    // SVG Icons
    function SystemManageIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 16, height: 16, flexShrink: 0, color: "var(--dsw-alias-brand-primary, #60a5fa)", ...props.style },
        children: [
          jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", strokeWidth: 2 }),
          jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21", strokeWidth: 2 }),
          jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21", strokeWidth: 2 }),
        ],
      });
    }

    function RefreshIconSvg({ spinning }) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: {
          width: 14,
          height: 14,
          animation: spinning ? "dsh-spin 1s linear infinite" : "none",
        },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
          }),
        ],
      });
    }

    function PluginIconSvg() {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13 },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
          }),
        ],
      });
    }

    function GitCommitIconSvg() {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13 },
        children: [
          jsx("circle", { cx: "12", cy: "12", r: "3", strokeWidth: 2 }),
          jsx("line", { x1: "3", y1: "12", x2: "9", y2: "12", strokeWidth: 2 }),
          jsx("line", { x1: "15", y1: "12", x2: "21", y2: "12", strokeWidth: 2 }),
        ],
      });
    }

    function UpgradeIconSvg() {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13 },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
          }),
        ],
      });
    }

    function TrashIconSvg() {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 12, height: 12 },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
          }),
        ],
      });
    }

    function RestartIconSvg() {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 12, height: 12 },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M13 10V3L4 14h7v7l9-11h-7z",
          }),
        ],
      });
    }

    function ExternalLinkIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 11, height: 11, display: "inline-block", verticalAlign: "middle", ...props?.style },
        children: [
          jsx("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14",
          }),
        ],
      });
    }

    function GithubIconSvg(props) {
      return jsx("svg", {
        viewBox: "0 0 24 24",
        fill: "currentColor",
        style: { width: 12, height: 12, display: "inline-block", verticalAlign: "middle", ...props?.style },
        children: [
          jsx("path", {
            fillRule: "evenodd",
            clipRule: "evenodd",
            d: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
          }),
        ],
      });
    }

    if (typeof document !== "undefined" && !document.getElementById("dsh-spin-style")) {
      const s = document.createElement("style");
      s.id = "dsh-spin-style";
      s.textContent = "@keyframes dsh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
      document.head.appendChild(s);
    }

    function UpdateCheckerCard(props) {
      const rawT = props && typeof props.t === "function" ? props.t : null;
      const t = (key, params) => {
        let val = rawT ? rawT(key, params) : (zh[key] || en[key] || key);
        if (!val) val = zh[key] || en[key] || key;
        if (params && typeof val === "string") {
          for (const [k, v] of Object.entries(params)) {
            val = val.replace(new RegExp(`{${k}}`, "g"), String(v));
          }
        }
        return val;
      };
      const [open, setOpen] = useState(false);
      const [data, setData] = useState(null);
      const [checking, setChecking] = useState(false);
      const [upgrading, setUpgrading] = useState(false);
      const [upgradePhase, setUpgradePhase] = useState(null);
      const [restarting, setRestarting] = useState(false);
      const [activeTab, setActiveTab] = useState("plugins");
      const [logs, setLogs] = useState("");
      const [actionMsg, setActionMsg] = useState(null);
      const logsRef = React.useRef(null);

      const fetchStatus = useCallback(async () => {
        try {
          const res = await fetch("/api/update-checker/status");
          if (res.ok) {
            const json = await res.json();
            setData(json.data || json);
          }
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] status fetch failed:", e);
        }
      }, []);

      // The log endpoint answers text/plain — never parse it as JSON.
      const fetchLogs = useCallback(async () => {
        try {
          const res = await fetch("/api/update-checker/log");
          if (res.ok) {
            setLogs(await res.text());
          }
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] logs fetch failed:", e);
        }
      }, []);

      useEffect(() => {
        fetchStatus();
        const timer = setInterval(fetchStatus, 60000);
        return () => clearInterval(timer);
      }, [fetchStatus]);

      // Keep the streaming log pinned to the newest line.
      useEffect(() => {
        const el = logsRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [logs]);

      const handleCheck = async (e) => {
        if (e) e.stopPropagation();
        setChecking(true);
        try {
          const res = await fetch("/api/update-checker/check", { method: "POST" });
          if (res.ok) {
            const json = await res.json();
            setData(json.data || json);
          }
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] check failed:", e);
        } finally {
          setChecking(false);
        }
      };

      const PHASE_LOCALE_KEY = {
        stash: "phaseStash",
        pull: "phasePull",
        unstash: "phaseUnstash",
        install: "phaseInstall",
        build: "phaseBuild",
        sync: "phaseSync",
      };

      const GIT_REASON_LOCALE_KEY = {
        "no-local-path": "reasonNoPath",
        "not-a-git-checkout": "reasonNotGit",
        "no-remote": "reasonNoRemote",
        "no-upstream-branch": "reasonNoUpstream",
        "detached-head": "reasonDetachedHead",
        "git-command-failed": "reasonGitFailed",
        "inspect-failed": "reasonInspectFailed",
      };
      const gitReasonText = (reason) => {
        if (!reason) return "";
        const key = GIT_REASON_LOCALE_KEY[reason];
        return key ? t(key) : reason;
      };

      // Poll the lightweight status endpoint until the server reports the
      // upgrade process has really finished (not a blind timer). Shared by
      // core upgrades and per-plugin upgrades.
      const startUpgradePolling = (onFinished) => {
        const startedAt = Date.now();
        const POLL_MS = 1200;
        const MAX_MS = 20 * 60 * 1000;
        const timer = setInterval(async () => {
          if (Date.now() - startedAt > MAX_MS) {
            clearInterval(timer);
            setUpgrading(false);
            setUpgradePhase(null);
            setActionMsg({ type: "error", text: t("upgradeFailed") });
            if (onFinished) onFinished(false);
            return;
          }
          try {
            const sres = await fetch("/api/update-checker/upgrade/status");
            if (!sres.ok) return;
            const json = await sres.json();
            const st = json.data || json;
            if (st.tail) setLogs(st.tail);
            if (st.running) {
              const key = PHASE_LOCALE_KEY[st.phase];
              setUpgradePhase(key ? t(key) : st.phaseLabel || null);
              return;
            }
            clearInterval(timer);
            setUpgrading(false);
            setUpgradePhase(null);
            fetchStatus();
            fetchLogs();
            const ok = st.result ? st.result.success === true : false;
            if (onFinished) onFinished(ok);
          } catch {}
        }, POLL_MS);
      };

      const handleUpgrade = async (e) => {
        if (e) e.stopPropagation();
        if (!confirm(t("upgradeConfirm"))) return;
        setUpgrading(true);
        setUpgradePhase(null);
        setLogs("");
        setActionMsg(null);
        setActiveTab("logs");
        try {
          const res = await fetch("/api/update-checker/upgrade", { method: "POST" });
          if (!res.ok) {
            let message = t("upgradeFailed");
            try {
              const j = await res.json();
              if (j && j.message) message = j.message;
            } catch {}
            setActionMsg({ type: "error", text: message });
            setUpgrading(false);
            return;
          }

          startUpgradePolling((ok) =>
            setActionMsg(
              ok
                ? { type: "info", text: t("upgradeSuccessRestart") }
                : { type: "error", text: t("upgradeFailed") }
            )
          );
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] upgrade failed:", e);
          setActionMsg({ type: "error", text: t("upgradeFailed") });
          setUpgrading(false);
          setUpgradePhase(null);
        }
      };

      const handleUpgradePlugin = async (plugin, e) => {
        if (e) e.stopPropagation();
        const pName = plugin.id || plugin.name;
        if (!confirm(t("pluginUpdateConfirm", { name: pName }))) return;
        setUpgrading(true);
        setUpgradePhase(null);
        setLogs("");
        setActionMsg(null);
        setActiveTab("logs");
        try {
          const res = await fetch("/api/plugins/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pluginId: pName }),
          });
          if (!res.ok) {
            let message = t("pluginUpdateFailed");
            try {
              const j = await res.json();
              if (j && (j.message || j.error)) message = j.message || j.error;
            } catch {}
            setActionMsg({ type: "error", text: message });
            setUpgrading(false);
            return;
          }

          startUpgradePolling((ok) =>
            setActionMsg(
              ok
                ? { type: "info", text: t("upgradeSuccessRestart") }
                : { type: "error", text: t("pluginUpdateFailed") }
            )
          );
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] plugin update failed:", e);
          setActionMsg({ type: "error", text: t("pluginUpdateFailed") });
          setUpgrading(false);
          setUpgradePhase(null);
        }
      };

      const handleTogglePlugin = async (plugin, e) => {
        if (e) e.stopPropagation();
        try {
          const res = await fetch("/api/plugins/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pluginId: plugin.id || plugin.name, enabled: !plugin.enabled }),
          });
          if (res.ok) {
            await fetchStatus();
            setActionMsg({ type: "warn", text: t("restartPrompt") });
          }
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] plugin toggle failed:", e);
        }
      };

      const handleUninstallPlugin = async (plugin, e) => {
        if (e) e.stopPropagation();
        const pName = plugin.id || plugin.name;
        if (!confirm(t("uninstallConfirm", { name: pName }))) return;
        try {
          const res = await fetch("/api/plugins/uninstall", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pluginId: pName }),
          });
          if (res.ok) {
            await fetchStatus();
            setActionMsg({ type: "warn", text: t("uninstallSuccess", { name: pName }) + " " + t("restartPrompt") });
          }
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] plugin uninstall failed:", e);
        }
      };

      const handleRestartServer = async (e) => {
        if (e) e.stopPropagation();
        setRestarting(true);
        try {
          await fetch("/api/plugins/restart", { method: "POST" });
          setTimeout(() => {
            window.location.reload();
          }, 3500);
        } catch (e) {
          console.warn("[dsh-plugin-update-checker] restart request sent");
          setTimeout(() => {
            window.location.reload();
          }, 4000);
        }
      };

      const core = data?.core;
      const plugins = data?.plugins || [];
      const recentCommits = data?.recentCommits || core?.recentCommits || [];
      const hasUpdate = core?.hasUpdate;
      const behindCount = core?.behindCount || 0;
      const lastCheckedTime = data?.lastChecked || core?.lastChecked;

      const formatTime = (iso) => {
        if (!iso) return t("never");
        try {
          const d = new Date(iso);
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        } catch (e) {
          return iso;
        }
      };

      return jsx("li", {
        style: {
          listStyle: "none",
          border: "1px solid " + (open ? "var(--dsw-alias-label-dimmed, rgba(120,120,120,0.3))" : "var(--dsw-alias-border-l2, rgba(0,0,0,0.08))"),
          borderRadius: "12px",
          background: open ? "var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.7))" : "var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.4))",
          transition: "border-color .16s, background .16s",
        },
        children: jsxs("div", {
          children: [
            // Header Bar
            jsxs("button", {
              type: "button",
              onClick: () => setOpen(!open),
              style: {
                width: "100%",
                appearance: "none",
                border: 0,
                background: "none",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "12px",
              },
              children: [
                jsxs("span", {
                  style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" },
                  children: [
                    jsxs("span", {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "15px",
                        fontWeight: "600",
                        lineHeight: 1.4,
                        color: "var(--dsw-alias-label-primary, #0f172a)",
                      },
                      children: [jsx(SystemManageIconSvg, {}), jsx("span", { children: t("title") })],
                    }),
                    jsx("span", {
                      style: { fontSize: "13px", lineHeight: 1.5, color: "var(--dsw-alias-label-tertiary, #64748b)" },
                      children: t("description"),
                    }),
                  ],
                }),
                hasUpdate
                  ? jsx("span", {
                      style: {
                        flex: "none",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "11px",
                        lineHeight: "17px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "rgba(255, 152, 0, 0.15)",
                        color: "#ea580c",
                        border: "1px solid rgba(255, 152, 0, 0.3)",
                      },
                      children: [
                        jsx("span", {
                          style: {
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#ea580c",
                            display: "inline-block",
                          },
                        }),
                        jsx("span", { children: t("updateAvailable") }),
                      ],
                    })
                  : jsx("span", {
                      style: {
                        flex: "none",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "11px",
                        lineHeight: "17px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#10b981",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                      },
                      children: [
                        jsx("span", {
                          style: {
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#10b981",
                            display: "inline-block",
                          },
                        }),
                        jsx("span", { children: t("upToDate") }),
                      ],
                    }),
                jsx(IconChevronDownOutline14, {
                  style: {
                    flex: "none",
                    color: "var(--dsw-alias-label-tertiary, #64748b)",
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .16s",
                  },
                }),
              ],
            }),

            // Expanded Body Panel
            open
              ? jsxs("div", {
                  style: {
                    borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
                    margin: "0 16px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  },
                  children: [
                    // Single Row 4-Column Metric Cards (Guaranteed 1 row on all screen widths)
                    jsxs("div", {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "8px",
                      },
                      children: [
                        // Card 1: Current Version
                        jsxs("div", {
                          style: {
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #64748b)", marginBottom: "3px", whiteSpace: "nowrap" },
                              children: t("currentVersion"),
                            }),
                            jsxs("div", {
                              style: {
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "var(--dsw-alias-label-primary, #0f172a)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              },
                              children: [
                                jsx("span", { children: core?.currentVersion || "0.1.0-rc.8" }),
                                core?.currentCommit
                                  ? jsxs("a", {
                                      href: `https://github.com/deepseek-ai/deepseek-harness/commit/${core.currentCommit}`,
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                      title: "在 GitHub 中查看当前版本提交",
                                      style: {
                                        fontSize: "10px",
                                        fontWeight: "normal",
                                        fontFamily: "monospace",
                                        background: "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
                                        padding: "1px 4px",
                                        borderRadius: "3px",
                                        color: "var(--dsw-alias-brand-primary, #2563eb)",
                                        textDecoration: "none",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "2px",
                                        cursor: "pointer",
                                      },
                                      children: [
                                        core.currentCommit.slice(0, 6),
                                        jsx(ExternalLinkIconSvg, { style: { width: 9, height: 9 } }),
                                      ],
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        }),

                        // Card 2: Remote Latest
                        jsxs("div", {
                          style: {
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #64748b)", marginBottom: "3px", whiteSpace: "nowrap" },
                              children: t("latestVersion"),
                            }),
                            jsxs("div", {
                              style: {
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "var(--dsw-alias-label-primary, #0f172a)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              },
                              children: [
                                jsx("span", { children: core?.remoteVersion || core?.currentVersion || "0.1.0-rc.8" }),
                                core?.remoteCommit
                                  ? jsxs("a", {
                                      href: `https://github.com/deepseek-ai/deepseek-harness/commit/${core.remoteCommit}`,
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                      title: "在 GitHub 中查看远程最新提交",
                                      style: {
                                        fontSize: "10px",
                                        fontWeight: "normal",
                                        fontFamily: "monospace",
                                        background: "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
                                        padding: "1px 4px",
                                        borderRadius: "3px",
                                        color: "var(--dsw-alias-brand-primary, #2563eb)",
                                        textDecoration: "none",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "2px",
                                        cursor: "pointer",
                                      },
                                      children: [
                                        core.remoteCommit.slice(0, 6),
                                        jsx(ExternalLinkIconSvg, { style: { width: 9, height: 9 } }),
                                      ],
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        }),

                        // Card 3: Status
                        jsxs("div", {
                          style: {
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #64748b)", marginBottom: "3px", whiteSpace: "nowrap" },
                              children: t("status"),
                            }),
                            jsx("div", {
                              style: {
                                fontSize: "13px",
                                fontWeight: "600",
                                color: behindCount > 0 ? "#ea580c" : "#10b981",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              },
                              children: behindCount > 0 ? t("behindMsg", { count: behindCount }) : t("aligned"),
                            }),
                          ],
                        }),

                        // Card 4: Last Checked + Check Button
                        jsxs("div", {
                          style: {
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "4px",
                            minWidth: 0,
                          },
                          children: [
                            jsxs("div", {
                              style: { overflow: "hidden", minWidth: 0 },
                              children: [
                                jsx("div", {
                                  style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #64748b)", marginBottom: "3px", whiteSpace: "nowrap" },
                                  children: t("lastChecked"),
                                }),
                                jsx("div", {
                                  style: { fontSize: "12px", color: "var(--dsw-alias-label-primary, #0f172a)", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                                  children: formatTime(lastCheckedTime),
                                }),
                              ],
                            }),
                            jsx("button", {
                              type: "button",
                              disabled: checking,
                              onClick: handleCheck,
                              title: t("checkBtn"),
                              style: {
                                padding: "4px 5px",
                                borderRadius: "6px",
                                border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                                background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))",
                                color: "var(--dsw-alias-brand-primary, #2563eb)",
                                cursor: checking ? "default" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              },
                              children: jsx(RefreshIconSvg, { spinning: checking }),
                            }),
                          ],
                        }),
                      ],
                    }),

                    // Action Banner (e.g. Restart prompt)
                    actionMsg
                      ? jsxs("div", {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            background:
                              actionMsg.type === "warn"
                                ? "rgba(255, 152, 0, 0.12)"
                                : actionMsg.type === "info"
                                ? "rgba(59, 130, 246, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                            border:
                              "1px solid " +
                              (actionMsg.type === "warn"
                                ? "rgba(255, 152, 0, 0.3)"
                                : actionMsg.type === "info"
                                ? "rgba(59, 130, 246, 0.3)"
                                : "rgba(239, 68, 68, 0.3)"),
                            fontSize: "12px",
                            color:
                              actionMsg.type === "warn"
                                ? "#ea580c"
                                : actionMsg.type === "info"
                                ? "#2563eb"
                                : "#ef4444",
                          },
                          children: [
                            jsx("span", { children: actionMsg.text }),
                            jsx("button", {
                              type: "button",
                              disabled: restarting,
                              onClick: handleRestartServer,
                              style: {
                                padding: "4px 10px",
                                borderRadius: "4px",
                                border: "none",
                                background: "#3b82f6",
                                color: "#ffffff",
                                fontSize: "11px",
                                fontWeight: "500",
                                cursor: restarting ? "default" : "pointer",
                                opacity: restarting ? 0.6 : 1,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                flexShrink: 0,
                              },
                              children: [jsx(RestartIconSvg, {}), restarting ? t("restarting") : t("restartServer")],
                            }),
                          ],
                        })
                      : null,

                    // Tab Switcher + Upgrade Button Bar
                    jsxs("div", {
                      style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "2px" },
                      children: [
                        jsxs("div", {
                          style: { display: "flex", gap: "4px" },
                          children: [
                            jsxs("button", {
                              type: "button",
                              onClick: () => setActiveTab("plugins"),
                              style: {
                                padding: "5px 12px",
                                borderRadius: "6px",
                                border: "none",
                                background: activeTab === "plugins" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                                color: activeTab === "plugins" ? "var(--dsw-alias-brand-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #64748b)",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: activeTab === "plugins" ? "600" : "400",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              },
                              children: [jsx(PluginIconSvg, {}), `${t("pluginsTab")} (${plugins.length})`],
                            }),
                            jsxs("button", {
                              type: "button",
                              onClick: () => setActiveTab("commits"),
                              style: {
                                padding: "5px 12px",
                                borderRadius: "6px",
                                border: "none",
                                background: activeTab === "commits" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                                color: activeTab === "commits" ? "var(--dsw-alias-brand-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #64748b)",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: activeTab === "commits" ? "600" : "400",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              },
                              children: [jsx(GitCommitIconSvg, {}), t("commitsTab")],
                            }),
                            upgrading
                              ? jsx("button", {
                                  type: "button",
                                  onClick: () => {
                                    setActiveTab("logs");
                                    fetchLogs();
                                  },
                                  style: {
                                    padding: "5px 12px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: activeTab === "logs" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                                    color: activeTab === "logs" ? "var(--dsw-alias-brand-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #64748b)",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: activeTab === "logs" ? "600" : "400",
                                  },
                                  children: t("logsTab"),
                                })
                              : null,
                          ],
                        }),
                        jsxs("div", {
                          style: { display: "flex", alignItems: "center", gap: "8px" },
                          children: [
                            jsxs("button", {
                              type: "button",
                              disabled: restarting,
                              onClick: handleRestartServer,
                              title: t("restartServer"),
                              style: {
                                padding: "5px 12px",
                                borderRadius: "6px",
                                border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                                background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))",
                                color: "var(--dsw-alias-label-primary, #0f172a)",
                                fontWeight: "500",
                                cursor: restarting ? "default" : "pointer",
                                opacity: restarting ? 0.6 : 1,
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              },
                              children: [jsx(RestartIconSvg, {}), restarting ? t("restarting") : t("restartServer")],
                            }),
                            hasUpdate
                              ? jsxs("button", {
                                  type: "button",
                                  disabled: upgrading,
                                  onClick: handleUpgrade,
                                  style: {
                                    padding: "5px 14px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: "#3b82f6",
                                    color: "#ffffff",
                                    fontWeight: "500",
                                    cursor: upgrading ? "default" : "pointer",
                                    opacity: upgrading ? 0.6 : 1,
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                  },
                                  children: [jsx(UpgradeIconSvg, {}), upgrading ? t("upgrading") + (upgradePhase ? " · " + upgradePhase : "") : t("upgradeBtn")],
                                })
                              : null,
                          ],
                        }),
                      ],
                    }),

                    // Tab 1: Plugin Manager List (With Uninstall & Toggle)
                    activeTab === "plugins"
                      ? jsx("div", {
                          style: {
                            maxHeight: "280px",
                            overflowY: "auto",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                          },
                          children:
                            plugins.length > 0
                              ? jsxs("div", {
                                  style: { display: "flex", flexDirection: "column", gap: "6px" },
                                  children: plugins.map((p, i) =>
                                    jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          fontSize: "12px",
                                          padding: "8px 0",
                                          borderBottom:
                                            i < plugins.length - 1
                                              ? "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))"
                                              : "none",
                                          gap: "10px",
                                        },
                                        children: [
                                          // Left: Plugin Details
                                          jsxs("div", {
                                            style: { flex: 1, minWidth: 0 },
                                            children: [
                                              jsxs("div", {
                                                style: {
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "6px",
                                                  fontWeight: "600",
                                                  color: "var(--dsw-alias-label-primary, #0f172a)",
                                                },
                                                children: [
                                                  (p.repositoryUrl || (p.gitState && p.gitState.remoteUrl) || null)
                                                    ? jsxs("a", {
                                                        href: p.repositoryUrl || (p.gitState && p.gitState.remoteUrl),
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        title: `在 GitHub 中打开 ${p.name}`,
                                                        style: {
                                                          whiteSpace: "nowrap",
                                                          overflow: "hidden",
                                                          textOverflow: "ellipsis",
                                                          color: "var(--dsw-alias-brand-primary, #2563eb)",
                                                          textDecoration: "none",
                                                          display: "inline-flex",
                                                          alignItems: "center",
                                                          gap: "4px",
                                                          cursor: "pointer",
                                                        },
                                                        children: [
                                                          jsx(GithubIconSvg, {}),
                                                          jsx("span", { children: p.name }),
                                                          jsx(ExternalLinkIconSvg, { style: { width: 9, height: 9 } }),
                                                        ],
                                                      })
                                                    : jsx("span", {
                                                        style: {
                                                          whiteSpace: "nowrap",
                                                          overflow: "hidden",
                                                          textOverflow: "ellipsis",
                                                        },
                                                        children: p.name,
                                                      }),
                                                  p.source === "system-daemon"
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(16, 185, 129, 0.12)",
                                                          color: "#10b981",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        children: t("systemDaemon"),
                                                      })
                                                    : p.source === "external"
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(168, 85, 247, 0.12)",
                                                          color: "#a855f7",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        children: t("external"),
                                                      })
                                                    : p.source === "workspace"
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(59, 130, 246, 0.12)",
                                                          color: "var(--dsw-alias-brand-primary, #2563eb)",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        children: t("workspace"),
                                                      })
                                                    : null,
                                                  jsx("span", {
                                                    style: {
                                                      fontSize: "10px",
                                                      background: "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
                                                      padding: "1px 5px",
                                                      borderRadius: "3px",
                                                      fontFamily: "monospace",
                                                      color: "var(--dsw-alias-label-secondary, #475569)",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: p.version,
                                                  }),
                                                  // Git update badge: behind count / up to date / uncheckable reason
                                                  p.gitState && p.gitState.hasUpdate
                                                    ? jsxs("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(234, 88, 12, 0.14)",
                                                          color: "#ea580c",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          fontWeight: "600",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        title: p.gitState.branch
                                                          ? `${p.gitState.branch} · ${t("behindMsg", { count: p.gitState.behindCount || 0 })}`
                                                          : undefined,
                                                        children: t("behindMsg", { count: p.gitState.behindCount || 0 }),
                                                      })
                                                    : p.gitState && p.gitState.checkable
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(16, 185, 129, 0.10)",
                                                          color: "#10b981",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        children: t("pluginUpToDate"),
                                                      })
                                                    : p.gitState && !p.gitState.checkable
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
                                                          color: "var(--dsw-alias-label-tertiary, #64748b)",
                                                          padding: "1px 5px",
                                                          borderRadius: "3px",
                                                          whiteSpace: "nowrap",
                                                        },
                                                        title: gitReasonText(p.gitState.reason),
                                                        children: t("pluginUncheckable"),
                                                      })
                                                    : null,
                                                ],
                                              }),
                                              p.description
                                                ? jsx("div", {
                                                    style: {
                                                      fontSize: "11px",
                                                      color: "var(--dsw-alias-label-tertiary, #64748b)",
                                                      marginTop: "2px",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: p.description,
                                                  })
                                                : null,
                                            ],
                                          }),

                                          // Right: Update & Toggle & Uninstall Actions
                                          jsxs("div", {
                                            style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 },
                                            children: [
                                              // One-click update button (git plugins with upstream updates)
                                              p.gitState && p.gitState.hasUpdate && p.gitState.checkable && !p.isSelf
                                                ? jsx("button", {
                                                    type: "button",
                                                    onClick: (e) => handleUpgradePlugin(p, e),
                                                    title: t("pluginUpdateConfirm", { name: p.id || p.name }),
                                                    style: {
                                                      padding: "3px 8px",
                                                      borderRadius: "4px",
                                                      border: "1px solid rgba(59, 130, 246, 0.35)",
                                                      background: "rgba(59, 130, 246, 0.12)",
                                                      color: "var(--dsw-alias-brand-primary, #2563eb)",
                                                      fontSize: "11px",
                                                      fontWeight: "500",
                                                      cursor: "pointer",
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "4px",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: [jsx(RefreshIconSvg, {}), t("pluginUpdateBtn")],
                                                  })
                                                : null,

                                              // Toggle Enable/Disable button
                                              !p.isBuiltin
                                                ? jsx("button", {
                                                    type: "button",
                                                    onClick: (e) => handleTogglePlugin(p, e),
                                                    style: {
                                                      padding: "3px 8px",
                                                      borderRadius: "4px",
                                                      border: "1px solid " + (p.enabled ? "rgba(16, 185, 129, 0.3)" : "var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))"),
                                                      background: p.enabled ? "rgba(16, 185, 129, 0.12)" : "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
                                                      color: p.enabled ? "#10b981" : "var(--dsw-alias-label-tertiary, #64748b)",
                                                      fontSize: "11px",
                                                      fontWeight: "500",
                                                      cursor: "pointer",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: p.enabled ? t("enabled") : t("disabled"),
                                                  })
                                                : jsx("span", {
                                                    style: {
                                                      fontSize: "11px",
                                                      color: "#10b981",
                                                      padding: "3px 6px",
                                                      fontWeight: "500",
                                                    },
                                                    children: t("enabled"),
                                                  }),

                                              // Uninstall button
                                              p.removable && !p.isSelf
                                                ? jsxs("button", {
                                                    type: "button",
                                                    onClick: (e) => handleUninstallPlugin(p, e),
                                                    title: t("uninstall"),
                                                    style: {
                                                      padding: "3px 8px",
                                                      borderRadius: "4px",
                                                      border: "1px solid rgba(239, 68, 68, 0.25)",
                                                      background: "rgba(239, 68, 68, 0.08)",
                                                      color: "#ef4444",
                                                      fontSize: "11px",
                                                      fontWeight: "500",
                                                      cursor: "pointer",
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "4px",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: [jsx(TrashIconSvg, {}), t("uninstall")],
                                                  })
                                                : null,
                                            ],
                                          }),
                                        ],
                                      },
                                      p.id || i
                                    )
                                  ),
                                })
                              : jsx("div", {
                                  style: {
                                    fontSize: "12px",
                                    color: "var(--dsw-alias-label-tertiary, #64748b)",
                                    textAlign: "center",
                                    padding: "14px",
                                  },
                                  children: t("noPlugins"),
                                }),
                        })
                      : null,

                    // Tab 2: Commits List
                    activeTab === "commits"
                      ? jsx("div", {
                          style: {
                            maxHeight: "220px",
                            overflowY: "auto",
                            background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08))",
                          },
                          children:
                            recentCommits.length > 0
                              ? jsxs("div", {
                                  style: { display: "flex", flexDirection: "column", gap: "6px" },
                                  children: recentCommits.map((c, i) =>
                                    jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          fontSize: "12px",
                                          padding: "5px 0",
                                          borderBottom:
                                            i < recentCommits.length - 1
                                              ? "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))"
                                              : "none",
                                        },
                                        children: [
                                          jsxs("a", {
                                            href: `https://github.com/deepseek-ai/deepseek-harness/commit/${c.sha}`,
                                            target: "_blank",
                                            rel: "noopener noreferrer",
                                            title: `在 GitHub 中查看提交 ${c.sha}`,
                                            style: {
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "8px",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              marginRight: "10px",
                                              textDecoration: "none",
                                              color: "inherit",
                                              cursor: "pointer",
                                            },
                                            children: [
                                              jsxs("span", {
                                                style: {
                                                  fontFamily: "monospace",
                                                  background: "rgba(59,130,246,0.12)",
                                                  color: "var(--dsw-alias-brand-primary, #2563eb)",
                                                  padding: "1px 5px",
                                                  borderRadius: "3px",
                                                  fontSize: "11px",
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "3px",
                                                },
                                                children: [
                                                  c.sha,
                                                  jsx(ExternalLinkIconSvg, { style: { width: 8, height: 8 } }),
                                                ],
                                              }),
                                              jsx("span", {
                                                style: {
                                                  color: "var(--dsw-alias-label-primary, #0f172a)",
                                                },
                                                children: c.message,
                                              }),
                                            ],
                                          }),
                                          jsx("span", {
                                            style: {
                                              fontSize: "11px",
                                              color: "var(--dsw-alias-label-tertiary, #64748b)",
                                              flexShrink: 0,
                                            },
                                            children: c.date ? c.date.split(" ")[0] : "",
                                          }),
                                        ],
                                      },
                                      c.sha || i
                                    )
                                  ),
                                })
                              : jsx("div", {
                                  style: {
                                    fontSize: "12px",
                                    color: "var(--dsw-alias-label-tertiary, #64748b)",
                                    textAlign: "center",
                                    padding: "14px",
                                  },
                                  children: t("noCommits"),
                                }),
                        })
                      : null,

                    // Tab 3: Logs View
                    activeTab === "logs"
                      ? jsx("div", {
                          ref: logsRef,
                          style: {
                            maxHeight: "180px",
                            overflowY: "auto",
                            background: "var(--dsw-alias-bg-layer-1, #0f172a)",
                            borderRadius: "8px",
                            padding: "10px",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: "#10b981",
                            whiteSpace: "pre-wrap",
                          },
                          children: logs || "Waiting for logs...",
                        })
                      : null,
                  ],
                })
              : null,
          ],
        }),
      });
    }

    exports.inject = ["locale", "slots"];

    
    // ==========================================
    // Global Upgrade HUD & BeforeUnload Guard
    // ==========================================
    let isGlobalUpgrading = false;
    let globalUpgradeTimer = null;
    let globalStartedAt = 0;
    let globalLogExpanded = false;

    function ensureHudStyles() {
      if (document.getElementById("dsh-upgrade-hud-styles")) return;
      const s = document.createElement("style");
      s.id = "dsh-upgrade-hud-styles";
      s.textContent = `
        @keyframes dsh-hud-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.92); }
        }
        @keyframes dsh-hud-glow {
          0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 20px rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 32px rgba(56, 189, 248, 0.6); }
        }
        .dsh-hud-pill {
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999999;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(99, 102, 241, 0.45);
          color: #f8fafc;
          border-radius: 999px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          animation: dsh-hud-glow 3s infinite ease-in-out;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-sizing: border-box;
          max-width: 90vw;
        }
        .dsh-hud-pill.completed {
          border-color: rgba(16, 185, 129, 0.6);
          animation: none;
          box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 24px rgba(16, 185, 129, 0.4);
        }
        .dsh-hud-card {
          position: fixed;
          top: 60px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999998;
          width: 580px;
          max-width: 92vw;
          max-height: 280px;
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 12px;
          padding: 12px;
          color: #10b981;
          font-family: monospace;
          font-size: 11px;
          line-height: 1.5;
          overflow-y: auto;
          white-space: pre-wrap;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        }
      `;
      document.head.appendChild(s);
    }

    function initGlobalUpgradeGuard() {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      ensureHudStyles();

      // Intercept accidental page refresh/close
      window.addEventListener("beforeunload", (e) => {
        if (isGlobalUpgrading) {
          const msg = "DeepSeek Harness 内核正在进行全量编译升级，此时刷新可能导致版本不完整。确定要离开或刷新吗？";
          e.preventDefault();
          e.returnValue = msg;
          return msg;
        }
      });

      let hudEl = document.getElementById("dsh-global-upgrade-hud");
      if (!hudEl) {
        hudEl = document.createElement("div");
        hudEl.id = "dsh-global-upgrade-hud";
        hudEl.style.display = "none";
        document.body.appendChild(hudEl);
      }

      const pollStatus = async () => {
        try {
          const res = await fetch("/api/update-checker/upgrade/status");
          if (!res.ok) return;
          const json = await res.json();
          const st = json.data || json;

          if (st.running) {
            isGlobalUpgrading = true;
            if (!globalStartedAt) {
              globalStartedAt = st.startedAt ? new Date(st.startedAt).getTime() : Date.now();
            }
            renderGlobalHud(st);
          } else if (isGlobalUpgrading) {
            // Just transitioned from running to finished!
            isGlobalUpgrading = false;
            renderCompletedHud(st);
          }
        } catch (e) {}
      };

      setInterval(pollStatus, 1500);
      pollStatus();
    }

    function renderGlobalHud(st) {
      const hudEl = document.getElementById("dsh-global-upgrade-hud");
      if (!hudEl) return;
      hudEl.style.display = "block";

      const elapsedSec = Math.max(1, Math.floor((Date.now() - (globalStartedAt || Date.now())) / 1000));
      
      const phaseNames = {
        stash: "① 暂存本地修改",
        pull: "② 拉取上游更新 (git pull)",
        unstash: "③ 恢复本地修改",
        install: "④ 安装依赖 (pnpm install)",
        build: "⑤ 全量打包编译 (pnpm build)",
        sync: "⑥ 同步 Profile 依赖 (pnpm install)",
      };
      const isPluginTarget = st.target && st.target.type === "plugin";
      const targetTitle = isPluginTarget ? `正在升级插件 ${st.target.name || st.target.id || ""}` : "正在升级内核";
      const phaseLabel = phaseNames[st.phase] || st.phaseLabel || (isPluginTarget ? "插件升级中" : "内核升级构建中");

      hudEl.innerHTML = `
        <div class="dsh-hud-pill">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; animation: dsh-hud-pulse 1.2s infinite ease-in-out;"></span>
            <span style="font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: dsh-spin 1.5s linear infinite; color: #38bdf8;">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${targetTitle}
            </span>
          </div>
          <span style="background: rgba(255,255,255,0.1); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: #cbd5e1;">
            ${phaseLabel}
          </span>
          <span style="font-family: monospace; font-size: 12px; color: #38bdf8; font-weight: 600;">
            ⏱️ ${elapsedSec}s
          </span>
          <span style="color: #fbbf24; font-size: 11px; display: flex; align-items: center; gap: 4px;">
            ⚠️ 请勿刷新页面
          </span>
          <button id="dsh-hud-toggle-log" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer;">
            ${globalLogExpanded ? "收起日志" : "查看日志"}
          </button>
        </div>
        ${globalLogExpanded ? `<div class="dsh-hud-card" id="dsh-hud-card-body">${st.tail || "正在获取实时编译输出..."}</div>` : ""}
      `;

      const toggleBtn = document.getElementById("dsh-hud-toggle-log");
      if (toggleBtn) {
        toggleBtn.onclick = () => {
          globalLogExpanded = !globalLogExpanded;
          renderGlobalHud(st);
        };
      }
      if (globalLogExpanded) {
        const cardBody = document.getElementById("dsh-hud-card-body");
        if (cardBody) cardBody.scrollTop = cardBody.scrollHeight;
      }
    }

    function renderCompletedHud(st) {
      const hudEl = document.getElementById("dsh-global-upgrade-hud");
      if (!hudEl) return;
      hudEl.style.display = "block";

      const ok = st.result ? st.result.success === true : false;
      const okTitle = st.target && st.target.type === "plugin" ? "插件升级完成！" : "升级全量编译完成！";

      if (ok) {
        hudEl.innerHTML = `
          <div class="dsh-hud-pill completed">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #10b981; font-size: 14px;">🎉</span>
              <span style="font-weight: 600; color: #fff;">${okTitle}</span>
            </div>
            <button id="dsh-hud-restart-btn" style="background: #10b981; border: none; color: #fff; font-weight: 600; border-radius: 999px; padding: 4px 14px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 10px rgba(16,185,129,0.4);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              立即重启服务生效
            </button>
            <button id="dsh-hud-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;">✕</button>
          </div>
        `;

        const restartBtn = document.getElementById("dsh-hud-restart-btn");
        if (restartBtn) {
          restartBtn.onclick = async () => {
            restartBtn.textContent = "正在重启服务…";
            restartBtn.disabled = true;
            try {
              await fetch("/api/plugins/restart", { method: "POST" });
            } catch (e) {}
            setTimeout(() => {
              window.location.reload();
            }, 3500);
          };
        }

        const closeBtn = document.getElementById("dsh-hud-close-btn");
        if (closeBtn) {
          closeBtn.onclick = () => {
            hudEl.style.display = "none";
          };
        }
      } else {
        hudEl.innerHTML = `
          <div class="dsh-hud-pill" style="border-color: #ef4444; animation: none;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #ef4444; font-size: 14px;">❌</span>
              <span style="font-weight: 600; color: #fff;">升级遇到问题</span>
            </div>
            <span style="font-size: 11px; color: #fca5a5;">请查看日志排查</span>
            <button id="dsh-hud-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;">✕</button>
          </div>
        `;
        const closeBtn = document.getElementById("dsh-hud-close-btn");
        if (closeBtn) {
          closeBtn.onclick = () => {
            hudEl.style.display = "none";
          };
        }
      }
    }

    exports.apply = function (ctx) {
      initGlobalUpgradeGuard();

      ctx.locale.register(NS, { zh, en });
      ctx.slots.inject("settings.plugin.item", function* () {
        yield ctx.slots.register(
          {
            name: "settings.plugin.item",
            key: "update-checker",
            id: "update-checker",
            order: 10,
            locale: NS,
          },
          UpdateCheckerCard
        );
      });
    };

    return exports;
  },
});
