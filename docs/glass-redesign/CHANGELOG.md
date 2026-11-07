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
| 005 | 2026-11-07 | 文档口径同步 | CHANGELOG 回填 001–003a 的 commit hash；`P0-改动清单.md` 第四节改为 B 路线；`README.md` / `WORKSPACE.md` 更新基线与上云状态 | 留档规则「每批改动即登记」 | — | `15d4ebc` |
| 006 | 2026-11-07 | **最终收口** | 登记 QA Round 2 结论与主理人对 5 条建议的裁决；订正 `lowEnd` 分支与 TDZ 归因两处留档措辞；回填两个 docs commit hash；`README.md` / `WORKSPACE.md` 列全 12 个待推 commit | QA Round 2 报告；主理人汇编 | 见文末「QA Round 2」节 | 本 commit |

## 待登记批次（按 P0 清单顺序，分批 commit / push）

> ✅ **已完成**：004 完成路线 B 基线切换，P0 8 项按 1→8 顺序全部落地（见下文「P0 批次留档」）。**清单内容不变**（8 项 + §9.2 不动清单），仅第四节基线差异口径曾更新。

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
| **docs** | `docs/glass-redesign/CHANGELOG.md`（本文件） | 留档规则「每批改动即登记」「CHANGELOG 不混进代码 commit」 | 纯追加、不覆盖 000–005 历史 | `f89f32d`（主理人于最终收口回填） |

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
7. **命名清理口径（QA Round 1 订正）**：原登记「`surfaceGlass*` 4 处既有调用方位于 `src/components/`」有误。实测 **15 行 / 10 文件**：4 个组件（`GlassCard` / `MemberPicker` / `MiniPlayerBar` / `ScreenHeader`）+ 6 个 screens（`CommunityPostDetailScreen` / `CommunityScreen` / `FollowedRoomsScreen` / `HomeScreen` / `MediaScreen` / `PrivateMessagesScreen`）。**P0 第 3 项实际以 `@deprecated` 兼容别名保留键**（避免破坏类型），并由静态守卫 `surface-glass-naming` 禁止新增；真删留 P1–P3。理由：§9.2 明确禁改 `src/screens/` 与各 Screen，本轮不得触碰这 6 个页面——属「明确不动」清单下的合理权衡，**并非命名清理已完成**。

### 环境局限（如实声明）

- `node_modules` 不存在、全局 `tsc` 不可用、GitHub 整体断网（`000`）→ **typecheck 未执行，原因：依赖未安装 + 网络中断**；未跑 `npm install`、未跑任何联网命令。
- 已执行的可做验证：纯 Node 静态守卫（`node --check` + `node scripts/glass-guard.js`）、`grep` 断言、纯 Node 导出/导入一致性脚本、逐文件人工核对、`git diff --stat`。
- 网络恢复后需补跑 `npm run typecheck` 与真机验证；005 行「待填」已于 P0 增量收口回填 `15d4ebc`，两个 docs commit 完整 hash 已由主理人回填为 `f89f32d` / `14a7bbc`。
- **未 push**，按主理人要求由主理人统一推送。

## P0 增量收口与 QA 独立验证（2026-11-07 · Round 1）

> 本轮为 QA 独立验证后的**有限增量**：只改 4 个文件、1 个代码 commit + 1 个 docs commit、未 push、未扩大范围、未新增依赖、未改任何页面。

### QA 独立验证结论

- QA（software-qa-engineer）对 P0 三批产出做独立验证：**9/9 核心约束 PASS、0 阻断**。
- 验证手法：**注入违规样本 + 真实源码 vm 执行**，证伪出 2 处必须收口的缺口——**G1**（`glassSettings.init()` / `ensurePlatformDegradation()` / `useA11ySync()` 全 src 无调用方，API 26–32 时 `isGlassDegraded()` / `getActiveDegradeReasons()` 与契约不一致）与 **S3**（普通页面仅 `import { GlassSurface }`、无内容层提示 / 无 ScrollView / 无 `layer:'content'` 时守卫 EXIT=0 放行，P1 误接线不会被拦）；另带出顺手项 **S1**（`Math.min(NaN, 0.12)` 透传 NaN）、**S2**（上界写死字面量）、**S4**（留档订正）与 **S5**（import 归置）。
- 主理人改判路由：**Engineer（有限增量）**；G1 / S3 必须修，S1 / S2 顺手修，S4 留档订正；**G2 / S5 明确「只登记不实现」**，留 P1 收口。
- 后续：QA Round 2 回归（任务 #4）验证 G1 与 S3 修复有效性。

### commit 序列（短 hash；P0 四批完整 hash 见上文「P0 批次留档」表）

| commit | 内容 |
| --- | --- |
| `0308bdf` | P0 批次① `src/theme/glass.ts` + `src/theme/index.ts` |
| `7557eb9` | P0 批次② 4 套色 token / 去半透明卡底 / 圆角字号间距 token 化 |
| `194c6d9` | P0 批次③ a11y 接线 / Dynamic Type / 动效档 / 安全区 / 静态守卫 |
| `f89f32d` | P0 docs commit（三批留档 + 全局一致性审查） |
| `baf55e5` | **本轮增量代码 commit**：G1 / S1 / S2 / S3（`src/theme/glass.ts`、`scripts/glass-guard.js`、`scripts/glass-guard.baseline.json`，3 文件 / +51 −9） |
| `14a7bbc` | **本轮增量 docs commit**：本文件 S4 留档订正 + QA 结论 + G2/S5 登记（主理人于最终收口回填） |

### G1 / S3 自证证据（本轮）

- **G1**：纯 Node `vm` 执行**真实** `src/theme/glass.ts`（Node 内置 `module.stripTypeScriptTypes` 擦除类型 + ESM→CJS 机械转写 + 最小 zustand / react-native / AsyncStorage 桩件），分别以 `Platform.Version = 26 / 31 / 33` 重新加载模块：
  - API 26 → `getActiveDegradeReasons() = ["api<31","lensUnavailable(api<33)"]`，`isGlassDegraded() = true`，`resolveGlass('tabs').blurDp = 0`；
  - API 31 → `["lensUnavailable(api<33)"]`，`isGlassDegraded() = true`，`resolveGlass('indicator').lens = null`，`tabs.blurDp = 10`；
  - API 33 → `[]`，`isGlassDegraded() = false`，`indicator.lens ≠ null`；
  - **负对照**：移除模块末尾 `ensurePlatformDegradation()` 调用后重新执行，API 31 返回 `[]` / `false`（即 QA 复现的 G1 缺陷），证明自证对该修复敏感。
  - 实现要点：调用置于**文件末尾**——QA Round 2 的 TDZ 位移实验实测提前调用先撞 `useGlassStore`(:235)，而非早期推断的 `DEGRADE_POLICY`(:357)；结论「必须放末尾」不变。`partialize` 已排除 `activeReasons`，不落盘脏状态。
- **S1 / S2**：同一 harness 断言 `TINT_ALPHA_MAX === 0.12`，且 `resolveTintAlpha()` 对 `NaN` / `±Infinity` 回退 `0.10`、对 `-5` 夹到 `0`、`base 0.10 × tintScale 3` 过上界得 `0.12`，全部 `Number.isFinite` 且 ≤ `TINT_ALPHA_MAX`。
- **S3**：注入仅含 4 行 import 的临时 `src/__glass_guard_probe__.tsx`（`GlassSurface` / `resolveGlass` / `useGlassStore` / `useGlassBudget`）→ 守卫 `EXIT=1` 并报 `[glass-api-access] 新增接入 4 处（基线 0 → 当前 4）`；删除临时文件后 `EXIT=0`，`git status --short` 无临时文件。新规则 R5 基线 `0`，沿用「总数基线、只拦新增」机制。

### G2 / S5：契约已备 / 触发与归置留 P1 收口（本轮只登记不实现）

- **G2（六类 degrade 的运行时触发覆盖）**：6 类入口（`degrade()` 单一路径 + `DEGRADE_POLICY` + `clearDegrade` 可回退）契约齐备，但运行时**自动接通仅 4 类**——`api<31` / `lensUnavailable(api<33)` 由本轮 G1 模块加载前置，`reduceTransparency` / `reduceMotion` 由 `src/store/a11y.ts` 的 App 开关与 `AccessibilityInfo` 读数接通。剩余 2 类：`budget` 依赖 `useGlassBudget().overBudget`，当前**无消费者**调用 `degrade('budget')`；`lowEnd` 仅能经 `assertGlassLayer()` 的**生产分支**（`glass.ts:639` 的 `degrade('lowEnd')`）到达——`:638` 的 `__DEV__` 分支直接抛错、**不**调 degrade（QA Round 2 订正，原登记写反），且仍无主动设备档位检测触发点。**触发点 / 消费者留 P1 收口**，本轮不实现、不改页面。
- **S5（import 归置）**：`colors.ts:202-204` 三条 `import` 置于文件中部（沿用基线写法、功能无碍），lint 归置属代码风格整理，**留 P1 收口**；本轮明确不动 `colors.ts`。

### 留档订正（S4）

- **差异 #7** 已订正：`surfaceGlass*` 实测 **15 行 / 10 文件（4 组件 + 6 screens）**，非「4 处位于 src/components/」；P0 第 3 项实际以 `@deprecated` 兼容别名保留键 + 守卫禁止新增，真删留 P1–P3（§9.2 禁改 screens 下的合理权衡）。
- **005 行「待填」** 已回填 `15d4ebc`（文档口径同步 commit，对应 P0 动工前 HEAD）；上文「环境局限」中对应待办同步改写。

### 本轮环境局限（如实声明）

- **typecheck 未执行，原因：依赖未安装 + 网络中断**（`node_modules` 不存在、全局 `tsc` 不可用、GitHub `000`）；未跑 `npm install` / `npm run typecheck` / 任何联网命令；**未 push**。
- **真机验证未执行**：四倍率实时重绘、API 31/33 双档降级、帧率、对比度实测均属 §11 待实测项；G1 只保证「模块加载后运行时状态与契约一致」，不代替真机效果验证。
- 可做验证已全做：`node --check`、纯 Node vm 真实源码执行（含负对照）、守卫注入样本 `EXIT=1` / 清理后 `EXIT=0`、`grep` 断言、`git status --short` 为空、临时文件已清、改动文件恰好 4 个。

## QA Round 2 回归结论（2026-11-07 · 2 轮硬上限收口）

范围 `f89f32d..HEAD`（`baf55e5` 代码 + `14a7bbc` docs），改动**恰好 4 文件 / +103 −12**。**5/5 PASS、0 阻断、0 一般、路由 NoOne**；84 条断言 / 0 FAIL，**到此收口，不再进入 Round 3**。

- 方法：QA 自建 vm harness（`module.stripTypeScriptTypes` + 自建 ESM→CJS 转写 + 最小 zustand/persist/RN/AsyncStorage 桩件）**整模块执行真实 `glass.ts`**，不采信工程师 harness；含负对照、TDZ 位移实验、守卫违规样本与边界反证。
- **G1 证实**：API 26/30 → `["api<31","lensUnavailable(api<33)"]`、31/32 → `["lensUnavailable(api<33)"]`、33/ios → `[]`；移除模块级调用的负对照复现 Round 1 缺陷；6 个平台下 persist 写入仅含 4 个倍率键，`activeReasons` 从未落盘。
- **S3 证实**：只含 4 行 import 的临时 `.tsx` → 守卫 `EXIT=1`「新增接入 4 处」，其余 6 条规则计数未增（无误伤）；`theme/*.ts` 转发与仓库根 `App.tsx` 均被正确排除。
- **S1 / S2** 按功能断言验证（未用字面量 grep，避免常量化后误报）：`TINT_ALPHA_MAX = 0.12`、NaN/±Infinity 兜底、上界不可突破。
- **无回归**：`git diff --name-only f89f32d..HEAD` = 4；§9.2 不动清单全 0；`DanmakuOverlay.tsx` blob 未变；136 文件 / 750 相对 import / 0 缺失 / 0 环；工作区干净、守卫 EXIT=0。
- QA 自身脚本缺陷 2 处（Round 1）/ 1 处（Round 2，S1 兜底断言误用 `tintScale=3`）均按 QA 规则**自行修复并重跑**，非源码 Bug。

### 主理人对 QA Round 2 五条建议的裁决（均建议级，不打回）

| 编号 | 结论 | 裁决 |
| --- | --- | --- |
| R2-S1 模块加载冗余 AsyncStorage 写入（API<33 冷启动 1–2 次同值写盘） | 非正确性问题 | **接受现状**；P1 若要优化可让 `degrade` 走不触发 persist 的内部 setter，已登记为已知轻微副作用 |
| R2-S2 CHANGELOG 对 `lowEnd` 分支描述写反 | 留档事实错误 | **已在本 commit 订正**：`:638` `__DEV__` 抛错且不调 degrade，`:639` 的 `degrade('lowEnd')` 在生产分支 |
| R2-S3 TDZ 归因措辞不精确 | 实测先撞 `useGlassStore`(:235) 而非 `DEGRADE_POLICY`(:357) | **已订正本文件措辞**；`glass.ts:770-771` 代码注释属代码文件，不在 P0 收口轮次改动，登记 P1 顺手订正；「必须放末尾」结论不变 |
| R2-S4 docs commit hash 未字面量登记 | docs commit 无法自包含自身 hash | **已回填** `f89f32d` / `14a7bbc`，并在 `README.md` / `WORKSPACE.md` 列全待推 commit 清单 |
| R2-S5 `glass-api-access` 作用域观察（`.ts` 未覆盖、按行计数、跳过注释行） | 非缺陷 | **接受现状**；P1 若要收紧可扩到 `.ts` 并改按符号计数 |

### 最终未闭合项（P0 交付边界，非缺陷）

- **上云**：GitHub 整体断网（`000`），本地 commit 未推送；网络恢复后一键推（命令见 `WORKSPACE.md`）。
- **typecheck / 真机**：`node_modules` 未装、无网络 → 未跑 `npm run typecheck`；四倍率实时重绘、API 31/33 实机双档、帧率、对比度均未实测。
- **留 P1–P3**：G2（`budget` 消费者 / `lowEnd` 设备档位检测）、S5（import 归置）、`surfaceGlass*` 真删、274 处数值字面量硬编码圆角批改、`GlassSurface` 与页面视觉接线、玻璃组件规范接入。
- **对象级基线校验**：`e324df4` 不在 shallow clone 对象库；源码内容已与 codeload tarball 逐字节核验，网络恢复后可补 `git fetch --depth 1 origin e324df4...` 复核。

## 引擎重写 E1（2026-11-07）

依据 `引擎重写清单.md`（路线裁决：抛掉 Compose、纯 Kotlin 原生引擎、零依赖）交付能力批次，**页面零接线**（§四 不动清单零越界）。commits：`4842a25`（原生核心）→ `d402735`（JS 桥接）→ 本 docs commit；**未推送**（断网，主理人统一推）。

### 文件清单（新增 6 Kotlin + 新增 2 TSX + 修改 1，与清单 §三 一致）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `android/.../glasskit/GlassCaptureEngine.kt` | 新增 | SparseArray<tag→WeakReference<View>> 注册表；`capture()` 用 getLocationOnScreen 差值平移对齐，clip 玻璃覆盖区后 `targetView.draw(canvas)`；≤1080 宽降采样防 OOM；未布局/尺寸 0 返回 false |
| `android/.../glasskit/GlassLensShader.kt` | 新增 | AGSL 源码常量 + RuntimeShader 构建（仅 API 33+）；SDF 圆角矩形 + 中心差分梯度法线 + 边缘折射位移 + R/G/B 三通道错开色散 |
| `android/.../glasskit/GlassKitView.kt` | 新增 | onDraw 七步管线：捕获→模糊→透镜→tint(H1 钳 0.12)→压暗 #000→1dp #FFF@0.14 描边→圆角 Path clip；OnPreDrawListener 33ms 节流重绘；`setBlurEnabled` 总开关；不设 LAYER_TYPE_HARDWARE |
| `android/.../glasskit/GlassKitManager.kt` | 新增 | SimpleViewManager，12 个 @ReactProp（blurDp/tintAlpha/tintColor(Color)/refractionPx/dispersionPx/cornerRadiusDp/dimmingAlpha/backdropTag/blurScale/tintScale/lensScale/blurEnabled），对齐 LiveExoViewManager 先例 |
| `android/.../glasskit/GlassKitBackdropManager.kt` | 新增 | 空 FrameLayout；onAfterUpdateTransaction 注册（tag=getId()）、onDropViewInstance 注销 |
| `android/.../glasskit/GlassKitPackage.kt` | 新增 | createNativeModules 空列表 + 两个 ViewManager |
| `android/.../MainApplication.kt` | **修改** | 仅 `add(GlassKitPackage())` + 1 行 import（R-07 手动注册惯例） |
| `src/native/GlassKitView.tsx` | 新增 | 类型化 requireNativeComponent；H2 双档门控 + reduceTransparency 门控 + 四倍率 store 订阅 |
| `src/native/GlassKitBackdrop.tsx` | 新增 | forwardRef 包装，children 透传，ref 供 findNodeHandle 取 tag |

### 关键实现决策

1. **捕获方式**：`View.draw(canvas)` 子树采集（清单 §〇 路线核心）。坐标对齐用双方 `getLocationOnScreen` 差值算玻璃在背景坐标系偏移，canvas 先在恒等矩阵下 clipRect 玻璃覆盖区（省内存），再 translate(-offset)+scale(降采样) 绘制；复用位图每帧 `eraseColor(TRANSPARENT)` 防残影。采集上限 ≤1080 宽，超限等比降采样。
2. **AGSL 契约**（GlassLensShader，uniform 与 GlassKitView 喂参一一对应）：`uBlurred`(shader)/`uSize`(float2)/`uRefractionPx`/`uDispersionPx`/`uCornerRadiusPx`。SDF 内部为负；**法线用 SDF 中心差分梯度**（eps=0.5px，免解析分段）。⚠️ **对清单原式符号订正**：原文 `edgeFactor = clamp(1 - sdf/uRefractionPx, 0, 1)`——SDF 形内恒为负 ⇒ 原式形内恒 ≥1、经 clamp 退化为恒 1，整幅内容被均匀平移而非边缘折射；实现改为 `edgeFactor = clamp(1 + sdf/uRefractionPx, 0, 1)`（贴边满位移、向内按 uRefractionPx 线性衰减到 0），符合清单 §二.3「edgeFactor 由到边界距离决定」意图。折射位移 `uv' = uv - normal*edgeFactor*uRefractionPx`（外向法线取负 ⇒ 采样点落向玻璃内部，边缘放大观感）；色散 R/G/B 以 uDispersionPx 的 1.0/0.5/0.0 倍错开采样后取 r/g/b 合成；形外返回透明（与圆角 clip 双保险）。
3. **降级映射**（H2 双档，原生侧只处理 api 两档，其余四类由 JS 门控不挂载/传零）：
   - API 31+ 且硬件画布：RenderNode + `RenderEffect.createBlurEffect(blurDp*blurScale*density, CLAMP)` 真高斯；
   - API 26–30 / 软件画布：降采样 1/4 + 双线性放大近似（复用 canBlur 单档语义）；
   - API 33+ 且 lensScale>0 且 refraction/dispersion>0：小位图作 BitmapShader(CLAMP)+本地矩阵 喂 RuntimeShader，uRefractionPx/uDispersionPx 乘 lensScale；否则跳过透镜（canLens 语义）；
   - reduceTransparency：JS 传 blurEnabled=false → 原生整链兜底（不采集，画半透明兜底底色 + tint/压暗/描边）；
   - H1：tint 最终 alpha = `min(tintAlpha*tintScale, 0.12)`，原生侧 coerceIn 钳制，JS 不重复算。
4. **重绘触发**：backdrop 目标视图挂 `OnPreDrawListener`（恒返回 true 不拦截），33ms（≈30fps）节流：到点 `postInvalidate()`，未到点 `postInvalidateDelayed`；onDetachedFromWindow 与 onDropViewInstance 双路径清理；backdrop 晚挂载时 onDraw 惰性重试解析。

### 验证结果（可做项已全做）

- props 命名 JS↔原生逐一 grep 比对：12/12 一致（GlassKitManager @ReactProp ↔ GlassKitView.tsx GlassKitViewProps）。
- 组件名/包名：`GlassKitView`/`GlassKitBackdrop` 在 Manager NAME、requireNativeComponent、Package 三处一致；包 `com.yk1z.yayamsg.glasskit`，MainApplication import 对齐。
- AGSL 语法静态自查：`half4 main(float2 fragCoord)`、uniform shader/float/float2、用户函数、`uBlurred.eval()`、`half4(0.0)` splat 均为 RuntimeShader 合法子集；无保留字冲突。
- **0 新增依赖**：`git diff --name-only -- '*.gradle' gradle.properties` = 0 条。
- **不动清单 0 越界**：tracked 修改仅 MainApplication.kt（+2 行：import+注册）；页面/ GlassSurface/expo-blur/GlassCard/LiveExoViewManager/glass.ts 均 0 diff；`引擎重写清单.md` 保持 untracked 未混入。
- **编译与真机验证未执行**：无 JDK/Android SDK、断网，`assembleDebug` 与 npm typecheck 均未跑；需 CI（ci-build 分支）或装好工具链后补跑。

### 已知局限

- SurfaceView 视频帧采不到（`View.draw` 不含 SurfaceView 内容，清单 §〇/§五 已登记）；直播画面上玻璃仍是膜层+压暗。PixelCopy 增强本批不做。
- API 33+ 透镜路径的模糊输入为「降采样 1/4+双线性」近似（RenderEffect 离屏出位图需 HardwareRenderer/ImageReader，本批不引入）；31–32 非透镜路径在硬件画布上仍是真高斯。
- 采集/重绘链路按 UI 线程约束实现（registry synchronized 仅兜底）；多玻璃面板同指一个 backdrop 时各自独立捕获，未做共享缓存。
- 新架构（bridgeless）下 SimpleViewManager 需迁 Fabric/Expo Modules——清单 §六 已登记，本批渲染核心（View 层）可原样迁移换壳。
- requireNativeComponent 的 HostComponent ref 类型在 node_modules 未装环境下未经 typecheck 实证，装依赖后首次 typecheck 需关注 `ref as Ref<NativeViewInstance>` 两处断言。

## 引擎 E1 · QA Round 1 修复（2026-11-07）

> QA 对 E1 引擎产出静态证伪后路由 Engineer 做有限增量：只动 `glasskit/` 下 Kotlin + `GlassKitView.tsx` 注释 + 本文件，1 个代码 commit + 1 个 docs commit，**未 push**（断网）。改动：3 文件 / +127 −17。

### QA 结论与修复落点（文件:行号为修复后 GlassKitView.kt 实际位置）

| 编号 | 级别 | 问题 | 修复 | 落点 |
| --- | --- | --- | --- | --- |
| E1 | 一般 | 重挂载后实时更新永久失效：resolveTarget 在 `oldTarget===newTarget` 时早退，detach→re-attach 后 onDetachedFromWindow 已摘 PreDraw listener，re-attach 走早退分支 → 玻璃永不再跟随 | `onAttachedToWindow` 无条件调 `attachPreDraw()`；attachPreDraw 改幂等（挂前先安全移除再挂），重复调用不产生重复 listener | `GlassKitView.kt:225-233` / `:272-281` |
| E2 | 一般 | dead ViewTreeObserver 监听器滞留（泄漏）：backdrop 先卸载时其 observer 已 merge 进根 observer 且 isAlive=false，仅查 `target.viewTreeObserver` 移除静默失败，listener 强引用 glass 泄漏到窗口销毁 | 新增 `attachedObserver` 成员缓存**实际挂 listener 的 observer 实例**；detach 优先用缓存移除，缓存 dead 则用合并后的存活 observer 再试；detach 后清空缓存并置空 `targetView`，无残留引用 | `GlassKitView.kt:209-212` / `:283-305` / `:241` |
| E3 | 一般 | backdrop 晚挂载时玻璃永远卡兜底：targetView==null 时无 invalidate 来源 | resolveTarget 中 `newTarget==null && backdropTag!=NO_ID` 时 `postInvalidateDelayed(100)` **有限重试**（上限 `TARGET_RETRY_MAX=50` 次 ≈5s，找到目标或超上限即停，不无限循环） | `GlassKitView.kt:56-59` / `:254-264` |
| S4 | 建议 | NaN 穿透：onDraw `>0f` 门挡不住 NaN（NaN>0f==false 但 NaN 可喂 uniform） | refractionPx/dispersionPx setter 对非 `isFinite` 值回退 0f，NaN/Infinity 进不了 RuntimeShader | `GlassKitView.kt:97-116` |
| S1 | 建议 | alpha 舍入微超：`Math.round(0.12f*255)=31` → 31/255≈0.1216 超 0.12（0.14 高光同理 36/255≈0.1412） | tint 与高光两处 `Math.round` 改 `Math.floor`（30/255≈0.1176、35/255≈0.1373，恒不超出契约上界） | `GlassKitView.kt:178` / `:389-391` |
| S2 | 建议 | RenderEffect 每帧新建（高频分配压力） | 缓存成员字段（半径/尺寸键控），变化才重建；detach 与 onSizeChanged（releaseBitmaps）路径释放 | `GlassKitView.kt:194-198` / `:319-337` / `:443-444` / `:516-536` |
| S7 | 建议 | tintColor 契约歧义：「字符串或数字均可」 | TSX 两处注释改「必须传数字（processColor 后的 Int）」；GlassKitManager setTintColor 注释同步说明（类型层 `string | number` 本批不动，仅注释收口） | `GlassKitView.tsx:8,42-44` / `GlassKitManager.kt:41-47` |

### 只登记不实现（本批不修）

- **S3**（BitmapShader 原地改写采样一致性）：透镜路径位图复用与采样一致性属真机可观测项，离线无法实证，留真机验证批次。
- **S5**（同 tag backdrop 冲突语义）：多 backdrop 挂同 tag 时注册表语义未定义，留后续批次收口。

### 自检证据

- `git diff --name-only ccfe379..000ef8a` = 3 文件（GlassKitView.kt / GlassKitManager.kt / GlassKitView.tsx），无越界文件；页面、gradle、依赖清单 0 diff。
- grep 断言三处修复落点命中：`attachPreDraw()`（onAttachedToWindow 无条件调用，:232）、`attachedObserver`（成员字段缓存，:212）、`postInvalidateDelayed(TARGET_RETRY_DELAY_MS)`（有限重试，:260）。
- **编译未执行**（无 JDK/Android SDK、断网），改动均为局部 Kotlin/注释，语义经逐行核对；真机/编译验证留 CI 或工具链就绪后补跑。

### commit 序列

| commit | 内容 |
| --- | --- |
| `000ef8a` | 本轮代码 commit：E1/E2/E3 + S1/S2/S4/S7（glasskit/ 2 Kotlin + TSX 注释，3 文件 / +127 −17） |
| 本 commit | docs：本节留档 + `引擎重写清单.md` / `E2-v277迁移清单.md` 归档 |

## 引擎 E1 · QA Round 2 回归（2026-11-07）

> QA 对 QA R1 修复（`000ef8a`）做回归验证：**6/7 PASS、0 阻断**，主场景修复（E1 重挂、E2 主路径、E3 重试、S1/S2/S4/S7）全部确认生效；剩 1 项一般级 **F1**（E2 场景①残余泄漏）需最终修复，另带出 2 项建议级顺手修 **F2** / **F3**。路由 Engineer 有限增量：只动 `GlassKitView.kt` + 本文件，1 个代码 commit + 1 个 docs commit，**未 push**（断网）。

### QA R2 回归结论

- 回归范围 `5449ca1` 前序修复：`git diff --name-only ccfe379..000ef8a` = 3 文件，无越界；QA R1 六项修复静态断言全部命中。
- E1（attach 幂等重挂）、E2（主路径 observer 缓存移除）、E3（有限重试）主场景行为正确；残余缺陷仅在 E2 的**边界时序**下复现（见 F1 泄漏时序）。

### F1 · E2 场景①残余泄漏（一般级，本轮必修）

- **泄漏时序**：glass attach 时 backdrop 尚未 attach → listener 挂在 backdrop 的**子 ViewTreeObserver** → backdrop attach 后子 observer merge 进窗口根 observer、子 observer 变 dead（此时 `attachedObserver.isAlive=false`）→ **backdrop 先卸载**（glass 仍 attached）→ 之后 glass detach：`detachPreDraw` 中 cached dead 不命中第一步 → 降级第二步 `targetView?.viewTreeObserver`——此场景下 targetView 就是已卸载的 backdrop 本身，其 observer 同样 dead/无效 → merge 拷贝进根 observer 的 listener 滞留，glass View 被强引用泄漏至窗口销毁。
- **修法**：`detachPreDraw` 降级链补**第三步**——当 cached dead 且 targetView 的 observer 不可达/无效时，用 **glass 自身 `viewTreeObserver`**（glass 在 attach 期间它就是窗口根 observer）调用 `removeOnPreDrawListener(listener)`。判空 + try 保护（onDetachedFromWindow 内访问自身 viewTreeObserver 合法但仍需防御）；三条路径任何一条成功移除即止，最后统一清空 `attachedObserver`。
- **落点**：`GlassKitView.kt:295-360`（三级降级链重构；第三步 `:337-354`）。

### F2 / F3 · 建议级顺手修（一并落）

- **F2**：`backdropTag` setter 检测到 tag 值变化时把 E3 重试计数器 `pendingResolveRetries` 归零——换新 tag 重新获得完整 50 次重试预算，避免前一个 tag 耗尽的计数连累新 tag 的晚挂载重试提前停摆。落点 `GlassKitView.kt:70-76`。
- **F3**：`dimmingAlpha` / `cornerRadiusDp` 两个 setter 补 `isFinite` 兜底（与 S4 的 `if (value.isFinite()) value else 0f` 同式），统一 NaN/Infinity 防护。落点 `GlassKitView.kt:130`（cornerRadiusDp）/ `:140`（dimmingAlpha）。

### 自检证据

- `git diff --name-only 5449ca1..HEAD` = 恰好 2 文件（`GlassKitView.kt` + 本文件），无越界；gradle / 依赖清单 / 页面 0 diff。
- grep 断言命中：第三降级路径（`viewTreeObserver` 自身移除，`GlassKitView.kt:337` 附近「第三步（F1）」）、`backdropTag` setter 计数归零（`:76` `pendingResolveRetries = 0`）、两处新增 `isFinite`（`:130` / `:140`，连同既有 S4 共 4 处）。
- **编译未执行**（无 JDK/Android SDK、断网），改动均为局部 Kotlin，语义经逐行核对；真机/编译验证留 CI 或工具链就绪后补跑。

### commit 序列

| commit | 内容 |
| --- | --- |
| `e80a3cd` | 本轮代码 commit：QA R2 F1/F2/F3 修复（`GlassKitView.kt`，1 文件 / +71 −18） |
| 本 commit | docs：本节留档（纯追加，不覆盖历史） |

## 玻璃测试页（2026-11-07，用户指令「先新开一个玻璃测试页保证能用」）
- commit `0a20220`：新增 `src/screens/GlassTestScreen.tsx` + 路由注册（`navigation/index.tsx` / `types.ts`）+ 守卫基线 glass-api-access 0→13（批准接线：桥接层 12 + 测试页 1）。
- 内容：GlassKitBackdrop 渐变+色块采集源、4 块参数各异的 GlassKitView（hero 14dp+折射色散 / chip 8dp 胶囊 / 工具条 12dp / clear+dimming0.35）、四倍率 ±0.1 步进实时联动、canBlur/canLens/API 档位显示、模糊总开关、返回主界面。
- 临时首屏开关 `GLASS_TEST_FIRST = true`（navigation/index.tsx 顶部）：打开 App 直进测试页；验证完改回 false 恢复原首屏，路由常驻保留。
- 守卫拦截实录：首版命中 2 处（blob 色 #7ca6ff 撞 Accent 禁色 → 改 #58a6ff；glass-api-access 新增 13 → 批准后更新基线），复跑 EXIT=0。
- 局限：typecheck/编译未执行（依赖未安装+网络中断）；编译成品需网络恢复后 `npm install && cd android && gradlew assembleRelease`。

## typecheck 首战通过（2026-11-07）
- 网络排障后 npm install 成功（1077 包，绕失效代理直连 + 守卫改名绕行）。
- 首轮 tsc 报 3 错（QA 预判点全部命中）：GlassKitBackdrop/GlassKitView 的 ref 类型改 `Component<P> & NativeMethods`；GlassTestScreen processColor 返回 ProcessedColorValue 断言收窄。
- 复跑 **typecheck 全绿**（tsc --noEmit + verify-version ✅）——P0 + E1 引擎 + 测试页首次全部过编译器。
