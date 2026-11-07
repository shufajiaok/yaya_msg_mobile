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

本地共 **12 个 commit**（下表 11 个已生成 + 本收口 commit），因代理 `CONNECT tunnel failed, response 502` 及后续整体断网（api.github.com / github.com / codeload 全部 `000`）**尚未推送**：

| # | commit | 内容 |
| --- | --- | --- |
| 1 | `d9f5b48` | 5 份方案文档 + CHANGELOG + P0 清单 + WORKSPACE 落档 |
| 2 | `812e80b` | 基线差异与路线冲突报告，P0 暂停待拍板 |
| 3 | `d89547b` | 工作区说明同步 |
| 4 | `e0584f6` | **路线 B：源码基线回退至 `e324df4`** |
| 5 | `15d4ebc` | 文档口径同步（B 路线 / 回填 hash） |
| 6 | `0308bdf` | P0 批次① `glass.ts` + theme 出口 |
| 7 | `7557eb9` | P0 批次② 4 套色 token / 去半透明卡底 / 圆角字号间距 token 化 |
| 8 | `194c6d9` | P0 批次③ a11y / Dynamic Type / 动效档 / 安全区 / 静态守卫 |
| 9 | `f89f32d` | P0 docs commit（三批留档 + 全局一致性审查） |
| 10 | `baf55e5` | 增量收口 G1/S1/S2/S3（QA Round 1 后） |
| 11 | `14a7bbc` | 增量 docs commit（S4 订正 + QA Round 1 结论） |
| 12 | 本 commit | **最终收口**：QA Round 2 结论 + 5 条建议裁决 + 两处留档订正 + 全量 hash 回填 |

网络恢复后一键推送（凭据已在 `.git/config`，无需再传 token）：

```bash
cd D:/glass/yaya_msg_mobile
git -c http.version=HTTP/1.1 -c http.sslBackend=openssl push -u origin glass-ui-rework
git ls-remote origin refs/heads/glass-ui-rework   # 核验
```

> e324df4 基线下只有 `quality.yml`，推本分支**不会触发** `ci-build` 自动出包；分批 CI 打包节奏由用户另行安排。
> 若需严格「分批推送」（不合并为一次），可逐 commit 执行 `git push origin <hash>:refs/heads/glass-ui-rework`（按上表顺序）。

## 动工状态（P0 已交付）

**路线 B 已拍板并执行**：源码基线切回 `e324df4`（v2.7.5 / Expo 54），与方案 v2.1 调研基线逐字节一致。P0 八项按 `P0-改动清单.md` 顺序全部落地，**零视觉变化**。

| 项 | 结果 |
| --- | --- |
| 代码量 | P0 三批 15 文件 / +2027 −74；QA 后增量 3 文件 / +51 −9 |
| 核心契约 | `src/theme/glass.ts`：zustand + AsyncStorage 四倍率、H1 `tint ≤ 0.12`、H2 `canBlur(≥31)` / `canLens(≥33)` 双档、H3 `degrade()` 六类、4 档 blurDp 14/12/10/8、七种 kind 分派、`contentScrim`/`glassDimming` 分档、`useGlassBudget()`、`childRadius()`、`layer` 断言 |
| 静态守卫 | `scripts/glass-guard.js` 纯 Node 零依赖，7 条基线规则（含 `glass-api-access: 0` 防玻璃 API 误接线），注入违规样本能 `EXIT=1` 拦截 |
| 团队流程 | 工程师实现 → QA Round 1（9/9 PASS，证伪 2 缺口）→ 有限增量修复 → QA Round 2（5/5 PASS，84 断言 0 FAIL，负对照证实）→ **路由 NoOne，2 轮硬上限收口** |
| 边界 | §9.2 不动清单全程 0 命中；`DanmakuOverlay.tsx` 逐字节未变；30 页路由 / 4 Tab / `package.json` / `android/` 全未动；**未新增依赖、未写任何页面视觉代码** |

- 路线 A/B 的原始判断依据保留在 `yaya_msg_mobile/docs/glass-redesign/基线差异与路线冲突.md`（历史留档，不再作为当前口径）。
- 完整逐批留档、差异登记、QA 两轮结论与主理人裁决见 `docs/glass-redesign/CHANGELOG.md`。

## 未闭合项（如实声明，非缺陷）

| 项 | 原因 / 后续 |
| --- | --- |
| **上云** | GitHub 整体断网 `000`，12 个 commit 全在本地安全；网络恢复后按上方命令推送 |
| **typecheck** | `node_modules` 未安装且无网络 → **未跑** `npm run typecheck`；改跑纯 Node 静态守卫 + vm 真实源码执行 + 逐文件核对 |
| **真机** | 四倍率实时重绘、API 31/33 实机双档、帧率、对比度均未实测（§11 待实测项） |
| **P1–P3** | G2（`budget` 消费者 / `lowEnd` 档位检测）、S5（import 归置）、`surfaceGlass*` 真删、274 处数值字面量圆角批改、`GlassSurface` 与页面接线 |
| **对象级基线** | `e324df4` 不在 shallow clone 对象库；源码内容已与 codeload tarball 逐字节核验，网络恢复后可补 fetch 复核 |

## 清理与恢复

直接删除整个 `D:\glass` 即可，云端内容不受影响。恢复方式：

```bash
git clone --branch glass-ui-rework https://github.com/shufajiaok/yaya_msg_mobile.git D:/glass/yaya_msg_mobile
```

> ⚠️ **上云完成前删除 = 丢失本地 12 个 commit**。请先确认 `git ls-remote origin refs/heads/glass-ui-rework` 有输出。

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
