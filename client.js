/**
 * dsh-plugin-update-checker — Client half (Web UI Settings Card)
 *
 * 100% aligned with official DSH PluginCard design specification.
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
      uninstall: "卸载",
      uninstallConfirm: "确定要从 Profile 中卸载插件 {name} 吗？",
      uninstallSuccess: "插件 {name} 卸载成功！",
      restartServer: "重启服务生效",
      restarting: "正在重启…",
      restartPrompt: "插件配置已更改，建议重启 Web 服务以完全生效。",
      actionFailed: "操作失败：{message}",
    };

    const en = {
      title: "System & Plugins",
      description: "Core upgrade tracking & plugin lifecycle management",
      currentVersion: "Current",
      latestVersion: "Upstream",
      status: "Status",
      upToDate: "Up to date",
      updateAvailable: "Update Available",
      checking: "Checking…",
      checkBtn: "Check Updates",
      upgradeBtn: "Upgrade",
      upgrading: "Upgrading…",
      upgradeConfirm: "Are you sure you want to pull and rebuild in the background?",
      lastChecked: "Checked",
      never: "Never",
      commitsTab: "Commits",
      pluginsTab: "Plugin Manager",
      logsTab: "Logs",
      noCommits: "No commits found",
      noPlugins: "No 3rd-party plugins found",
      aligned: "0 (Aligned)",
      behindMsg: "{count} behind",
      enabled: "Enabled",
      disabled: "Disabled",
      builtin: "Built-in",
      workspace: "Workspace",
      profile: "Profile",
      uninstall: "Uninstall",
      uninstallConfirm: "Are you sure you want to uninstall {name}?",
      uninstallSuccess: "Plugin {name} uninstalled successfully!",
      restartServer: "Restart to Apply",
      restarting: "Restarting…",
      restartPrompt: "Plugin configuration changed. Restart the Web server to take effect.",
      actionFailed: "Action failed: {message}",
    };

    function RefreshIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 14, height: 14, flexShrink: 0, ...props.style },
        children: jsx("path", {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
        }),
      });
    }

    function UpgradeIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13, flexShrink: 0, ...props.style },
        children: jsx("path", {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M7 11l5-5m0 0l5 5m-5-5v12",
        }),
      });
    }

    function TrashIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 12, height: 12, flexShrink: 0, ...props.style },
        children: jsx("path", {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
        }),
      });
    }

    function GitCommitIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13, flexShrink: 0, ...props.style },
        children: [
          jsx("circle", { cx: "12", cy: "12", r: "3", strokeWidth: 2 }),
          jsx("line", { x1: "3", y1: "12", x2: "9", y2: "12", strokeWidth: 2 }),
          jsx("line", { x1: "15", y1: "12", x2: "21", y2: "12", strokeWidth: 2 }),
        ],
      });
    }

    function PluginIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 13, height: 13, flexShrink: 0, ...props.style },
        children: jsx("path", {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
        }),
      });
    }

    function RestartIconSvg(props) {
      return jsx("svg", {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        style: { width: 12, height: 12, flexShrink: 0, ...props.style },
        children: jsx("path", {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M13 10V3L4 14h7v7l9-11h-7z",
        }),
      });
    }

    function formatTime(isoStr) {
      if (!isoStr) return "";
      try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } catch {
        return isoStr;
      }
    }

    function UpdateCheckerCard(props) {
      const [open, setOpen] = useState(false);
      const [data, setData] = useState(null);
      const [checking, setChecking] = useState(false);
      const [upgrading, setUpgrading] = useState(false);
      const [restarting, setRestarting] = useState(false);
      const [actionMsg, setActionMsg] = useState(null);
      const [activeTab, setActiveTab] = useState("plugins");
      const [logs, setLogs] = useState("");

      // Dynamic bilingual translation helper
      const t = useCallback((key, params = {}) => {
        let text = (typeof props.t === "function" ? props.t(key) : null);
        if (!text || text === key) {
          // Detect current locale
          const lang = (typeof navigator !== "undefined" && navigator.language) || "zh";
          const dict = lang.startsWith("en") ? en : zh;
          text = dict[key] || zh[key] || en[key] || key;
        }
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
        return text;
      }, [props.t]);

      const fetchStatus = useCallback(async () => {
        try {
          const res = await fetch("/api/update-checker/status");
          if (res.ok) {
            const body = await res.json();
            if (body.ok && body.data) {
              setData(body.data);
              setUpgrading(Boolean(body.data.isUpgrading));
            }
          }
        } catch (err) {
          console.error("Failed to fetch update status:", err);
        }
      }, []);

      useEffect(() => {
        fetchStatus();
        const timer = setInterval(fetchStatus, 30000);
        return () => clearInterval(timer);
      }, [fetchStatus]);

      const handleCheckNow = async (e) => {
        e?.stopPropagation?.();
        if (checking) return;
        setChecking(true);
        try {
          const res = await fetch("/api/update-checker/check", { method: "POST" });
          if (res.ok) {
            const body = await res.json();
            if (body.ok && body.data) {
              setData(body.data);
            }
          }
        } catch (err) {
          console.error("Check failed:", err);
        } finally {
          setChecking(false);
        }
      };

      const handleUpgrade = async (e) => {
        e?.stopPropagation?.();
        if (!confirm(t("upgradeConfirm"))) return;
        setUpgrading(true);
        setActiveTab("logs");
        try {
          const res = await fetch("/api/update-checker/upgrade", { method: "POST" });
          if (res.ok) {
            fetchLogs();
          }
        } catch (err) {
          console.error("Upgrade trigger failed:", err);
        }
      };

      const handleTogglePlugin = async (p, e) => {
        e?.stopPropagation?.();
        const targetState = !p.enabled;
        try {
          const res = await fetch("/api/plugins/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pluginId: p.id, enabled: targetState }),
          });
          const body = await res.json();
          if (body.ok) {
            fetchStatus();
            setActionMsg({ type: "info", text: t("restartPrompt") });
          } else {
            setActionMsg({ type: "error", text: t("actionFailed", { message: body.error }) });
          }
        } catch (err) {
          setActionMsg({ type: "error", text: t("actionFailed", { message: err.message }) });
        }
      };

      const handleUninstallPlugin = async (p, e) => {
        e?.stopPropagation?.();
        const msg = t("uninstallConfirm", { name: p.name });
        if (!confirm(msg)) return;

        try {
          const res = await fetch("/api/plugins/uninstall", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pluginId: p.id }),
          });
          const body = await res.json();
          if (body.ok) {
            fetchStatus();
            setActionMsg({ type: "success", text: t("uninstallSuccess", { name: p.name }) });
          } else {
            setActionMsg({ type: "error", text: t("actionFailed", { message: body.error }) });
          }
        } catch (err) {
          setActionMsg({ type: "error", text: t("actionFailed", { message: err.message }) });
        }
      };

      const handleRestartServer = async (e) => {
        e?.stopPropagation?.();
        setRestarting(true);
        try {
          await fetch("/api/plugins/restart", { method: "POST" });
          setTimeout(() => {
            window.location.reload();
          }, 3500);
        } catch {
          setTimeout(() => {
            window.location.reload();
          }, 3500);
        }
      };

      const fetchLogs = async () => {
        try {
          const res = await fetch("/api/update-checker/log");
          if (res.ok) {
            const text = await res.text();
            setLogs(text);
          }
        } catch {}
      };

      const core = data?.core;
      const plugins = data?.plugins || [];
      const hasUpdate = core?.hasUpdate;
      const behindCount = core?.behindCount || 0;

      return jsx("li", {
        style: {
          listStyle: "none",
          border: "1px solid " + (open ? "var(--dsw-alias-label-dimmed, #4b5563)" : "var(--dsw-alias-border-l2, #333)"),
          borderRadius: "12px",
          background: open ? "var(--dsw-alias-bg-layer-2, #1e1e1e)" : "var(--dsw-alias-bg-layer-3, #242424)",
          transition: "border-color .16s, background .16s",
          margin: 0,
        },
        children: jsxs("div", {
          children: [
            // Standard Official DSH Header
            jsxs("button", {
              type: "button",
              onClick: () => setOpen(!open),
              "aria-expanded": open,
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
                // Clean Title & Description (No icon in front of title!)
                jsxs("span", {
                  style: {
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  },
                  children: [
                    jsx("span", {
                      style: {
                        fontSize: "15px",
                        fontWeight: "600",
                        lineHeight: 1.4,
                        color: "var(--dsw-alias-label-primary, #f3f4f6)",
                      },
                      children: t("title"),
                    }),
                    jsx("span", {
                      style: {
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "var(--dsw-alias-label-tertiary, #9ca3af)",
                      },
                      children: t("description"),
                    }),
                  ],
                }),

                // Right Status Badge
                hasUpdate
                  ? jsxs("span", {
                      style: {
                        flex: "none",
                        borderRadius: "999px",
                        padding: "2px 10px",
                        fontSize: "11px",
                        lineHeight: "16px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        background: "rgba(255, 152, 0, 0.15)",
                        color: "#ff9800",
                        border: "1px solid rgba(255, 152, 0, 0.3)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      },
                      children: [
                        jsx("span", {
                          style: {
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "#ff9800",
                          },
                        }),
                        t("behindMsg", { count: behindCount }),
                      ],
                    })
                  : jsxs("span", {
                      style: {
                        flex: "none",
                        borderRadius: "999px",
                        padding: "2px 10px",
                        fontSize: "11px",
                        lineHeight: "16px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#10b981",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      },
                      children: [
                        jsx("span", {
                          style: {
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "#10b981",
                          },
                        }),
                        t("upToDate"),
                      ],
                    }),

                // Chevron icon with smooth rotation
                jsx(IconChevronDownOutline14, {
                  style: {
                    flex: "none",
                    color: "var(--dsw-alias-label-tertiary, #9ca3af)",
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .16s",
                  },
                }),
              ],
            }),

            // Standard Body
            open
              ? jsxs("div", {
                  style: {
                    borderTop: "1px solid var(--dsw-alias-border-l2, #333)",
                    margin: "0 16px",
                    padding: "14px 0 16px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  },
                  children: [
                    // 4-Column Metrics Bar with Refresh Icon Button
                    jsxs("div", {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "8px",
                      },
                      children: [
                        // 1. Current Version
                        jsxs("div", {
                          style: {
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginBottom: "3px" },
                              children: t("currentVersion"),
                            }),
                            jsxs("div", {
                              style: {
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "var(--dsw-alias-label-primary, #fff)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                              children: [
                                jsx("span", { children: core?.currentVersion || "0.1.0" }),
                                core?.currentCommit
                                  ? jsx("span", {
                                      style: {
                                        fontSize: "10px",
                                        padding: "1px 4px",
                                        borderRadius: "3px",
                                        background: "rgba(255, 255, 255, 0.08)",
                                        fontFamily: "monospace",
                                        color: "var(--dsw-alias-label-secondary, #aaa)",
                                      },
                                      children: core.currentCommit,
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        }),
                        // 2. Latest Upstream
                        jsxs("div", {
                          style: {
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginBottom: "3px" },
                              children: t("latestVersion"),
                            }),
                            jsxs("div", {
                              style: {
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "var(--dsw-alias-label-primary, #fff)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                              children: [
                                jsx("span", { children: core?.latestVersion || core?.currentVersion || "0.1.0" }),
                                core?.latestCommit
                                  ? jsx("span", {
                                      style: {
                                        fontSize: "10px",
                                        padding: "1px 4px",
                                        borderRadius: "3px",
                                        background: "rgba(255, 255, 255, 0.08)",
                                        fontFamily: "monospace",
                                        color: "var(--dsw-alias-label-secondary, #aaa)",
                                      },
                                      children: core.latestCommit,
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        }),
                        // 3. Status
                        jsxs("div", {
                          style: {
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            minWidth: 0,
                          },
                          children: [
                            jsx("div", {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginBottom: "3px" },
                              children: t("status"),
                            }),
                            jsx("div", {
                              style: {
                                fontSize: "12px",
                                fontWeight: "600",
                                color: behindCount > 0 ? "#ff9800" : "#10b981",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                              children: behindCount > 0 ? t("behindMsg", { count: behindCount }) : t("aligned"),
                            }),
                          ],
                        }),
                        // 4. Last Checked + Card-Right Refresh SVG Icon
                        jsxs("div", {
                          style: {
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "6px",
                          },
                          children: [
                            jsxs("div", {
                              style: { minWidth: 0, overflow: "hidden" },
                              children: [
                                jsx("div", {
                                  style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginBottom: "3px" },
                                  children: t("lastChecked"),
                                }),
                                jsx("div", {
                                  style: {
                                    fontSize: "12px",
                                    fontWeight: "500",
                                    color: "var(--dsw-alias-label-primary, #fff)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  },
                                  children: data?.lastChecked ? formatTime(data.lastChecked) : t("never"),
                                }),
                              ],
                            }),
                            // Small Interactive SVG Refresh Icon
                            jsx("button", {
                              type: "button",
                              disabled: checking,
                              onClick: handleCheckNow,
                              title: t("checkBtn"),
                              style: {
                                padding: "5px",
                                borderRadius: "4px",
                                border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12))",
                                background: "rgba(255, 255, 255, 0.06)",
                                color: checking ? "#ff9800" : "#60a5fa",
                                cursor: checking ? "default" : "pointer",
                                opacity: checking ? 0.7 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              },
                              children: jsx(RefreshIconSvg, {
                                style: {
                                  transform: checking ? "rotate(180deg)" : "none",
                                  transition: "transform 0.4s ease",
                                },
                              }),
                            }),
                          ],
                        }),
                      ],
                    }),

                    // Action feedback banner
                    actionMsg
                      ? jsxs("div", {
                          style: {
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            background:
                              actionMsg.type === "success"
                                ? "rgba(16, 185, 129, 0.15)"
                                : actionMsg.type === "info"
                                ? "rgba(59, 130, 246, 0.15)"
                                : "rgba(239, 68, 68, 0.15)",
                            color:
                              actionMsg.type === "success"
                                ? "#10b981"
                                : actionMsg.type === "info"
                                ? "#60a5fa"
                                : "#ef4444",
                          },
                          children: [
                            jsx("span", { children: actionMsg.text }),
                            jsx("button", {
                              type: "button",
                              disabled: restarting,
                              onClick: handleRestartServer,
                              style: {
                                padding: "3px 10px",
                                borderRadius: "4px",
                                border: "none",
                                background: "#3b82f6",
                                color: "#fff",
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
                                background: activeTab === "plugins" ? "rgba(59, 130, 246, 0.2)" : "transparent",
                                color: activeTab === "plugins" ? "#60a5fa" : "var(--dsw-alias-label-secondary, #999)",
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
                                background: activeTab === "commits" ? "rgba(59, 130, 246, 0.2)" : "transparent",
                                color: activeTab === "commits" ? "#60a5fa" : "var(--dsw-alias-label-secondary, #999)",
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
                                    background: activeTab === "logs" ? "rgba(59, 130, 246, 0.2)" : "transparent",
                                    color: activeTab === "logs" ? "#60a5fa" : "var(--dsw-alias-label-secondary, #999)",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: activeTab === "logs" ? "600" : "400",
                                  },
                                  children: t("logsTab"),
                                })
                              : null,
                          ],
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
                              children: [jsx(UpgradeIconSvg, {}), upgrading ? t("upgrading") : t("upgradeBtn")],
                            })
                          : null,
                      ],
                    }),

                    // Tab 1: Plugin Manager List (With Uninstall & Toggle)
                    activeTab === "plugins"
                      ? jsx("div", {
                          style: {
                            maxHeight: "260px",
                            overflowY: "auto",
                            background: "rgba(0, 0, 0, 0.2)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.05))",
                          },
                          children:
                            plugins.length > 0
                              ? jsxs("div", {
                                  style: { display: "flex", flexDirection: "column", gap: "8px" },
                                  children: plugins.map((p, i) =>
                                    jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          fontSize: "12px",
                                          padding: "6px 0",
                                          borderBottom:
                                            i < plugins.length - 1
                                              ? "1px solid rgba(255,255,255,0.04)"
                                              : "none",
                                          gap: "10px",
                                        },
                                        children: [
                                          // Left: Name & Badges
                                          jsxs("div", {
                                            style: { minWidth: 0, flex: 1 },
                                            children: [
                                              jsxs("div", {
                                                style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" },
                                                children: [
                                                  jsx("span", {
                                                    style: {
                                                      fontWeight: "500",
                                                      color: p.enabled ? "#e0e0e0" : "var(--dsw-alias-label-tertiary, #777)",
                                                      whiteSpace: "nowrap",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                    },
                                                    children: p.name,
                                                  }),
                                                  p.source === "workspace"
                                                    ? jsx("span", {
                                                        style: {
                                                          fontSize: "10px",
                                                          background: "rgba(59, 130, 246, 0.15)",
                                                          color: "#60a5fa",
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
                                                      background: "rgba(255,255,255,0.08)",
                                                      padding: "1px 5px",
                                                      borderRadius: "3px",
                                                      fontFamily: "monospace",
                                                      color: "var(--dsw-alias-label-secondary, #aaa)",
                                                      whiteSpace: "nowrap",
                                                    },
                                                    children: p.version,
                                                  }),
                                                ],
                                              }),
                                              p.description
                                                ? jsx("div", {
                                                    style: {
                                                      fontSize: "11px",
                                                      color: "var(--dsw-alias-label-tertiary, #777)",
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

                                          // Right: Toggle & Uninstall Actions
                                          jsxs("div", {
                                            style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 },
                                            children: [
                                              // Toggle Enable/Disable button
                                              !p.isBuiltin
                                                ? jsx("button", {
                                                    type: "button",
                                                    onClick: (e) => handleTogglePlugin(p, e),
                                                    style: {
                                                      padding: "3px 8px",
                                                      borderRadius: "4px",
                                                      border: "1px solid " + (p.enabled ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.1)"),
                                                      background: p.enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(255, 255, 255, 0.03)",
                                                      color: p.enabled ? "#10b981" : "var(--dsw-alias-label-tertiary, #888)",
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
                                                    },
                                                    children: t("enabled"),
                                                  }),

                                              // Uninstall button (for 3rd-party community plugins)
                                              p.removable && !p.isSelf
                                                ? jsxs("button", {
                                                    type: "button",
                                                    onClick: (e) => handleUninstallPlugin(p, e),
                                                    title: t("uninstall"),
                                                    style: {
                                                      padding: "3px 8px",
                                                      borderRadius: "4px",
                                                      border: "1px solid rgba(239, 68, 68, 0.3)",
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
                                    color: "var(--dsw-alias-label-tertiary, #888)",
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
                            maxHeight: "200px",
                            overflowY: "auto",
                            background: "rgba(0, 0, 0, 0.2)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            border: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.05))",
                          },
                          children:
                            core?.recentCommits && core.recentCommits.length > 0
                              ? jsxs("div", {
                                  style: { display: "flex", flexDirection: "column", gap: "6px" },
                                  children: core.recentCommits.map((c, i) =>
                                    jsxs(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          fontSize: "12px",
                                          padding: "3px 0",
                                          borderBottom:
                                            i < core.recentCommits.length - 1
                                              ? "1px solid rgba(255,255,255,0.04)"
                                              : "none",
                                        },
                                        children: [
                                          jsxs("div", {
                                            style: {
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "8px",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              marginRight: "10px",
                                            },
                                            children: [
                                              jsx("span", {
                                                style: {
                                                  fontFamily: "monospace",
                                                  background: "rgba(59,130,246,0.15)",
                                                  color: "#60a5fa",
                                                  padding: "1px 5px",
                                                  borderRadius: "3px",
                                                  fontSize: "11px",
                                                },
                                                children: c.sha,
                                              }),
                                              jsx("span", {
                                                style: {
                                                  color: "var(--dsw-alias-label-primary, #ddd)",
                                                },
                                                children: c.message,
                                              }),
                                            ],
                                          }),
                                          jsx("span", {
                                            style: {
                                              fontSize: "11px",
                                              color: "var(--dsw-alias-label-tertiary, #777)",
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
                                    color: "var(--dsw-alias-label-tertiary, #888)",
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
                          style: {
                            maxHeight: "180px",
                            overflowY: "auto",
                            background: "#111",
                            borderRadius: "8px",
                            padding: "10px",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: "#00e676",
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

    exports.apply = function (ctx) {
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
