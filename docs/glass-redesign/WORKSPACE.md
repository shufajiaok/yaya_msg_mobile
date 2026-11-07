# D:\glass — Yaya 液态玻璃 UI 重构工作区

> 一次性工作区。**所有操作、改动、产出均在此目录内**，可整体删除以快速恢复磁盘空间。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `yaya_msg_mobile/` | 唯一代码工作副本（git，分支 `glass-ui-rework`），origin 指向 `shufajiaok/yaya_msg_mobile` |
| `yaya_msg_mobile/docs/glass-redesign/` | 5 份方案/规范文档 + `CHANGELOG.md` 改动留档 + `P0-改动清单.md`（**随仓库上云**） |
| `logs/` | 本地操作日志（临时，删除不影响云端） |

## 云端位置

- 仓库：`https://github.com/shufajiaok/yaya_msg_mobile`
- 分支：`glass-ui-rework`
- 留档：`https://github.com/shufajiaok/yaya_msg_mobile/blob/glass-ui-rework/docs/glass-redesign/CHANGELOG.md`

## 当前上云状态（2026-11-07）

本地已有 2 个 commit，因代理 `CONNECT tunnel failed, response 502` 及后续整体断网（api.github.com / github.com / codeload 全部 `000`）**尚未推送**：

| commit | 内容 |
| --- | --- |
| `d9f5b48` | 5 份方案文档 + CHANGELOG + P0 清单 + WORKSPACE 落档 |
| `812e80b` | 基线差异与路线冲突报告，P0 暂停待拍板 |

网络恢复后一键推送（凭据已在 `.git/config`，无需再传 token）：

```bash
cd D:/glass/yaya_msg_mobile
git -c http.version=HTTP/1.1 -c http.sslBackend=openssl push -u origin glass-ui-rework
git ls-remote origin refs/heads/glass-ui-rework   # 核验
```

> 推送成功后，把两个 hash 回填 `docs/glass-redesign/CHANGELOG.md` 的 commit 列。
> `android-apk.yml` 只在 `ci-build` 分支触发自动出包，推本分支不会启动打包。

## 动工状态

**P0 代码改动已暂停**：发现工作副本已有 6 个玻璃组件（819 行）与 `react-native-liquid-glassmorphism`，与方案 v2.1 路径 A+ 是两条技术路线。详见 `yaya_msg_mobile/docs/glass-redesign/基线差异与路线冲突.md`。**用户拍板路线 A（适配现有实现，推荐）或 B（回退 e324df4）后立即继续**，当前 `src/` 未改一行。

## 清理与恢复

直接删除整个 `D:\glass` 即可，云端内容不受影响。恢复方式：

```bash
git clone --branch glass-ui-rework https://github.com/shufajiaok/yaya_msg_mobile.git D:/glass/yaya_msg_mobile
```

## 基线说明

| 项 | 值 |
| --- | --- |
| 分支基点 | `c428b29`（源仓库 main 最新，2026-11-06 同步） |
| 方案文档基线 | `e324df4`（v2.7.5）—— 调研时指定的 commit |
| 差异 | 文档基于 Expo 54 / `expo-blur ~15`；工作副本已是 Expo 55 系 / `expo-blur ~55`。`AsyncStorage 2.2.0`、`zustand`、`expo-linear-gradient` 均在，路径 A+ 不新增依赖 |
| 处理 | 严格按 v2.1 §9 P0 清单动工；涉及旧行号时以工作副本实际内容为准，差异登记进 CHANGELOG |

## 约束（来自 v2.1 §9.2，不得越界）

不新增依赖、不改 `package.json` / `app.json`、不碰 `android/`、不碰业务逻辑与播放器内核、不动 `DanmakuOverlay.tsx`、不新增「我的」Tab。
