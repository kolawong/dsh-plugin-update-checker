<div align="center">

# DeepSeek Harness — 系统与插件管理中心

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/Version-1.3.0-green.svg)](package.json)
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

- 🧩 **全景式多源插件扫描**：
  - 自动扫描并识别：Profile 挂载插件（`package.json` 中的 `bundles` 与 `dependencies`）、`cordis.patch.yml` 规则、`~/.dsh/plugins/` 目录以及用户主目录下的独立插件项目（`~/dsh-*`）。
  - 自动过滤隐藏 `@deepseek-ai/*` 等官方底层内置依赖，聚焦自定义与社区插件。

- ⚡ **插件生命周期一键管理**：
  - **停用 / 启用一键切换**：自由开启或禁用插件，自动同步 Profile 配置。
  - **一键彻底卸载**：点击红色的 `[🗑️ 卸载]` 按钮即可自动从 Profile 移除、清理 patch 注入并运行包管理器清理依赖。
  - **后台平滑重启**：卸载或配置修改后支持一键热重启 DSH Web 服务。

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
| `/api/update-checker/upgrade` | `POST` | 在后台启动一键内核升级任务（`git pull && pnpm install && pnpm build`）。 |
| `/api/update-checker/log` | `GET` | 实时读取升级编译日志流。 |
| `/api/plugins/toggle` | `POST` | 切换指定插件的启用/停用状态（`{ pluginId, enabled, profile }`）。 |
| `/api/plugins/uninstall` | `POST` | 从 Profile 中彻底卸载插件并清理本地依赖包。 |
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
