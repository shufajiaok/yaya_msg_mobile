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
