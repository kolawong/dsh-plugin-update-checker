<div align="center">

# DeepSeek Harness — 系统与插件管理中心

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/Version-1.4.0-green.svg)](package.json)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Linux%20%7C%20macOS-informational.svg)](#)

[English](README.md) | 简体中文

<br />

<img src="assets/hero.svg" alt="DeepSeek Harness 系统与插件管理中心横幅" width="100%" />

<br />

**专为 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 打造的原生生产级「系统与插件管理中心」。**  
提供内核与上游 GitHub 版本的实时比对、全景式第三方插件聚合扫描、插件启用/停用一键切换、一键彻底卸载依赖与后台平滑重启全生命周期管理。

</div>

---

## 🌟 核心功能特性

- 🔄 **内核版本监控与远程对齐**：
  - 实时比对本地运行 Commit 与 GitHub 上游 `origin/master`（或 Release Tag）。
  - 精准展示当前版本、远程最新 SHA、提交时间与落后提交数（Behind Count）。
  - 指标卡片右上角集成小巧的 SVG 刷新按钮，点击即刻异步检测。

- 🧩 **插件级更新检查**：以 git 检出形式安装的插件（GitHub 来源插件的常见形态）会报告分支、上游远程与落后提交数，并提供逐插件一键更新按钮；已知上游仓库时插件名可直接点击跳转；非 git 安装会标注无法检查的原因。

- 🧩 **全景式多源插件扫描**：
  - 自动扫描并识别：Profile 挂载插件（`package.json` 中的 `bundles` 与 `dependencies`）、`cordis.patch.yml` 规则、`~/.dsh/plugins/` 目录以及用户主目录下的独立插件项目（`~/dsh-*`）。
  - 自动过滤隐藏 `@deepseek-ai/*` 等官方底层内置依赖，聚焦自定义与社区插件。

- ⚡ **插件生命周期一键管理**：
  - **停用 / 启用一键切换**：自由开启或禁用插件，自动同步 Profile 配置。
  - **一键彻底卸载**：点击红色的 `[🗑️ 卸载]` 按钮即可自动从 Profile 移除、清理 patch 注入并运行包管理器清理依赖。
  - **后台平滑重启**：卡片内置手动重启按钮，并在配置变更后提示重启。重启路径自动适配部署形态：运行中的进程位于 systemd 单元内时直接通过 `systemctl` 重启（避免与单元的 `Restart=always` 守护产生端口竞争）；否则以 setsid 完全脱离会话地执行外部脚本（如 `$DSH_HOME/restart-web.sh`）；裸机部署退回派生的 kill + 重启命令。

- 🎨 **100% 严苛遵循 DSH 官方卡片规范**：
  - 完美挂载至 **设置 ➔ 插件配置**（`settings.plugin.item` 插槽）。
  - 严格对齐官方统一的边距（`gap: 10px`）、圆角（`12px`）、字号层级（`15px` 标题 + `13px` 副标题）与深色主题变量。
  - 支持 **简体中文** 与 **English** 双语国际化，跟随系统设置即时切换。

---

## 📦 安装与配置

### 方式 1：通过 DSH CLI 直接安装

```bash
dsh plugin add github:kolawong/dsh-plugin-update-checker
```

### 方式 2：本地软链 / 源码安装

克隆本仓库到您的服务器或工作目录：

```bash
git clone https://github.com/kolawong/dsh-plugin-update-checker.git ~/dsh-plugin-update-checker
```

在您的 Profile 配置文件（`~/.dsh/profiles/web/package.json`）中声明该 Bundle：

```json
{
  "dependencies": {
    "dsh-plugin-update-checker": "file:/root/dsh-plugin-update-checker"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-update-checker"
      ]
    }
  }
}
```

重启 DeepSeek Harness 服务即可自动加载。

### 配置项

插件导出了 [Schemastery](https://github.com/cordisjs/schemastery) 的 `Config` 模式，Cordis 在加载时校验配置并填充默认值——所有与部署相关的值都是配置字段，可在您 Profile 的 `cordis.patch.yml` 中通过 `id: update-checker` 覆盖：

| 字段 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `autoCheck` | `true` | 启动时及周期性自动检查更新。 |
| `checkIntervalHours` | `6` | 后台检查间隔（小时）。 |
| `githubRepo` | `deepseek-ai/deepseek-harness` | 上游项目标识。 |
| `coreRepoPath` | `""`（自动探测） | 用于检查与升级的内核仓库路径。 |
| `branch` | `master` | 跟踪并拉取的上游分支。 |
| `nodeBinDir` | 当前 Node 的 bin 目录 | 升级与重启使用的 `node`/`pnpm` 所在目录。 |
| `webPort` | `3080` | 重启 Web 服务使用的端口。 |
| `webTrustedHost` | `""` | 重启命令可选的 `--trusted-host` 参数。 |
| `webLogPath` | `$DSH_HOME/dsh-web.log` | 重启后 Web 服务的日志文件。 |
| `systemdUnit` | `deepseek-harness` | 管理 Web 服务的 systemd 单元名；置空则禁用 systemd 重启路径。 |
| `restartScriptPath` | `""`（即 `$DSH_HOME/restart-web.sh`） | systemd 不管理进程时执行的外部重启脚本。 |
| `extraPlugins` | `[]` | 管理器要展示、但位于常规扫描面之外（Profile bundle、`~/.dsh/plugins`、`~/dsh-*` 工作区）的额外插件，例如用 npm 安装的工具。只读：将本地 `package.json` 版本与 npm 仓库的 `dist-tags.latest` 对比，发现新版时在卡片上提示；升级仍需手动执行。 |

#### 额外插件（npm 仓库检查）

通过常规 dsh 渠道之外（如 `npm`）安装的插件不会被自动发现。在 `extraPlugins` 中声明后，它们会出现在「插件管理」中，并针对 npm 仓库做只读版本检查：

```yaml
- id: update-checker
  config:
    extraPlugins:
      - id: hindsight
        npm: '@vectorize-io/hindsight-coding-agents'
        path: '/root/.hindsight/coding-agents'
        repo: 'https://github.com/vectorize-io/hindsight'
```

每项包含 `id`（管理器中的键名）、`npm`（仓库包名）、`path`（存放已安装版本 `package.json` 的目录）和 `repo`（卡片链接到的仓库 Web 地址）。卡片显示已安装版本，当仓库 `latest` 不同时会显示 `发现更新: 当前 → 最新` 徽标。升级仍为手动——请自行执行你的安装命令。

> **安全提示**：管理端点（升级 / 切换 / 卸载 / 重启）权限极大。请务必部署在带鉴权的 Web 服务组合之后（例如 Basic-Auth webserver Bundle）；插件自身不做鉴权。

---

## 🖥️ Web 界面指南

进入 DeepSeek Harness 网页端后，点击 **设置 (Settings) ➔ 插件配置 (Plugin Configuration)**：

1. **4 列核心监控卡片**：
   - **当前版本**：显示本地运行的 DSH 内核版本与 Git Short SHA。
   - **远程最新**：显示 GitHub 上游最新版本号与最新提交 SHA。
   - **运行状态**：显示 `0 (已对齐)` 或 `落后 N 提交`。
   - **上次检查**：显示最后检查时间，右侧带有交互式刷新 SVG 图标。

2. **标签页视图**：
   - **插件管理**：列出所有扫描到的扩展插件，支持查看版本、工作区标识、一键切换启用状态及卸载操作。
   - **提交记录**：直观展示上游最近 12 条 Git 提交历史（包含 SHA、提交人、时间与 Commit 信息）。
   - **升级日志**：执行后台一键升级时的实时构建与编译日志输出。

---

## 🔌 后端 REST API 接口清单

| 路由地址 | 请求方法 | 功能说明 |
| :--- | :--- | :--- |
| `/api/update-checker/status` | `GET` | 获取系统版本状态、落后提交数、最近提交与所有扫描到的插件列表。 |
| `/api/update-checker/check` | `POST` | 立即触发向远程 Git 仓库的静默 Fetch 检查。 |
| `/api/update-checker/upgrade` | `POST` | 在后台启动一键内核升级：暂存本地修改 → `git pull --ff-only` → 恢复修改 → `pnpm install` → `pnpm build`。 |
| `/api/update-checker/upgrade/status` | `GET` | 升级实时进度：运行状态、当前阶段与滚动日志尾部。 |
| `/api/update-checker/log` | `GET` | 完整升级日志（纯文本；升级进行中返回实时尾部）。 |
| `/api/plugins/toggle` | `POST` | 切换指定插件的启用/停用状态（`{ pluginId, enabled, profile }`）。 |
| `/api/plugins/uninstall` | `POST` | 从 Profile 中彻底卸载插件并清理本地依赖包。 |
| `/api/plugins/update` | `POST` | 通过 git 更新单个已发现插件（`{ pluginId }`）：stash → pull --ff-only → 恢复 → 插件目录 pnpm install，最后在 Profile 目录执行一次 pnpm install 以同步 file: 安装的副本。 |
| `/api/plugins/restart` | `POST` | 在后台平滑重启 DSH Web 守护进程。 |

---

## 📁 目录结构

```text
dsh-plugin-update-checker/
├── assets/
│   └── hero.svg            # 界面架构与特性预览横幅
├── client.js               # Web 端设置卡片（严格符合 PluginCard 规范）
├── cordis.patch.yml        # Cordis Bundle 补丁规则
├── index.d.ts              # TypeScript 类型声明
├── index.js                # 后端 Cordis 插件与 WebServer 路由
├── LICENSE                 # 开源许可协议 (MIT)
├── package.json            # 插件 Manifest (含 dsh.bundle 与 dsh.client)
├── README.md               # 英文完整说明文档
└── README_CN.md            # 中文完整说明文档
```

---

## 📄 开源协议

本项目采用 **[MIT License](LICENSE)** 开源协议。  
作者：[@kolawong](https://github.com/kolawong)。
