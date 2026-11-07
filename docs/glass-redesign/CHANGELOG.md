# 改动留档 · Yaya 液态玻璃 UI 重构

> 本文件随 `glass-ui-rework` 分支上云。**每次改动追加一条，不覆盖历史**。
> 云端：`https://github.com/shufajiaok/yaya_msg_mobile/blob/glass-ui-rework/docs/glass-redesign/CHANGELOG.md`
> 判定依据：`02-apple-liquid-glass-spec.md`（规范）、`03-liquid-glass-visual-redesign-plan-v2.md`（方案 v2.1）、`04-engine-swap-architecture-revision.md`（引擎重判）。

| # | 时间 | 批次 | 改动 | 依据 | 验证 | commit |
| --- | --- | --- | --- | --- | --- | --- |
| 000 | 2026-11-07 | 环境 | Fork `shufajiaok/yaya_msg_mobile` 用官方 `merge-upstream` 从 `117140a` 快进同步到 `c428b29`；完整 clone 因代理 `early EOF` 失败，改 `HTTP/1.1 + --depth 1` 成功；建 `glass-ui-rework` 分支；工作副本迁入 `D:\glass` | 用户指令「按规划配置环境」 | HEAD=`c428b29`，501 文件，工作区干净，origin 指向 fork | — |
| 001 | 2026-11-07 | 文档上云 | 5 份方案/规范文档复制入 `docs/glass-redesign/`；建立本 CHANGELOG 与 `P0-改动清单.md` | 用户指令「所有产出留档并上云」 | 敏感信息扫描 `ghp_` 0 命中 | 待填 |
| 002 | 2026-11-07 | 基线差异登记 | 方案文档基于 `e324df4`(v2.7.5, Expo 54 / `expo-blur ~15`)；工作副本 `c428b29` 已是 Expo 55 系 / `expo-blur ~55`。**`@react-native-async-storage/async-storage@2.2.0`、`zustand@^5.0.12`、`expo-linear-gradient` 均已存在 → 路径 A+ 无需新增依赖** | 实测 `package.json` | 涉及文档旧行号处以工作副本实际内容为准 | 待填 |

| 003 | 2026-11-07 | **动工前拦截** | 核查发现工作副本已存在 6 个玻璃组件（819 行）与 `react-native-liquid-glassmorphism@^1.2.1`，技术路线与 v2.1 路径 A+ 不同；详见 `基线差异与路线冲突.md`。**P0 代码改动暂停，等用户拍板路线 A / B**；`src/` 未改一行 | `GlassSurface.tsx:18` 既有约定「玻璃的唯一出口」；用户规矩「大改前先列清单」 | `git status --short` 仅 `docs/`；`src/` 干净 | 待填 |

## 待登记批次（按 P0 清单顺序，分批 commit / push）

> ⚠️ **暂停中**：003 的路线冲突未拍板前，以下批次不得开工。拍板后按修订版清单重排。

- P0-1 `src/theme/glass.ts` 新建 + `src/theme/index.ts` 导出
- P0-2 `src/theme/colors.ts` 补 4 套色 token
- P0-3 `src/theme/ui.ts` 去半透明卡底
- P0-4 `radii.ts` / `typography.ts` / `spacing.ts` token 化
- P0-5 a11y 降级矩阵与动效档
- P0-6 `useSafeAreaInsets.ts` 单一来源
- P0-7 `tabBarStyle.ts` 死代码
- P0-8 `scripts/` CI 静态守卫雏形

> 每个批次完成后追加一行，写明文件、依据章节、验证方式与 commit hash。
