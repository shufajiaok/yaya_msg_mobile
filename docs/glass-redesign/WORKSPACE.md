# D:\glass — Yaya 液态玻璃 UI 重构工作区

> 一次性工作区。**所有操作、改动、产出均在此目录内**，可整体删除以快速恢复磁盘空间。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `yaya_msg_mobile/` | 唯一代码工作副本（git，分支 `glass-ui-rework`），origin 指向 `shufajiaok/yaya_msg_mobile` |
| `yaya_msg_mobile/docs/glass-redesign/` | 5 份方案/规范文档 + `CHANGELOG.md` 改动留档 + `P0-改动清单.md` + 冲突报告 + `WORKSPACE.md`（**随仓库上云**） |
| `logs/` | 本地操作日志（临时，删除不影响云端） |

## 云端位置

- 仓库：`https://github.com/shufajiaok/yaya_msg_mobile`
- 分支：`glass-ui-rework`
- 留档：`https://github.com/shufajiaok/yaya_msg_mobile/blob/glass-ui-rework/docs/glass-redesign/CHANGELOG.md`

## 当前上云状态（2026-11-07）

本地已有 **5 个 commit**，因代理 `CONNECT tunnel failed, response 502` 及后续整体断网（api.github.com / github.com / codeload 全部 `000`）**尚未推送**：

| commit | 内容 |
| --- | --- |
| `d9f5b48` | 5 份方案文档 + CHANGELOG + P0 清单 + WORKSPACE 落档 |
| `812e80b` | 基线差异与路线冲突报告，P0 暂停待拍板 |
| `d89547b` | 工作区说明同步 |
| `e0584f6` | **路线 B：源码基线回退至 `e324df4`** |
| 待填 | 文档口径同步（CHANGELOG / P0 清单 / README / WORKSPACE） |

网络恢复后一键推送（凭据已在 `.git/config`，无需再传 token）：

```bash
cd D:/glass/yaya_msg_mobile
git -c http.version=HTTP/1.1 -c http.sslBackend=openssl push -u origin glass-ui-rework
git ls-remote origin refs/heads/glass-ui-rework   # 核验
```

> 推送成功后，把各 hash 回填 `docs/glass-redesign/CHANGELOG.md` 的 commit 列。
> e324df4 基线下只有 `quality.yml`，推本分支**不会触发** `ci-build` 自动出包。

## 动工状态

**路线 B 已拍板并执行**：源码基线已切回 `e324df4`（v2.7.5 / Expo 54），与方案 v2.1 调研基线完全一致。P0 按 `P0-改动清单.md` 8 项顺序开工，`src/` 尚无 P0 改动。

- 路线 A/B 的原始判断依据保留在 `yaya_msg_mobile/docs/glass-redesign/基线差异与路线冲突.md`（历史留档，不再作为当前口径）。
- 环境局限：`node_modules` 未装且网络中断，`npm run typecheck` 暂不能跑；改用静态守卫脚本 + 逐文件核对，网络恢复后补跑。

## 清理与恢复

直接删除整个 `D:\glass` 即可，云端内容不受影响。恢复方式：

```bash
git clone --branch glass-ui-rework https://github.com/shufajiaok/yaya_msg_mobile.git D:/glass/yaya_msg_mobile
```

> ⚠️ 上云完成前删除 = 丢失本地 commit。请先确认 `git ls-remote origin refs/heads/glass-ui-rework` 有输出。

## 基线说明

| 项 | 值 |
| --- | --- |
| 源码内容基线 | **`e324df4`（v2.7.5），codeload 快照离线重建，逐字节校验一致** |
| git 历史 | 浅克隆 `--depth 1`（`c428b29`）+ 一个回退 commit `e0584f6`；对象库不含 `e324df4` 对象 |
| Expo / RN | `~54.0.33` / `0.81.5` / `expo-blur ~15.0.8` —— 与方案文档一致 |
| 依赖 | `AsyncStorage ^1.23.1`、`zustand ^5`、`expo-blur`、`expo-linear-gradient` 均在，路径 A+ 不新增 |
| 已丢弃 | `c428b29` 后续修复（PiP 比例、`member-db/`、社区/分析 6 页、Expo 55、6 个玻璃组件 819 行）—— B 路线明确接受 |

## 约束（来自 v2.1 §9.2，不得越界）

不新增依赖、不改 `package.json` / `app.json`、不碰 `android/`、不碰业务逻辑与播放器内核、不动 `DanmakuOverlay.tsx`、不新增「我的」Tab、**P0 不做视觉改造**。
