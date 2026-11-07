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

## P0 批次留档（路线 B · v2.1 §9 原清单，2026-11-07）

> ✅ 上方「待登记批次」8 项已全部完成，按 1→8 顺序拆为 3 批代码 commit；本文件单独作为第 4 个 docs commit，不混进代码 commit。**未 push**（GitHub 整体断网，由主理人统一推送）。

| 批次 | 文件 | 依据 | 验证方式 | commit |
| --- | --- | --- | --- | --- |
| **①** | `src/theme/glass.ts`（新建）、`src/theme/index.ts` | 03 §3.5（按 04 §8.2 五项重做）/ §3.6 七种 kind / §9 P0 第 1–2 项 / §11；04 §2.3 / §2.4 / §2.7 / §6.2 A1–A6 / §8.2；02 M7 / M9 / M23 / M24 / D1 / D9 | 纯 Node 脚本核对 `index.ts ↔ glass.ts` 导出 64/64 自洽；`grep` 断言 H1 `Math.min(tintAlpha, 0.12)` / H2 `≥31`+`≥33` / H3 六类 / 4 档 blurDp；12 文件括号平衡；`git diff --stat` | `0308bdfb1f48d9029a452e8d0c89463cdb6e004c` |
| **②** | `src/theme/colors.ts`、`src/theme/ui.ts`、`src/theme/radii.ts`、`src/theme/typography.ts`、`src/theme/spacing.ts`、`src/store/a11y.ts`（新增）、`src/navigation/tabBarStyle.ts` | 03 §3.1 / §3.2 / §3.3 / §3.4 / §3.5 / §9 P0 第 3–5、8 项 / §13.6 F 组；02 M18 / M19 / M9 / D1 / D7 / §4.1 / §4.2 / §4.4 / §5.1；04 §2.3 / §2.4 / §6.2 A4 | 相对 import 目标存在性全通过；`grep` 断言 `usePageBackground()` transparent 分支保留、`card`/`cardOnImage` 已删、hero 31/44sp、最小 11sp 断言；守卫基线复跑；`git diff --stat` | `7557eb9e9783f22db987a45e4df599f699eda33f` |
| **③** | `src/theme/motion.ts`、`src/hooks/useAppTheme.ts`、`src/hooks/useSafeAreaInsets.ts`、`scripts/glass-guard.js`（新增）、`scripts/glass-guard.baseline.json`（新增） | 03 §7 末 / §8.1 / §8.3 / §8.4 / §9 P0 第 6–8 项 / §9 P4 / §11 / §13.3；02 §4.1 AX1 / §4.5 / §5.1 / §5.2 / M22 / D1 / D7 / D9；04 §6.2 A1–A6 / §8.2 | `node --check scripts/glass-guard.js` 通过；`node scripts/glass-guard.js` 退出码 0（基线 91 / 5 / 274 / 29 / 101 / 15，硬规则 0 命中，PASS）；导出一致性 64/64；括号平衡 12/12 | `194c6d9cbca8f14c9348f898705f4a346af6e017` |
| **docs** | `docs/glass-redesign/CHANGELOG.md`（本文件） | 留档规则「每批改动即登记」「CHANGELOG 不混进代码 commit」 | 纯追加、不覆盖 000–005 历史 | 本 commit（hash 见 `git log -1`，由主理人回填） |

### 全局一致性审查（全部文件写完后执行）

**IS_PASS: YES**

- 导出 / 导入自洽：`theme/index.ts` 对 `glass.ts` 的 64 个引用符号与 `glass.ts` 实际 64 个导出一一对应，无缺失、无多余；12 个改动文件的相对 import 目标逐一存在；`childRadius` 只在 `glass.ts` 实现、`radii.ts` 转发，无重复实现。
- 类型闭合：`Palette` / `ColorVariant` / `PaletteName` 拆分后，既有 `palette.name === 'dark'`、`Palettes.light.tint` 等调用点语义不变（inc 变体的 `name` 仍为 `'dark'`/`'light'`，新增 `variant` / `contrast` 字段）。
- 残留旧参数：`refractDp` / `legacyBackdrop` / `GLASS_DEFAULTS` 等八项旧参数仅出现在 `glass.ts` 顶部「已删除项登记」注释中，代码 0 命中；静态守卫硬规则 0 命中。
- 误改「不动清单」：`git status` 确认未改 `App.tsx` / `AppTabBar.tsx` / `ScreenHeader.tsx` / 任何 `src/screens/` / `src/components/DanmakuOverlay.tsx` / `package.json` / `app.json` / `package-lock.json` / `metro.config.js` / `tsconfig.json` / `android/` / 播放器内核 / 业务逻辑层；`src/store/` 仅新增 `a11y.ts`，`store/index.ts` 未改。
- `GlassSurface` / `resolveGlass` / `useGlassStore` 在 `src/**/*.tsx` 中 0 接入（P0 零视觉变化）。

### 差异登记（方案文档口径 → 工作副本实测）

1. **硬编码圆角 378 处**：方案文档（03 §3.2 / §9 P0）写 378；工作副本实测 `borderRadius:` 共 374 行，其中数值字面量 274 行、token / 表达式引用 100 行。静态守卫按数值字面量 274 建基线，只拦「新增」，不批量改页面（属 P1–P3）。
2. **方案文档旧行号**：涉及 §3.5 / §8.2 / §10 的旧行号一律以工作副本实际内容为准（03 v2 行号经 v2.1 收口后已偏移），本轮按章节号而非行号引用。
3. **旧内联值**：§3.5 末段「禁止内联清单」的具体数值（AppTabBar 62/82、FollowedRoomsScreen 70、MediaScreen `rgba(18,18,20,0.92)`、navigation 0.34、App.tsx 0.88/0.92、tabBarStyle 0.96/0.94/0.76/0.72）**只登记**到 `glass.ts` 的 `CONTENT_SCRIM.legacyInlineValues`、`scripts/glass-guard.js` 的 `LEGACY_INLINE_VALUES` 与本文件，未改动任何页面。
4. **守卫生效口径**：`contentScrim` 归一为单一来源（基准 0.88 / 导航档 0.34），保留分档语义、不删除；`usePageBackground()` transparent 分支按主理人裁决 C1a 原样保留。
5. **执行决策（需主理人知悉）**：`glowScale` 登记滑块区间 0–2，但按 04 §2.7 X4 把可写下限收口为 0.05（下限 >0），避免柔光全灭触发铁律③ 反例。
6. **批次分工微调**：建议的 3 批中，`src/store/a11y.ts` 与 `src/navigation/tabBarStyle.ts` 提前并入批次②——前者是 `colors.ts` 4 套色订阅的必需前置，后者在 `ui.ts` 删除 `card`/`cardOnImage`/`tabBar` 后会悬空引用；为保证每个 commit 自洽而调整，8 项内容与顺序未变。
7. **命名清理口径**：`surfaceGlass*` 4 处既有调用方位于 `src/components/`（P1–P3 范围），P0 改为 `@deprecated` 兼容别名 + 静态守卫「禁止新增」，未删除键以免破坏类型；实际删除留待 P1–P3。

### 环境局限（如实声明）

- `node_modules` 不存在、全局 `tsc` 不可用、GitHub 整体断网（`000`）→ **typecheck 未执行，原因：依赖未安装 + 网络中断**；未跑 `npm install`、未跑任何联网命令。
- 已执行的可做验证：纯 Node 静态守卫（`node --check` + `node scripts/glass-guard.js`）、`grep` 断言、纯 Node 导出/导入一致性脚本、逐文件人工核对、`git diff --stat`。
- 网络恢复后需补跑 `npm run typecheck`，并回填本文件 docs commit 的 hash 与 005 行「待填」（该行对应 HEAD 之前的 `15d4ebc`）。
- **未 push**，按主理人要求由主理人统一推送。

