# 改动留档 · Yaya 液态玻璃 UI 重构

> 本文件随 `glass-ui-rework` 分支上云。**每次改动追加一条，不覆盖历史**。
> 云端：`https://github.com/shufajiaok/yaya_msg_mobile/blob/glass-ui-rework/docs/glass-redesign/CHANGELOG.md`
> 判定依据：`02-apple-liquid-glass-spec.md`（规范）、`03-liquid-glass-visual-redesign-plan-v2.md`（方案 v2.1）、`04-engine-swap-architecture-revision.md`（引擎重判）。

| # | 时间 | 批次 | 改动 | 依据 | 验证 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 000 | 2026-11-07 | 环境 | Fork `shufajiaok/yaya_msg_mobile` 用官方 `merge-upstream` 从 `117140a` 快进同步到 `c428b29`；完整 clone 因代理 `early EOF` 失败，改 `HTTP/1.1 + --depth 1` 成功；建 `glass-ui-rework` 分支；工作副本迁入 `D:\glass` | 用户指令「按规划配置环境」 | HEAD=`c428b29`，501 文件，工作区干净，origin 指向 fork | — |
| 001 | 2026-11-07 | 文档上云 | 5 份方案/规范文档复制入 `docs/glass-redesign/`；建立本 CHANGELOG 与 `P0-改动清单.md` | 用户指令「所有产出留档并上云」 | 敏感信息扫描 `ghp_` 0 命中 | `d9f5b48` |
| 002 | 2026-11-07 | 基线差异登记 | 方案文档基于 `e324df4`(v2.7.5, Expo 54 / `expo-blur ~15`)；当时工作副本 `c428b29` 已是 Expo 55 系 / `expo-blur ~55` | 实测 `package.json` | 后被 004 路线 B 覆盖 | `d9f5b48` |
| 003 | 2026-11-07 | **动工前拦截** | 核查发现工作副本已存在 6 个玻璃组件（819 行）与 `react-native-liquid-glassmorphism@^1.2.1`，技术路线与 v2.1 路径 A+ 不同；详见 `基线差异与路线冲突.md`。P0 代码改动暂停，等用户拍板路线 A / B；`src/` 未改一行 | `GlassSurface.tsx:18` 既有约定「玻璃的唯一出口」；用户规矩「大改前先列清单」 | `git status --short` 仅 `docs/` | `812e80b` |
| 003a | 2026-11-07 | 工作区说明同步 | 补上云状态与路线冲突暂停说明 | 用户指令「所有产出留档」 | — | `d89547b` |
| 004 | 2026-11-07 | **路线 B 拍板 · 基线回退** | 用户选 **B**：切回 `e324df4`，严格按 v2.1 §9 P0 原清单从零做。**离线**用本地 codeload 快照重建源码树（无需 fetch），移除 `c428b29` 后续新增：`member-db/` 大数据库、社区/分析等 6 页、Expo 55 升级、6 个玻璃组件(819 行)、`android-apk.yml`；恢复 Expo ~54.0.33 / RN 0.81.5 / `expo-blur ~15` / `quality.yml` | 用户回复「b」；v2.1 §9 P0 清单 | 快照与 `yaya_e324df4.tar.gz` 逐字节核验一致；`FollowedRoomsScreen.tsx` 3123 行 / 4 处 `BlurView` 与调研基线吻合；`src/theme/glass.ts`、`GlassSurface.tsx` 均不存在（符合拟建）；`docs/glass-redesign/` 9 份留档未受影响 | `e0584f6` |
| 005 | 2026-11-07 | 文档口径同步 | CHANGELOG 回填 001–003a 的 commit hash；`P0-改动清单.md` 第四节改为 B 路线；`README.md` / `WORKSPACE.md` 更新基线与上云状态 | 留档规则「每批改动即登记」 | — | 待填 |

## 待登记批次（按 P0 清单顺序，分批 commit / push）

> ✅ **已解禁**：004 完成路线 B 基线切换，P0 可按 `P0-改动清单.md` 8 项顺序开工。**清单内容不变**（8 项 + §9.2 不动清单），仅第四节基线差异口径已更新。

- P0-1 `src/theme/glass.ts` 新建 + `src/theme/index.ts` 导出
- P0-2 `src/theme/colors.ts` 补 4 套色 token
- P0-3 `src/theme/ui.ts` 去半透明卡底
- P0-4 `radii.ts` / `typography.ts` / `spacing.ts` token 化
- P0-5 a11y 降级矩阵与动效档
- P0-6 `useSafeAreaInsets.ts` 单一来源
- P0-7 `tabBarStyle.ts` 死代码
- P0-8 `scripts/` CI 静态守卫雏形

> 每个批次完成后追加一行，写明文件、依据章节、验证方式与 commit hash。
> ⚠️ 环境局限：当前 `node_modules` 未安装且 GitHub 整体断网（`000`），`npm install` / `npm run typecheck` 无法执行；改用静态守卫脚本与逐文件人工核对，网络恢复后补跑 typecheck 并登记。
