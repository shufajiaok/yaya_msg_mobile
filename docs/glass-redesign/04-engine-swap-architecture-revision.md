# 04 · 引擎切换架构修订报告：从 `shufajiaok/LiquidGlass` 到 `shufajiaok/liquid-glass-compose`

> **文档性质**：任务 #4 增量修订，独立新文件，**不修改 01 原稿**（`01-architecture-and-component-inventory.md` 保留可追溯）。
> **只读约束**：本轮未修改任何 App / 引擎源码文件，唯一写入是本 Markdown。
> **编写人**：高见远（架构师 / `software-architect`）
> **上游输入**：team-lead 任务 #4 事实清单 + 落盘快照 + `01`（v1.1，812 行）+ `02-apple-liquid-glass-spec.md` + `03-liquid-glass-visual-redesign-plan.md` + WebFetch 上游官方文档。

---

## 0. 前提变更与本报告的判定口径

### 0.1 两项前提变更（用户本轮纠正）

| # | 变更 | 对架构结论的影响 |
| --- | --- | --- |
| P1 | `Xenia0922/yaya_msg_mobile` 是**朋友的仓库**，不是用户自己的；`shufajiaok` 才是用户自己的账号 → 「self-fork 不可行」作废，可正常 fork 到自己账号 | 仅影响 **Phase 2 的维护策略**，不影响「技术栈鸿沟 / 直接可用 = 0」。**核实结果**：`01` 落盘全文 Grep `fork` 仅命中 4 处（`§6.5` JitPack 坐标行、`§7.3 #23` 维护约束、`§7.5 步骤1`、`§9 R8`「是否接受维护 fork」），**`01` 报告中不存在「self-fork 不可行」这一表述**，该说法应来自会话口头讨论而非落盘文档 → 对 `01` 无对应文字修订。但 P1 使「fork 到 `shufajiaok` 账号自行维护」成为合法选项，详见 §8.3。**不臆测**：未核实 `Xenia0922` 与 `shufajiaok` 两账号的实际仓库权限关系，仅采信用户口径。 |
| P2 | 引擎改用 `https://github.com/shufajiaok/liquid-glass-compose`；`shufajiaok/LiquidGlass` **不再是本项目引擎**（保留作对比） | `01` 的 `§0.2` 第 1/7/8/10 条、`§6` 全章、`§7` 全章、`§7.4 理由②`、`§7.5`、`§8.4` 参数表、`§9 R2/R8/R9` 需重判或作废 → 详见 §9。 |

### 0.2 快照事实（已核实 / 未核实）

| 项 | 值 | 证据 / 状态 |
| --- | --- | --- |
| 新引擎落盘路径 | `repo/liquid-glass-compose` | 已核实 |
| 文件数 / 行数 | **4 个文件**：`GlassKit.kt` 364 行、`GlassColors.kt` 70 行、`GlassSettings.kt` 48 行、`README.md` 62 行 | 已核实（`find` + `wc -l`）；`GlassKit.kt` ≈12.9KB |
| 工程形态 | **无 gradle 工程、无 `settings.gradle`、无 `build.gradle`、无 `.jitpack.yml`**；README:14「把 3 个 kt 文件拷进你的 `ui` 包，改 package 即可」 | 已核实 → 是**源码组件集**，不是 AAR / Maven 库 |
| package | `com.jiale.glasskit` | `GlassKit.kt:1`、`GlassColors.kt:1`、`GlassSettings.kt:1` |
| 来源 | 抽自 `TechNews` v2.1.0 | `README.md:4` |
| commit 历史 | team-lead 口径「2 个 commit，2026-09-16 17:32」 | **未核实**：落盘快照**无 `.git` 目录**（`git -C ... log` 返回 `fatal: not a git repository`），无法复核 commit 数与日期，仅采信主理人口径 |
| 旧引擎快照 | `repo/LiquidGlass`，仍在 | 已核实（`01 §6` 全量盘点对象） |

### 0.3 本报告的三条判定纪律

1. **「直接可用」严格定义为**：引擎的 Kotlin / Compose 代码**无需原生桥接、无需改 `android/`、无需新增依赖**即可在 RN App 中渲染。按此定义，新引擎与旧引擎结论**均为 0**（见 §3.1）。
2. **区分「代码直接可用」与「契约 / 数值 / 结构可迁移」**：新引擎在后者上的价值**显著高于**旧引擎（成品组件从 1 个增到 7 个），这不改变前者的结论。
3. **查不到就写「未核实」**：上游 `Dialog` / 独立 window 行为、CMP Android target 产物可用性、`Capsule` 类型兼容性等均明确标注，不臆测。

---

## 1. 新旧引擎逐维对比表

> 旧引擎列证据全部来自 `01 §6`（`LG/README.md`、`LG/liquidglass/*.kt`、`LG/gradle/libs.versions.toml`、`LG/liquidglass/build.gradle.kts`）；新引擎列证据来自本次落盘 4 文件与 §7 WebFetch 核实。

| 维度 | 旧引擎 `shufajiaok/LiquidGlass` (v0.1.3) | 新引擎 `shufajiaok/liquid-glass-compose` | 判定 |
| --- | --- | --- | --- |
| **渲染方案** | 自研：`RenderEffect` / `BlurEffect` 重画**静态 `ImageBitmap` 背板** + 三通道色散 + 边缘光 + `ColorMatrix` 膜层（`01 §6.2 渲染管线①–⑦`） | 委托上游 `com.kyant.backdrop`：`Modifier.layerBackdrop` **图层捕获** + `drawBackdrop` + `effects { vibrancy(); blur(); lens() }`（`GlassKit.kt:38-45,76-92,239-251,295-306`） | **架构级替换**。二者底层**仍是 `RenderEffect`**（上游 `backdrop-effects.md` 原文：「Backdrop effects are `RenderEffect`s radically」），差别在**背板获取方式**而非「是否用 RenderEffect」——此点修正 team-lead 事实清单中「不是自研 RenderEffect」的表述：准确说法是「不是**自研** RenderEffect，背板改用图层捕获」 |
| **背板是否可滚动** | ❌ **必须静态**；`LG/README.md:271`「背板必须是静态的。要模糊滚动内容得换图层捕获方案（本项目没做）」 | ✅ **可捕获滚动内容**：`rememberLayerBackdrop()` + `Box(Modifier.layerBackdrop(backdrop))` 捕获 Composable 实际绘制内容（`README.md:19-27`）；上游 `backdrops.md`「`rememberLayerBackdrop` must be used with `Modifier.layerBackdrop` to draw the Composable's content … It is coordinates-dependent」 | **【核心推翻】** `01 §0.2 第7条` / `§6.6 静态背板` / `§7.3 #20` / `§7.4 理由②` / `§9 R9` 的静态背板前提**全部作废**。但取代约束是「循环捕获红线」，见下 |
| **依赖** | **零三方依赖**：`api(androidx.compose BOM 2024.09.00)` + ui/ui-graphics/foundation/material3；不用 haze / RuntimeShader / AGSL（`01 §6.5`） | **两个外部 Maven 坐标**：`io.github.kyant0:backdrop:2.0.1` + `io.github.kyant0:shapes:1.2.1`（`README.md:10-11`）；上游是 **CMP（Compose Multiplatform）** 库，`org.jetbrains.compose.*` 而非 `androidx.compose.*`（§7） | **更重**。且 `01 §7.3 #22`「App `android/build.gradle:21` 已配 jitpack（有利）」不再相关 → App `android/build.gradle:6,18` 已配 **`mavenCentral()`**（已核实），新坐标走 Maven Central，**无需新增仓库** |
| **组件化程度** | 低：**1 个** `LiquidGlassSurface` + 参数类；示例组件在 `sample/MainActivity.kt`（大卡片 / `DraggableProbe` / 玻璃按钮 / Slider / Switch / `createBackdrop()`），**非库 API** | 高：**7 个可直接映射的成品件** —— `glassSurface` / `glassCompact` / `GlassTopBar` / `GlassRoundButton` / `GlassChipsRow` / `GlassBottomTabs` / `GlassDetailBar` + `GradientBackground` + 2 个 data class（`TabItem` / `GlassBarAction`）+ 2 个私有子组件（`Chip` / `BarAction`），全部在 **1 个 `GlassKit.kt`** 内 | **显著提升**，是新引擎最大增量（§4 映射表） |
| **弹层表现** | 明确退化：`LG/README.md:262`「对话框 / 底部弹层是独立 window，`positionInRoot()` 和主窗口背板对不上，自动退化成膜层 + 边缘光」 | **未核实**：新引擎 `README.md` 与上游 10 篇官方文档（`get-started` / `faq` / `backdrops` / `backdrop-effects` / `glass-bottom-sheet` / 5 篇 tutorial）**均无** `Dialog` / `Popup` / separate window 相关表述（§7.4）。仅知 `layerBackdrop` 是 **coordinates-dependent** | **原「弹层 window 退化」硬约束证据作废，降级为「未核实」**，不得再写入设计规范（见 §9 `§7.3 #19`、`§7.5 步骤6`、`§9 R9`） |
| **API 门槛** | **API 31+（Android 12）** 才有真模糊；<31 只画膜层 + 边缘光（`01 §6.5`、`§9 R2`） | **双档**：`backdrop-effects.md`「They only take effect with **Android 12 and above**」= API 31（blur / vibrancy）；「**Lens (Android 13+)**」「Some effects involving with `RuntimeShader` need **Android 13 and above**」= **API 33**（`lens` / `chromaticAberration` / `gammaAdjustment`）。库自身 `minSdk = 21`（§7.2） | **门槛升高**。App `minSdk 26`（`android/app/build.gradle:108`）→ 26–30 无任何效果、31–32 有 blur 但**无 lens 折射**。`01 §9 R2` 需升级为双档 |
| **性能预算** | 有明确数值：`1 / ≈10 / ≈16` 次每帧绘制，同屏 1–3 块无感、5 张全玻璃掉帧（`LG/README.md:224-240`） | **无**：新引擎 README 三条铁律只定性；上游 `backdrop-effects.md` 无 performance 章节，`llms.txt` 索引 10 页无 limitations / performance 专页 | **证据作废**。`SPEC` M24 / D9「限制同屏玻璃数量」仍成立，但不能再引用旧引擎的绘制次数与「1–3 块」数值（影响 `01 §7.3 #18`、`§9 R1`、03 方案 L163 / L751 / L289） |
| **全局调参** | `GlassParams`（6 参数不可变 data class）+ `staticCompositionLocalOf` 一次下发全树（`01 §6.3`）；`transparency/refractDp/refractMode/edgeWidthDp/edgeGlow/dispersion/legacyBackdrop` + `scrim` | `GlassSettings`（`object` 单例，**4 个 `mutableFloatStateOf(1f)` 倍率**：`blurScale/tintScale/lensScale/glowScale`，建议滑块 0–2.5 / 0–3 / 0–2 / 0–2）+ SharedPreferences("glass")（`GlassSettings.kt:14-47`）；**无 CompositionLocal** | **机制替换**：不可变 data class + 隐式树下发 → 可变全局单例 + Compose Snapshot State，在 draw lambda 内直接读状态实时重绘（`GlassKit.kt:63-64,81,84,243,247,300-301`）。路径 A 应映射为 zustand + AsyncStorage，而非 React Context（§4） |
| **红线** | 无循环捕获风险；硬约束是「背板静态」「弹层退化」「`MaterialTheme` 依赖」「出血节点 `requiredSize`」 | **崩溃级红线**：「`drawBackdrop` 的元素绝不能位于 `layerBackdrop` 捕获子树内 —— 循环捕获导致 RenderThread `SIGSEGV` 栈溢出（点一下就崩）」（`README.md:34-37`）；另有三条调参铁律 | **新增架构约束**（§6）。上游官方给出更精确的解法 `exportedBackdrop`（§7.4），与新引擎 README 的「移出子树」是**两种不同解法** |
| **与本项目契合度** | 低：静态背板 vs 30 页全屏滚动列表根本冲突；弹层退化 vs 大量 RN `Modal` | **结构上高、工程上仍低**：`README.md:26`「你的内容，这里不能出现任何玻璃」+ `:37`「玻璃件一律放控件层，内容层里不放玻璃」与 `SPEC` **D1 完全一致且是引擎级硬约束**；图层捕获让「滚动内容从玻璃下透出」（M1）成为可能。但技术栈鸿沟、源码组件集形态、CMP 版本链、API 33 门槛、以及 6+ 处 Apple 规范冲突仍在 | **「规范契合度」↑↑，「可直接落地性」不变**。这正是 §8 建议「路径 A 为体 + 新引擎契约为蓝本」的依据 |

---

## 2. 新引擎全量盘点

### 2.1 文件与职责

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `GlassKit.kt` | 364 | 全部组件、Modifier、data class、私有子组件；文件头 `:50-65` 写明三条铁律与崩溃红线 |
| `GlassColors.kt` | 70 | 调色板（6 色）+ 文本样式（4 个）+ `GradientBackground()` L0 背板 |
| `GlassSettings.kt` | 48 | 4 个全局倍率 + SharedPreferences 持久化契约 |
| `README.md` | 62 | 集成（2 坐标）、结构硬要求、组件表、滑块说明、三条铁律、红线 |

### 2.2 全部公开 Composable / Modifier 签名、参数与默认值

> 以下**逐字**取自落盘 `GlassKit.kt` / `GlassColors.kt`；「硬编码」指写在函数体内、不可由调用方覆盖的值。

#### A. 基础 Modifier

| API | 完整签名 | 默认值 | 内部行为与硬编码 |
| --- | --- | --- | --- |
| `Modifier.glassSurface` (`GlassKit.kt:70-92`) | `fun Modifier.glassSurface(backdrop: Backdrop, shape: Shape, blurDp: Dp = 14.dp, tint: Color = GlassTint): Modifier` | `blurDp = 14.dp`、`tint = GlassTint`（#DCE6FF @ α0.10） | `.drawBackdrop(backdrop, shape = { shape }, effects = { vibrancy(); blur(blurDp.toPx() * GlassSettings.blurScale) }, onDrawSurface = { drawRect(tint.copy(alpha = (tint.alpha * GlassSettings.tintScale).coerceIn(0f,1f))); drawOutline(shape.createOutline(...), Color.White.copy(alpha = 0.14f), Stroke(1.dp.toPx())) })` → **vibrancy + blur + tint + 1dp 白色 @0.14 边缘高光**（跟随圆角） |
| `Modifier.glassCompact` (`GlassKit.kt:95-99`) | `fun Modifier.glassCompact(backdrop: Backdrop, shape: Shape, tint: Color = GlassTint): Modifier` | — | 等价于 `glassSurface(backdrop, shape, blurDp = 8.dp, tint)`；**小件模糊固定收窄到 8dp**，不随 `blurScale` 之外的参数变化 |

#### B. 顶栏与按钮

| API | 完整签名 | 硬编码尺寸 / 字号 / 色值 |
| --- | --- | --- |
| `GlassTopBar` (`:103-130`) | `@Composable fun GlassTopBar(title: String, subtitle: String?, backdrop: Backdrop, onAction: (() -> Unit)? = null, actionIcon: Painter? = null, actionDescription: String = "操作", modifier: Modifier = Modifier)` | `fillMaxWidth().height(56.dp)`；`RoundedCornerShape(22.dp)`；`padding(horizontal = 18.dp)`；title 用 `TitleMedium`（**16sp Bold / lineHeight 22sp**）；subtitle 用 `TertiaryStyle`（**11sp / 15sp**）；`onAction != null && actionIcon != null` 时才渲染 `GlassRoundButton` |
| `GlassRoundButton` (`:132-158`) | `@Composable fun GlassRoundButton(painter: Painter, contentDescription: String, backdrop: Backdrop, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = TextPrimary)` | `size(44.dp)`；按压 `graphicsLayer { scaleX = scaleY = 0.92f }`（`collectIsPressedAsState`）；`glassCompact(backdrop, CircleShape)`；`.clip(CircleShape).clickable(indication = null)`；图标 `Modifier.size(20.dp)` + `ColorFilter.tint(tint)` |

#### C. 筛选 Chip 行

| API | 完整签名 | 硬编码 |
| --- | --- | --- |
| `GlassChipsRow` (`:162-178`) | `@Composable fun GlassChipsRow(categories: List<String>, selected: String?, backdrop: Backdrop, onSelect: (String?) -> Unit, allLabel: String = "全部", colorOf: (String) -> Color = { Accent })` | `Row(Modifier, horizontalArrangement = Arrangement.spacedBy(8.dp))`；**刻意不加 `fillMaxWidth`**（`:171` 注释「外层可能包在 horizontalScroll 里，无界宽度下该修饰符失效」）；首项固定 `Chip(allLabel, Accent, selected == null, ...)` 触发 `onSelect(null)` |
| `Chip`（private, `:180-208`） | `private fun Chip(label: String, color: Color, selected: Boolean, backdrop: Backdrop, onClick: () -> Unit)` | 按压缩放 `0.94f`；`glassCompact(backdrop, RoundedCornerShape(50), tint = if (selected) color.copy(alpha = 0.34f) else GlassTint)`；`.clip(RoundedCornerShape(50))`；`padding(horizontal = 14.dp, vertical = 8.dp)`；`BasicText(13.sp, color = if selected Color.White else TextSecondary, fontWeight = if selected Bold else Normal)` → **选中态 tint α = 0.34**（见 §2.7 内部矛盾） |

#### D. 底部标签栏（玻璃叠玻璃，:210-309）

| API | 完整签名 | 硬编码与算法 |
| --- | --- | --- |
| `data class TabItem` (`:212`) | `data class TabItem(val label: String, val icon: Painter)` | — |
| `GlassBottomTabs` (`:221-309`) | `@Composable fun GlassBottomTabs(tabs: List<TabItem>, selected: Int, onSelect: (Int) -> Unit, backdrop: Backdrop, barBackdrop: LayerBackdrop, modifier: Modifier = Modifier)` | `BoxWithConstraints`；`tabWidth = constraints.maxWidth.toFloat() / tabs.size`；`Animatable(selected.toFloat())` + `LaunchedEffect` `spring(dampingRatio = 0.85f, stiffness = 380f)`（`:232-235`）<br>**Row（bar 本体）**：`.layerBackdrop(barBackdrop)` + `.drawBackdrop(backdrop = backdrop, shape = { Capsule() }, effects = { vibrancy(); blur(10.dp.toPx() * GlassSettings.blurScale) }, onDrawSurface = { drawRect(GlassTint × tintScale) })` + `.height(64.dp).fillMaxWidth().padding(5.dp)`（`:237-255`）<br>**每个 tab**：`Spacer(10.dp)` / `Image(height = 20.dp)` tint 为 `Accent`(选中) 或 `TextSecondary` / `Spacer(2.dp)` / `BasicText(fontSize = 10.sp, ...)` / `Spacer(10.dp)`（`:268-283`）<br>**选中指示器（Row 的兄弟节点）**：`graphicsLayer { translationX = anim.value * tabWidth }` + `padding(5.dp)` + `height(54.dp)` + `fillMaxWidth(1f / tabs.size)` + `.drawBackdrop(backdrop = barBackdrop, shape = { Capsule() }, effects = { lens(8.dp.toPx() * lensScale, 10.dp.toPx() * lensScale, chromaticAberration = true) }, onDrawSurface = { drawRect(Color.White.copy(alpha = 0.05f)) })`（`:288-307`） |

> **关键结构**（`:214-220` 注释）：bar 自身把最终渲染结果（含玻璃面与文字）导出为 `barBackdrop`，指示器折射的是 **`barBackdrop` 而非主 `backdrop`**，因此「指示器滑到哪个 tab 上方，那个 tab 的文字是从透镜里折射出来的，不会被盖住」。README:47 同述。**红线自查**：指示器是 bar 的**兄弟节点**（不在 `Row` 子树内）→ 新引擎认为不构成循环捕获。**§6.3 给出需实测的疑点**。

#### E. 底部操作栏（:311-364）

| API | 完整签名 | 硬编码 |
| --- | --- | --- |
| `data class GlassBarAction` (`:313-318`) | `data class GlassBarAction(val icon: Painter, val label: String, val tint: Color = TextSecondary, val onClick: () -> Unit)` | `tint` 默认 `TextSecondary` |
| `GlassDetailBar` (`:320-338`) | `@Composable fun GlassDetailBar(actions: List<GlassBarAction>, backdrop: Backdrop, modifier: Modifier = Modifier)` | `fillMaxWidth().height(64.dp)`；`glassSurface(backdrop, Capsule(), blurDp = 12.dp)`（覆盖默认 14dp）；`padding(horizontal = 8.dp)`；`actions.forEach` → `BarAction(..., Modifier.weight(1f), ...)` |
| `BarAction`（private, `:340-364`） | `private fun BarAction(painter, label, tint, modifier = Modifier, onClick)` | 按压缩放 `0.93f`；`.clip(CircleShape)`；`Image(height = 20.dp)`；`Spacer(2.dp)`；`BasicText(label, TextStyle(fontSize = 10.sp, color = tint))` |

#### F. 背景与设置

| API | 签名 | 内容 |
| --- | --- | --- |
| `GradientBackground` (`GlassColors.kt:35-70`) | `@Composable fun GradientBackground(modifier: Modifier = Modifier)` | `Box(fillMaxSize().drawBehind { ... })`：垂直渐变 `Color(0xFF0B1022) → 0xFF121A36 → 0xFF0C1226`；3 个 `drawCircle(Brush.radialGradient(...))` 柔光团：① `#4C7DF0` @ `alpha = 0.55f * glow`，`radius = size.width * 0.72f`，`center = (0.88w, 0.10h)`；② `#9D5CFF` @ `0.42f * glow`，`radius 0.78w`，`center (0.02w, 0.52h)`；③ `#18B8D4` @ `0.36f * glow`，`radius 0.68w`，`center (0.78w, 0.96h)`。`glow = GlassSettings.glowScale` |
| `GlassSettings` (`GlassSettings.kt:14-47`) | `object`（非 Composable），见 §2.4 | — |

### 2.3 硬编码尺寸 / 字号全量汇总（供 `glass.ts` token 化）

| 类别 | 值 | 出处 |
| --- | --- | --- |
| 模糊半径 | `14.dp`（`glassSurface` 默认）/ `8.dp`（`glassCompact`）/ `12.dp`（`GlassDetailBar`）/ `10.dp`（`GlassBottomTabs` bar） | `GlassKit.kt:73,99,330,243` |
| 边缘 | `1.dp` 白色 `@0.14` 描边；指示器 surface 白色 `@0.05`；选中 Chip tint `@0.34` | `:88-89,305,193` |
| 高度 / 尺寸 | 顶栏 `56.dp`；圆钮 `44.dp`；图标 `20.dp` / `20.dp`(高)；底栏 `64.dp`；指示器 `54.dp`；操作栏 `64.dp` | `:116,146,156,271,252,293,329` |
| 圆角 | 顶栏 `RoundedCornerShape(22.dp)`；Chip `RoundedCornerShape(50)`；bar / 指示器 / 操作栏 `Capsule()`（来自 `com.kyant.shapes`，`:45`） | `:117,192,195,242,297,330` |
| padding / spacing | 顶栏 h`18.dp`；Chip `14×8.dp`；Chip 行 `spacedBy(8.dp)`；bar `5.dp`；tab 上下 `10.dp`、图标-文字间 `2.dp`；操作栏 h`8.dp` | `:118,197,172,254,268,274,283,292,331` |
| **字号** | **16sp Bold**（TitleMedium）/ **14sp**（BodyStyle·死代码）/ **13sp**（Chip）/ **12sp**（SecondaryStyle·死代码）/ **11sp**（TertiaryStyle）/ **10sp**（`GlassBottomTabs` tab label、`:278`；`BarAction` label、`:362`） | `GlassColors.kt:24-27`、`GlassKit.kt:202,278,362` |
| 弹簧 | `spring(dampingRatio = 0.85f, stiffness = 380f)` | `:234` |
| 按压缩放 | `0.92f`（圆钮）/ `0.94f`（Chip）/ `0.93f`（BarAction） | `:148,187,353` |
| lens | `refractionHeight = 8.dp × lensScale`、`refractionAmount = 10.dp × lensScale`、`chromaticAberration = true` | `:299-303` |

### 2.4 `GlassSettings` 契约（`GlassSettings.kt` 全量）

| 成员 | 类型 / 默认 | 建议滑块区间 | 被谁读取 |
| --- | --- | --- | --- |
| `blurScale` | `var by mutableFloatStateOf(1f)` | `0–2.5`（`:15`） | `glassSurface:81`、`GlassBottomTabs:243` |
| `tintScale` | 同上 | `0–3`（`:17`） | `glassSurface:84`、`GlassBottomTabs:246-248` |
| `lensScale` | 同上 | `0–2`（`:19`） | `GlassBottomTabs:300-301` |
| `glowScale` | 同上 | `0–2`（`:21`） | `GradientBackground:37,49,56,63` |
| `prefs` | `private var SharedPreferences? = null` | — | `init/persist` |
| `init(context)` | `getSharedPreferences("glass", Context.MODE_PRIVATE)`，读 `blur/tint/lens/glow` 四个 Float，缺省 `1f`（`:26-33`） | — | 需在 Activity 显式调用（README:54） |
| `persist()` | `edit().putFloat(×4).apply()`（`:35-42`） | — | 设置页改动后调用 |
| `reset()` | 四值置 `1f` + `persist()`（`:44-47`） | — | — |

> **契约缺口（影响路径 A / Phase 2）**：① 纯**原生单例 + SharedPreferences**，RN 侧 zustand / AsyncStorage 无法直接读写 → Phase 2 必须加 `@ReactProp` / JSI 桥接；② **无「关闭玻璃」总开关**，四个倍率都是增强倍率（`blurScale=0` 只关模糊，tint / lens / glow 仍在）→ 不满足 `SPEC` 5.1 Reduce Transparency 降级；③ **无 `reduceTransparency` / `reduceMotion` / DynamicType 任何分支**（三文件 Grep 0 命中）；④ `tintScale` 允许到 3，但**没有把 alpha 夹到铁律① 的 0.12**（`GlassKit.kt:84` 只 `coerceIn(0f, 1f)`）→ 见 §2.7。

### 2.5 `GlassColors.kt` 全量值

| 符号 | 值 | 备注 |
| --- | --- | --- |
| `TextPrimary` | `#F2F5FA`（`Color(0xFFF2F5FA)`，`:17`） | 主文字 |
| `TextSecondary` | `#9CA8BC`（`:18`） | 次级文字 / tab 未选中 / `GlassBarAction.tint` 默认 |
| `TextTertiary` | `#6B7688`（`:19`） | 三级文字 |
| `GlassTint` | `#DCE6FF` @ **alpha 0.10**（`:20`） | 玻璃基色，符合铁律① ≤0.12 |
| `CardTint` | `#18213A` @ **alpha 0.55**（`:21`） | **死代码**：`GlassKit.kt` 0 命中 |
| `Accent` | `#7CA6FF`（`:22`） | 选中态 / 默认 `colorOf` |
| `TitleMedium` | **16sp Bold** / lineHeight 22sp / `TextPrimary`（`:24`） | 顶栏标题 |
| `BodyStyle` | 14sp / 21sp / `TextPrimary`（`:25`） | **死代码** |
| `SecondaryStyle` | 12sp / 17sp / `TextSecondary`（`:26`） | **死代码** |
| `TertiaryStyle` | 11sp / 15sp / `TextTertiary`（`:27`） | 顶栏副标题 |
| 渐变 3 色 | `#0B1022` / `#121A36` / `#0C1226`（`:44`） | L0 背板 |
| 柔光 3 色 | `#4C7DF0` @0.55 / `#9D5CFF` @0.42 / `#18B8D4` @0.36（各 × `glowScale`）（`:49,56,63`） | 提供「明暗起伏」 |

### 2.6 三条铁律与一条红线（原文与出处）

| # | 原文 | 出处 |
| --- | --- | --- |
| 铁律① | 「tint alpha ≤ 0.12 —— tint 一高就糊成不透明色块」 | `GlassKit.kt:54`、`README.md:60` |
| 铁律② | 「大面积面板只用 vibrancy + blur，禁用 lens（透镜在大区域上整面糊死）；lens 只留给小面积选中指示器」 | `GlassKit.kt:55-56`、`README.md:61` |
| 铁律③ | 「玻璃身后必须有明暗起伏（见 `GradientBackground`），纯黑背景模糊完就是一块纯色，看不出『透』」 | `GlassKit.kt:57-58`、`README.md:62` |
| **红线** | 「**`drawBackdrop` 的元素绝不能位于 `layerBackdrop` 捕获子树内**（循环捕获 → RenderThread `SIGSEGV` 栈溢出）」「玻璃件一律放控件层，内容层里不放玻璃」 | `GlassKit.kt:60-61`、`README.md:34-37` |

**结构硬要求**（`README.md:16-32`，逐字骨架）：
```kotlin
val backdrop = rememberLayerBackdrop()      // 主捕获层
val barBackdrop = rememberLayerBackdrop()   // 底栏捕获层（玻璃叠玻璃用）
Box(Modifier.fillMaxSize()) {
    Box(Modifier.fillMaxSize().layerBackdrop(backdrop)) {
        GradientBackground()               // 必须：给玻璃身后提供明暗起伏
        /* 你的内容，这里不能出现任何玻璃 */
    }
    Column(Modifier.fillMaxWidth().statusBarsPadding()) { ... }   // 控件层
    GlassBottomTabs(tabs, selected, onSelect, backdrop, barBackdrop, Modifier.align(Alignment.BottomCenter))
}
```

### 2.7 引擎内部矛盾与死代码（核实所得，非照抄事实清单）

| # | 发现 | 证据 | 影响 |
| --- | --- | --- | --- |
| X1 | **引擎自身违反铁律①**：选中 Chip 的 `tint = color.copy(alpha = 0.34f)` 传入 `glassCompact`，最终 `drawRect` 的 alpha 达 **0.34**（× `tintScale` 后更高），远超 0.12 | `GlassKit.kt:190-194` vs `:54` | 选中态会「糊成不透明色块」，与铁律① 自相矛盾 → 照搬会同时违反 `SPEC` D5 |
| X2 | **滑块可突破铁律①**：`tintScale` 建议区间到 `3`，`GlassTint.alpha 0.10 × 3 = 0.30`，而 `glassSurface` 只 `coerceIn(0f, 1f)` 未夹到 0.12 | `GlassSettings.kt:17`、`GlassKit.kt:84,246-248` | 设置页把 tint 拉高即破坏玻璃感；路径 A 的 `glass.ts` 必须补 `Math.min(alpha, 0.12)` 上界 |
| X3 | **3 个导出符号是死代码**：`CardTint` / `BodyStyle` / `SecondaryStyle` 在 `GlassKit.kt` 中 **0 命中** | `GlassColors.kt:21,25,26` + `grep -n` 核实 | 全量盘点时不应把它们算作「组件配色」；也说明这套色板是抽自 TechNews 后未清理的残留 |
| X4 | **`glowScale = 0` 触发铁律③ 反例**：柔光 3 团 alpha 全部归零，背景变成纯深色渐变 | `GlassColors.kt:49,56,63` | 滑块下限应设 >0 或在 `glowScale` 低时降级玻璃，否则「纯色一坨」 |
| X5 | `Capsule()` 来自 `com.kyant.shapes`（`:45`），而上游 `backdrop-effects.md` 要求「To use the lens effect, your `shape` must be `CornerBasedShape`」 | `GlassKit.kt:45,297` vs §7.3 | **未核实** `com.kyant.shapes.Capsule` 是否满足 `CornerBasedShape` / 是否提供 `minCornerRadius`；Phase 2 需实测 lens 是否抛错或出现圆角不连续 |
| X6 | 组件内硬编码 `10.sp`（2 处）、`13.sp`（1 处）与 `Color.White` / `Accent` 直接量，无 token 层 | `GlassKit.kt:202,278,362,88,193,203,279,305` | 见 §5 冲突 C4 / C5 |
| X7 | 无 `androidx.compose.material3` 依赖（README:4「无 Material 依赖、无资源文件依赖」） | `README.md:4` | **相对旧引擎是改善**：`01 §6.6`「`MaterialTheme` 依赖 → 桥接需自建 MaterialTheme 包装」与 `§7.5 步骤2` 的这一复杂度**不再存在** |

---

## 3. 【核心】23 行复用性判定表重判

### 3.1 三个必须先定死的「是 / 否」

| 问题 | 结论 | 依据 |
| --- | --- | --- |
| **Q1：新引擎在 RN App 中「直接可用」项是否仍为 0？** | **是，仍为 0（判定保留）** | App：`app.json:9` + `android/gradle.properties:38` `newArchEnabled=false`（Paper 老架构）；`MainActivity.kt:13` `class MainActivity : ReactActivity()`（**非 `ComponentActivity`**、无 `setContent`）；`android/app/build.gradle:2` 仅 `apply plugin: "org.jetbrains.kotlin.android"`（Android Kotlin，**非 KMP**），`:204-221` 依赖块**无 `androidx.compose.*`、无 `org.jetbrains.compose.*`、无 `buildFeatures { compose = true }`、无 `kotlin-compose` 插件**；`package.json` 全部 TS/React 依赖。新引擎 3 个 kt 文件全部是 `@Composable` / `Modifier` 扩展（package `com.jiale.glasskit`），**必须**拷进 `android/` + 改 package + 引入 2 个 Maven 坐标 + 开 Compose 构建特性 + 写 ViewManager 桥接。**换引擎不改变这一事实。** |
| **Q2：「静态背板 → 引擎不适配滚动列表」是否被推翻？** | **是，完全推翻** | 新引擎用 `rememberLayerBackdrop()` + `Modifier.layerBackdrop()` 图层捕获（`README.md:19-27`），上游 `backdrops.md` 明确 `rememberLayerBackdrop` "must be used with `Modifier.layerBackdrop` to draw the Composable's content"。**旧引擎 `LG/README.md:271` 的静态背板限制在新引擎中不存在。** 连带作废：`01 §0.2 第7条`、`§6.6 静态背板行`、`§7.3 #20`、`§7.4 理由②`、`§7.5 步骤4/6`、`§9 R9`。**但**：取代它的「循环捕获红线」同样要求玻璃件在内容捕获子树之外，且这条与 `SPEC` D1 同向 → 「玻璃只用于浮层、不进内容层」的**结论保留，理由从「技术做不到」升级为「引擎硬约束 + 规范要求」**。 |
| **Q3：「大量 RN `Modal` → 弹层里只能退化成膜层」是否保留？** | **否，不能保留，降级为「未核实」** | 新引擎 README 与上游 10 篇官方文档**均无** Dialog / Popup / separate window 表述（§7.4）。唯一相关线索是 `backdrops.md`「It is **coordinates-dependent**」——据此**可推断**独立 window 坐标不同可能取不到主 backdrop，但**这是推断，不是核实结论**。`01 §7.3 #19`「直接可用（约束）·★关键」与 `§9 R9` 不得再作为硬约束引用；`03` 方案 L120 / L587 的「Modal 统一不用真模糊」做法**可以保留为保守规避**，但其理由须改写为「跨 window backdrop 行为未核实 + `SPEC` M31/D18 一次只 1 个 sheet」，而非引用旧引擎退化说明。 |

### 3.2 逐行重判表（对应 `01 §7.3` 的 23 行）

> **图例**：`保留` = 结论不变（措辞/数值更新）；`推翻` = 结论反向或证据失效；`作废` = 对应对象在新引擎中不存在，该行删除；`部分` = 概念保留但机制替换。

| # | `01 §7.3` 原判定项 | 原结论 | **新结论** | 类别 | 重判理由（带证据） | 新引擎对应物 / 落地 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `LiquidGlassSurface`（玻璃本体） | 不可用·需原生桥接 | **不可用·需原生桥接；形态从 `@Composable` 变为 `Modifier` 扩展** | 保留 | 技术栈鸿沟不变（Q1） | `glassSurface` / `glassCompact`（`GlassKit.kt:70-99`）；路径 A 复刻「vibrancy + blur + tint + 1dp @0.14 描边」配方 |
| 2 | `GlassBackdrop` + `LocalBackdrop` | 不可用·需迁移（静态 `ImageBitmap` + `positionInRoot()`） | **推翻**：新引擎**无** `GlassBackdrop` / `LocalBackdrop`；改为 `rememberLayerBackdrop()` + `Box(Modifier.layerBackdrop(backdrop))` **图层捕获**，背板不是图片、不需 `positionInRoot()` | 推翻 | `README.md:19-27`；`GlassKit.kt:39-40` import `com.kyant.backdrop.backdrops.LayerBackdrop/layerBackdrop` | 路径 A：RN 侧建立 `contentLayer` / `controlLayer` 兄弟节点（§6.2） |
| 3 | `rememberBackdropImage(File)` | 不可用·需迁移 | **作废**：新引擎**无此 API**；背板由 `GradientBackground()` 代码自绘，不需要图片文件 | 作废 | `GlassColors.kt:35-70`；`01 §7.5 步骤4`「`@ReactProp` 传背景图路径」同步作废 | `GradientBackground` ↔ `App.tsx:701-709`（§4） |
| 4 | `GlassParams` + `LocalGlassParams`（六参数一次下发全树）★推荐 | 需迁移·概念可直接复用 | **部分**：「全局单一来源」概念**保留**；机制**推翻** —— 从「不可变 `data class` + `staticCompositionLocalOf` 隐式下发」变为「`object` 可变单例 + 4 个 `mutableFloatStateOf` + draw lambda 内直读」 | 部分 | `GlassSettings.kt:14-22`；`GlassKit.kt:63-64,81,84,243,247,300` | 路径 A 建议映射为 **zustand + AsyncStorage**（而非 03 方案 L283 的 React Context），因新引擎是运行时可变全局状态而非树上下发 |
| 5 | `GlassDefaults`（默认值 + 推荐区间 + COMPACT 档）★推荐 | 需迁移·数值可直接复用 | **推翻**：新引擎**无 `GlassDefaults`**；默认值散落在各 Modifier 签名与函数体硬编码（14/8/12/10dp、22dp、56/64/44dp、10/13/16sp…） | 推翻 | §2.2 / §2.3 全表 | 需在 `glass.ts` 中**从代码反向提取**建 token；不可再照抄 `01 §6.3` 的 `transparency/refractDp/dispersion` 六参数表 |
| 6 | `RefractMode.SCALE / FIELD` | 不可用·需原生桥接/迁移 | **作废**：新引擎**无此枚举**，改为单个 `lens(refractionHeight, refractionAmount, depthEffect, chromaticAberration)` 效果函数（上游 `backdrop-effects.md`） | 作废 | `GlassKit.kt:299-303`；`RefractMode.kt` 不存在于新快照 | 路径 A 无对应；Phase 2 用 `lens`，**需 API 33+** |
| 7 | `Backdrop` / `LocalBackdrop` 契约 | 需迁移·契约思想可复用 | **部分**：`LocalBackdrop` **消失**（不再隐式下发，全部显式函数参数）；`Backdrop` 契约**保留**且扩展为 `Backdrop` / `LayerBackdrop` / `rememberCombinedBackdrop` / `rememberCanvasBackdrop` / `emptyBackdrop`（上游 `backdrops.md`） | 部分 | `GlassKit.kt:38,71,96,107,166,226-227,323` 均显式传参 | 路径 A：`BackdropSource` 接口可保留但简化为「内容层 View ref」 |
| 8 | 示例：大玻璃卡片（120dp） | 不可用·需原生桥接；「一页 5 张卡全玻璃明显掉帧」 | **推翻（对象消失）**：新引擎**不提供**大玻璃卡片组件；且铁律② 明确「大面积面板只用 vibrancy + blur，**禁 lens**」 | 推翻 | `GlassKit.kt:55-56`；`README.md:61` | 内容层不放玻璃（D1）仍成立，但理由不再是「性能预算数值」 |
| 9 | 示例：`DraggableProbe`（可拖动玻璃） | 不可用·需原生桥接 | **作废**：新引擎无可拖动玻璃组件 | 作废 | `GlassKit.kt` 无 `pointerInput` / `detectDragGestures` | — |
| 10 | 示例：玻璃按钮（`COMPACT_BLUR`） | 不可用·需原生桥接 | **保留**：新引擎有成品 `GlassRoundButton`（44dp + 按压 0.92 + `glassCompact`）；「小控件收窄模糊」规则保留且更明确（14dp → **8dp**） | 保留 | `GlassKit.kt:95-99,132-158` | ↔ `src/components/HeaderAction.tsx` / `ScreenHeader.tsx:83-84`（§4） |
| 11 | 示例：折射 Slider / legacy Switch（实验台）★ | 直接可用（概念）·可复刻设置页 | **保留（概念）/ 部分（对象）**：新引擎无实验台组件，但 `GlassSettings` 四倍率 + 建议区间 + README:56 指向 TechNews `SettingsScreen.kt` 自绘滑块 → 「设置页玻璃实验台」可复刻；`legacyBackdrop` 概念删除 | 部分 | `GlassSettings.kt:15-22`、`README.md:51-56` | ↔ `src/screens/SettingsScreen.tsx`（已核实存在） |
| 12 | 示例：`createBackdrop()`（代码画渐变背板） | 需迁移 | **推翻（升格为硬约束）**：`GradientBackground()` 不是示例，是结构**必需件**（README:25「必须：给玻璃身后提供明暗起伏」） | 推翻 | `README.md:24-27`；`GlassColors.kt:29-34` 注释 | ↔ `App.tsx:701-709`；路径 A 用已装的 `expo-linear-gradient`（`PlayerChrome.tsx:3`）+ 绝对定位圆块复刻 |
| 13 | blur / tint / refraction / dispersion / highlight / edge light（具体算法） | 不可用·需桥接或重写 | **推翻**：新引擎**不自研算法**，全部委托上游 `com.kyant.backdrop.effects.*` 二进制库 → 从「可复用 Kotlin 算法」变为「依赖外部闭源/二进制产物」，**代码级可复用性反而下降** | 推翻 | `GlassKit.kt:41-44,80-81,243,299` | Phase 2 只需引坐标，不再需要移植 `LiquidGlass.kt` 50.8KB |
| 14 | 边缘光三层渐变 / 内缘亮带 / 顶部 12dp 白雾 | 需迁移·视觉规范可复用 | **推翻（大幅简化）**：新引擎只有 **1dp 白色 @0.14 描边**（`drawOutline(..., Stroke(1.dp))`），无三层渐变、无 12dp 白雾 | 推翻 | `GlassKit.kt:85-90`；对照 `01 §6.2` 的 `GLASS_TOP_SHEEN 12.dp` | 路径 A 近似成本显著降低 |
| 15 | 色散（chromatic aberration） | 不可用·需原生桥接（自研三通道） | **推翻**：变为 `lens(..., chromaticAberration = true)` 的**布尔参数**；且 `lens` 需 **Android 13+ (API 33)** | 推翻 | `GlassKit.kt:302`；`backdrop-effects.md`「Lens (Android 13+)」 | `01 §7.3 #15` 的「RN 侧无等价」仍成立；`01 §9 R2` 需升双档 |
| 16 | `legacyBackdrop`（0.5.1 错位开关） | 不可用·且不建议（反面经验） | **作废**：新引擎无此概念 | 作废 | 新快照 Grep `legacy` 0 命中 | — |
| 17 | **API 31+ 真模糊 / <31 降级策略** ★推荐 | 直接可用（策略） | **推翻（升级为双档）**：blur / vibrancy = **API 31 (Android 12)**；`lens` / `chromaticAberration` / `gammaAdjustment` = **API 33 (Android 13)** | 推翻 | `backdrop-effects.md` 逐字：「They only take effect with Android 12 and above. Some effects involving with `RuntimeShader` need Android 13 and above.」「## Lens (Android 13+)」 | `glass.ts` 的 `canBlur` 需拆成 `canBlur`(≥31) / `canLens`(≥33) 两条；`01 §9 R2`、`§8.4` 同步修 |
| 18 | **性能预算（同屏 1–3 块、面数×绘制次数）** ★推荐 | 直接可用（规范） | **推翻（证据作废）**：新引擎无性能预算数值，上游 API 页无 performance 章节、`llms.txt` 10 页无 limitations/performance 专页 | 推翻 | §7.5 | `SPEC` M24 / D9 仍约束数量，但 `01 §9 R1`「1/≈10/≈16 绘制次数，同屏 1–3 块」与 03 方案 L163 / L289 / L751 的引用**失去引擎侧依据**，须改标为「`SPEC` 建议值 + 待真机实测」 |
| 19 | **弹层 window 退化说明** ★关键 | 直接可用（约束）·规定 Modal 内不用真模糊 | **推翻 → 未核实**：新引擎与上游官方文档均无 Dialog / 独立 window 表述 | 推翻 | §7.4（Q3） | 做法可保留为保守规避，**理由必须改写**；不得再写「引擎 README 自承退化」 |
| 20 | **静态背板限制** ★关键 | 直接可用（约束）·决定「玻璃只用于浮层、不模糊滚动列表」 | **【核心推翻】** 图层捕获可捕获滚动内容，静态背板限制不存在 | 推翻 | Q2；`README.md:19-27` | **结论「玻璃只用于浮层」保留**，但理由换成「循环捕获红线（`GlassKit.kt:60-61`）+ `SPEC` D1/M1」；「不模糊滚动列表」这条**删除**（新引擎恰恰能模糊滚动内容） |
| 21 | 背板遮罩 / 文字可读性经验 | 直接可用（规范）·`scrim = 0.55` | **推翻**：新引擎**无 `scrim` 概念**；可读性改由「tint α ≤0.12 铁律 + `GradientBackground` 明暗起伏 + vibrancy」承担 | 推翻 | `GlassKit.kt:54,57-58,80` | `01 §8.4` 的 `scrim: 0.55` 与 `01 §7.3 #21` 作废；`dimming=0.35` / `contentScrim` 分档管理**保留**（那是 `SPEC` M7 与 App 背景遮罩，不来自引擎） |
| 22 | JitPack 坐标 / 源码引入方式 | 不可用·需原生桥接前置（App 已配 jitpack，有利） | **推翻**：新引擎走 **Maven Central** 两个坐标，无需 JitPack、无需云端现编 | 推翻 | `README.md:9-12`；App `android/build.gradle:6,18` 已配 `mavenCentral()`（已核实） | `01 §7.5 步骤1` 整行重写；`§9 R8`「JitPack 首次需云端现编」作废 |
| 23 | 上游 HealthCheckIn 同步表 | 直接可用（维护约束）·fork 后双份代码同步 | **推翻**：上游变为 **Kyant0/AndroidLiquidGlass**（+ TechNews v2.1.0 抽出处），无 HealthCheckIn | 推翻 | `README.md:3-4`、`:56` | 维护对象改为「跟随 `backdrop` 版本升级」+ P1 允许 fork 到 `shufajiaok` 账号 |
| **合计** | — | — | **推翻 13 条（#2,5,6,8,12,13,14,15,17,18,19,20,21,22,23 中的 13 项）/ 作废 3 条（#3,9,16）/ 部分 3 条（#4,7,11）/ 保留 3 条（#1,10 及 Q1 主结论）** | — | 口径：#2/#5/#6/#8/#12/#13/#14/#15/#17/#18/#19/#20/#21/#22/#23 = 15 条发生结论变更，其中 #6/#8/#9/#16 兼「对象消失」；**#1/#10/Q1 是仅有的 3 个实质保留项** | — |

### 3.3 新增判定项（旧表没有、新引擎特有）

| 新# | 能力 / 约束 | 能否直接在 RN App 使用 | 明确结论 | 依据 | 落地路径 |
| --- | --- | --- | --- | --- | --- |
| N1 | `rememberLayerBackdrop()` + `Modifier.layerBackdrop()` 图层捕获（滚动内容） | **否**（Compose Modifier） | 代码不可复用，**结构思想可复用** | `README.md:19-27`、上游 `backdrops.md` | 路径 A：RN 视图树分层；Phase 2：原生桥接 |
| N2 | `exportedBackdrop` 参数（上游官方崩溃修复） | **否** | Phase 2 **必须采用** | `glass-bottom-sheet.md` CORRECT code：「Use `exportedBackdrop` in `drawBackdrop` modifier, **it will skip drawing the content**」 | §6.3 |
| N3 | 4 个成品组件 `GlassTopBar` / `GlassChipsRow` / `GlassBottomTabs` / `GlassDetailBar` | **否（代码）** / **是（结构·尺寸·交互契约迁移）** | 新引擎最大增量：App 功能层组件可 1:1 对照改造 | `GlassKit.kt:103,163,222,321` | §4 映射表 |
| N4 | `GlassBottomTabs`「bar 兄弟节点 + 第二 `LayerBackdrop` + lens 折射 bar 自身图层」 | **否** | Phase 2 需真机验证不触发 loop | `GlassKit.kt:214-220,237-307` | §6.3 X 项 |
| N5 | `GlassSettings` 四倍率 + SharedPreferences("glass") | **否**（原生单例） | 路径 A 改 zustand + AsyncStorage；Phase 2 需 `@ReactProp` 桥 | `GlassSettings.kt:26-47` | §4 |
| N6 | `GradientBackground()` 作为**强制结构件** | **否**（Compose Canvas） | 路径 A 用 `expo-linear-gradient` 复刻；**必须保留明暗起伏** | `GlassColors.kt:35-70`、`README.md:25` | §4 |
| N7 | 三条铁律（tint ≤0.12 / 大面积禁 lens / 背景明暗起伏） | **是（规范可直接复用）** | 直接写入 `glass.ts` 与设计验收 | `GlassKit.kt:53-58` | §8.2 |
| N8 | 循环捕获红线 | **是（约束可直接复用）** | 路径 A 转译为架构约束，Phase 2 转译为 `exportedBackdrop` | `README.md:34-37`、官方 `glass-bottom-sheet.md` | §6 |
| N9 | 「内容层零玻璃、控件层玻璃」结构硬要求 | **是（结构可直接复用）** | 与 `SPEC` **D1 完全一致且更强**（违反即崩溃） | `README.md:26-29,37` | §5 加分项 C9 |
| N10 | **CMP 多平台依赖链**（Kotlin 2.4.10 / AGP 9.3.2 / Compose 1.12.0 / compileSdk 37 / JVM 11） | 不适用 | **新增构建风险**，比旧引擎版本链更激进 | §7.2 / §7.3 | §8.3、§9 R8 |
| N11 | `lens` 需 **API 33**、shape 须为 `CornerBasedShape` | 不适用 | **新增兼容性风险**（`Capsule` 类型未核实，X5） | `backdrop-effects.md` | §5 C7 |
| N12 | 引擎内部矛盾 X1–X4（选中 Chip α0.34、滑块破铁律、死代码、`glowScale=0`） | 不适用 | 照搬前必须修正 | §2.7 | §5 C3/C4 |

---

## 4. 新组件 → App 功能层组件映射表

> **App 侧文件全部已核实存在**（`YAYA` = `repo/yaya_glass_ui_rework`）。行号来自本次 `grep` / `sed` 实测。「拟建」= 当前**不存在**（`src/theme/glass.ts` 已确认 MISSING）。

| 新引擎组件 | 关键契约 | App 侧对应文件（含行号证据） | 现状差异 / 改造要点 |
| --- | --- | --- | --- |
| `GlassBottomTabs` | 64dp 高 / `Capsule` / bar 挂 `layerBackdrop(barBackdrop)` + `drawBackdrop(主backdrop, vibrancy + blur 10dp)` / 选中指示器是**兄弟节点**用 `lens(8,10,chromaticAberration=true)` 折射 bar 自身 / `spring(0.85, 380)` / tab label **10.sp** | **`src/components/AppTabBar.tsx`**（243 行）：`:21` `import { BlurView } from 'expo-blur'`；`:119-122` `BlurView` `intensity={isDark ? 62 : 82}`；`:188` `bar.borderRadius: 28`；`:191` `minHeight: 64`；`:231` `cell.borderRadius: 28`（**与 bar 同为 28 → 同心几何反例**） | 高度 64 已一致；圆角 28 需按 `SPEC` S17 改「bar 28 / padding 8 → cell 20」；`BlurView` 是单层平铺 4 层，**无成组容器**（M23）、无选中指示器折射、无弹簧位移；新引擎的「指示器折射 bar 自身图层」是 App 完全没有的能力。**10sp 标签不得照搬**（§5 C1） |
| `GlassTopBar` | 56dp / `RoundedCornerShape(22.dp)` / h-padding 18dp / title `TitleMedium` **16sp Bold** / subtitle 11sp / 尾端单个 `GlassRoundButton` | **`src/components/ScreenHeader.tsx`**（100 行）：`:75` `paddingHorizontal: 12`；`:83-84` 返回按钮 `36×36`、`borderRadius: 18`；`:93` `title.fontSize: 24`、`fontWeight: '800'`、`letterSpacing: -0.3`；另有 **`src/components/HeaderAction.tsx`**（52 行）承载右侧文字操作 | App 标题 24/800 更接近「英雄文字」诉求，**优于**新引擎 16sp；22dp 顶栏圆角低于 `SPEC:195` 建议的 28–32dp（§5 C4）；新引擎 56dp vs App 无显式高度；`ScreenHeader` 无玻璃、贴边（`position: relative`）→ 需浮层化 |
| `GlassChipsRow` + `Chip` | 胶囊 `RoundedCornerShape(50)` / padding `14×8` / **13sp** / 选中 `color.copy(alpha=0.34)` / Row `spacedBy(8.dp)` / 刻意不加 `fillMaxWidth` 以兼容 `horizontalScroll` | **`src/components/Pill.tsx`**（67 行）：`:47` `fontSize: 14`；`:61-62` `paddingHorizontal: 14, paddingVertical: 7`；`:63` `borderRadius: radii.pill`；底色 `filled ? palette.tint : palette.fill3`（实底，**自称玻璃但非玻璃**）<br>**`src/screens/MediaScreen.tsx`**：`:1691-1707` `segmentWrap` / `segmentCell` / `segmentText fontSize: 14`；`:1708-1735` `groupChips` → `:2183` `groupChip paddingHorizontal:16, paddingVertical:7, borderRadius: radii.pill`、`:2184` `groupChipText fontSize: 13, fontWeight: 700`；`:1738-1740` `memberChip`；`:1769-1780` `dateChipRow`<br>**`src/screens/FollowedRoomsScreen.tsx`**：`:2360-2419` `chatToolsClip` + `BlurView`（第 2 处真 blur，`:2364` `experimentalBlurMethod="dimezisBlurView"`）内的 segment / 搜索 / 粉丝过滤 / 上麦入口 | `Pill` 与 `groupChip` 已是胶囊且尺寸接近（14×7~8、13–14sp），可直接作为 `GlassChipsRow` 的 RN 落点；**选中 α0.34 不得照搬**（X1 / D5）；`GlassChipsRow` 不加 `fillMaxWidth` 的注释对 RN `horizontalScroll` 同样适用 |
| `GlassDetailBar` + `GlassBarAction` | `Capsule()` / `blurDp = 12.dp` / 64dp 高 / h-padding 8dp / 动作 `weight(1f)` / 图标 20dp + label **10.sp** | **`src/player/chrome/PlayerChrome.tsx`**（665 行）：`:3` `LinearGradient`；`:38` 注释「渐变遮罩顶栏 + 悬浮底坞」；`:284` 顶栏渐变；`:383-385` `bottomShade`；`:586-587` `dockWrap: position absolute, bottom 0, zIndex 31`；`:583-585` `bottomShade height 200`；`:605,611` `ctrlBtn 40×40 / borderRadius 20`；`:639` `rateChip borderRadius 12`<br>**聊天输入底坞**：`src/screens/FollowedRoomsScreen.tsx:2425` `TextInput`、`:2510` 另一 `TextInput`；`:2782` `chatToolsClip borderRadius: 18`、`:2783` `chatTools`、`:2830` `input borderRadius: radiiAlias.input` | 播放器「悬浮底坞 + 底部渐变遮罩」与 `GlassDetailBar` 语义最贴合，且属 `SPEC` 6 场景表的「直播播放器 + 悬浮控制条（`clear` 唯一合法场景）」；但 **R3（SurfaceView 不可被 backdrop blur 采样）** 仍成立 → 建议保持「渐变 + 0.35 dimming + 边缘高光」近似，不做 backdrop blur。聊天工具条已有真 `BlurView`，是最接近「玻璃底坞」的现成资产 |
| `GlassRoundButton` | 44dp 圆形 / 按压 0.92 / `glassCompact` 8dp / 图标 20dp / `CircleShape` | **`src/components/HeaderAction.tsx`**（52 行）：`:35` `fontSize: 14, fontWeight: '700'`；`:43-48` `btn: minWidth: 54, paddingVertical: 4`；`hitSlop: 8`<br>**`src/components/ScreenHeader.tsx:83-84`**：`36×36 / borderRadius: 18` 返回按钮 | **语义对应、形态不对应**：`HeaderAction` 是**文字**按钮（且 `SPEC` M27/D12 要求符号优先、文字控件与符号控件隔离），不是圆形图标钮；更贴切的落点是 `ScreenHeader` 的 36×36 返回按钮（且 36dp < `SPEC:232` 的 48dp 触控建议）。改造时应新增「图标-only 圆钮」，保留 `HeaderAction` 的文字语义 |
| `glassSurface` / `glassCompact` | `drawBackdrop(vibrancy + blur + tint + 1dp @0.14 描边)`；14dp / 8dp | **拟建 `src/theme/glass.ts`（已确认不存在）** + 拟建 `GlassSurface` 容器（03 方案 §3.5 L287 已规划） | 01 §8.4 / 03 §3.5 的 `GLASS_DEFAULTS` 六参数需按 §2.3 重做；`GlassSurface` 应**一个容器**承载全部效果以对应 M23 成组渲染，替代 `AppTabBar.tsx` 的多层平铺 |
| `GlassSettings` | 4 倍率 + SharedPreferences("glass") + `init/persist/reset` | **拟建 `src/theme/glass.ts`** + **`src/screens/SettingsScreen.tsx`**（已核实存在） | 建议 zustand store + AsyncStorage（不是 React Context），并补 `degrade()` / `useGlassBudget()` / `canBlur(≥31)` / `canLens(≥33)` / 「减少透明效果」开关（03 方案 L565 已规划设置页承载） |
| `GradientBackground` | 深色渐变 + 3 柔光团（明暗起伏，**铁律③ 必需**） | **`App.tsx:701-709`**（已核实）：`:701` `<ImageBackground ... resizeMode="cover">`、`:709` 整体压暗遮罩 `rgba(11,11,15,0.88)` / `rgba(245,245,247,0.92)`；`:641` 根容器 `backgroundColor: backgroundSource ? 'transparent' : palette.background`；**`src/theme/colors.ts:96-101`** `usePageBackground()`；**`src/navigation/index.tsx:185`** `sceneStyle: {backgroundColor:'transparent'}`、`:266` navTheme transparent、`:270` `bgScrim 0.34`、`:303` `cardStyle transparent` | 新引擎的渐变背板与 App 的自定义背景图是**两种机制**：App 已有用户自定义背景图 + 整体压暗（按 `01` v1.1 裁决属 **C1a 合规、必须保留**，满足 `SPEC` M9 背景 bleed）。**不得**用 `GradientBackground` 替换掉它；只把「背景必须有明暗起伏」作为**校验规则**（纯色/纯黑背景时给出提示或降级）。`0.88/0.92/0.34` 归一到单一 `contentScrim` token 的口径**保留**，且与 `clear` 背后的 `dimming=0.35` 分档管理（`01 §8.4`、03 方案 L273-275） |

---

## 5. 与 Apple 规范冲突点（对照 `02-apple-liquid-glass-spec.md` M/D 编号）

| # | 冲突点 | 新引擎证据 | `SPEC` 条款 | 判定与处置 |
| --- | --- | --- | --- | --- |
| C1 | **10.sp < 官方最小 11 pt** | `GlassKit.kt:278`（tab label）、`:362`（`BarAction` label） | `SPEC:176`「最小字号 iOS/iPadOS **11 pt**【官方硬值】→ 任何文字（含弹幕角标、时间、榜单序号）**≥ 11 sp**」；`:58` 同；关联 **M20**（Dynamic Type）、**D15**（大字号不截断/不丢层级） | 🚫 **违规，不得照搬**。路径 A 与 Phase 2 一律改 ≥11sp（建议 11–12sp），并接 Dynamic Type |
| C2 | **`tint α ≤ 0.12` vs `clear` 背后 `#000@0.35` dimming** | 铁律① `GlassKit.kt:54`；`GlassTint α0.10`（`GlassColors.kt:20`）；全 4 文件**无 dimming 层实现** | **M7**（`SPEC:76`）、`SPEC:210`「`#000000` @ `opacity 0.35`，仅作用于 `clear` + 亮底；**它是玻璃背后的 dimming，不是控件底板（不违反 D2）**」、`:211` 亮度阈值建议 | ⚠️ **机制缺口，不是数值冲突**：铁律管的是**玻璃自身 tint**，M7 管的是**玻璃背后的独立压暗层**，二者语义不同、可共存（与 `01` v1.1 对 `contentScrim` / `dimming` 的分档口径一致）。新引擎**没有**实现 M7 → 在直播页 `clear` + 亮底场景必须**由 App 侧补一层 `#000@0.35`**（`PlayerChrome` 已有 `bottomShade` 渐变可承载）。**不得**用提高 tint 来替代 dimming（会同时违反铁律① 与 D2） |
| C3 | **深色优先单一调色板 vs 四套色 token** | `GlassColors.kt:15` 注释「调色板：深色优先」；全量仅 6 色 + 4 文本样式，**无 light / increased-contrast 变体** | **M18**（`SPEC:87`）「light / dark / increased contrast(light) / increased contrast(dark)；**Even if your app ships in a single appearance mode, provide both light and dark colors**」；`:216`【官方硬值】；**D7**（`:118`）禁硬编码系统色 | 🚫 **违规**：缺 3 套。且 App 现有 `src/theme/colors.ts` 只有 light/dark 2 套（01 §9 R5），**两边都缺** → 新建 `glass.ts` 时统一补 4 套，不照搬 `GlassColors` 常量 |
| C4 | **bar 22dp / 56dp / 64dp vs 方案 28–32dp** | `GlassTopBar:117` `RoundedCornerShape(22.dp)`；`:116` `height(56.dp)`；`GlassBottomTabs:252` / `GlassDetailBar:329` `height(64.dp)` | `SPEC:194-195`「大悬浮卡片 **24–32 dp**【建议值】；功能层大容器 **28–32 dp**；中等控件 **16–20 dp**；胶囊用于高度 ≤56dp 的按钮；内容层卡片 12–16dp」；**S17**（`:157`）同心几何 | ⚠️ 22dp 落在「中等控件 16–20」与「大容器 28–32」之间，属**分类不明**；64dp 高的 bar 用 `Capsule()` 则圆角 32dp 合规。建议：顶栏若定为「大容器」→ 28dp；若定为「中等控件」→ 20dp。另 `Chip` 的 `RoundedCornerShape(50)` 是**固定 dp 值而非百分比**，与「胶囊 = 高度一半」语义不符（Chip 高约 8+13+8+描边 ≈ 31dp → 半高 ≈15.5dp，50dp 会被钳制），路径 A 应改 `borderRadius: 999` |
| C5 | **组件内硬编码字号 / 色值 vs D7** | 10/13/16sp 直接写在 `BasicText(TextStyle(...))`；`Color.White @0.14`、`@0.05`、`color.copy(alpha=0.34)`、`Accent` 直接量（`:88,193,202,203,278,279,305,362`） | **D7**（`:118`）「禁止硬编码系统色值 / 重定义语义色」；**D5**（`:116`）「Refrain from adding color to the background of multiple controls」「Apply color sparingly」；**M5**（`:74`）按语义挑材质 | 🚫 **违规 + 引擎自身矛盾 X1/X2**：选中 Chip `α0.34` 既破铁律① 又触 D5。处置：全部提到 `glass.ts` token；选中态改「加边缘高光 / 文字加粗」而非加 tint 浓度（与 `GlassKit.kt:203-204` 已有的 `Color.White + Bold` 呼应） |
| C6 | **无 `reduceTransparency` / DynamicType / Reduce Motion 降级** | `GlassKit.kt` / `GlassColors.kt` / `GlassSettings.kt` Grep `reduceMotion` / `AccessibilityInfo` / `DynamicType` / `fontScale` **0 命中**；`spring(0.85, 380)`（`:234`）、按压缩放 `0.92/0.93/0.94` 无关闭路径；`GlassSettings` 无「关闭玻璃」开关 | **M35**（`:104`）Reduce Motion 降级；**D20**（`:131`）禁 Reduce Motion 下继续缩放 / z 轴 / 进出模糊；**M34**（`:103`）动效可选；**D19**（`:130`）；`SPEC:257` Increase Contrast、`:317` Reduce Transparency 降级为高不透明实色、`opacity ≥ 0.9`（`:317`） | 🚫 **违规（P0 新建）**：新引擎在这条上**与旧引擎同样为 0 覆盖**（01 §9 R5 结论保留）。`glass.ts` 必须新增 `degrade(reason)` 单一降级路径，同时服务 `api<31` / `lens 不可用 api<33` / `reduceTransparency` / `reduceMotion` / `lowEnd` / `budget` |
| C7 | **`chromaticAberration = true` 是否属官方 sparingly 范畴** | `GlassKit.kt:299-303`：仅 `GlassBottomTabs` 的**小面积选中指示器**（`54dp` 高、`fillMaxWidth(1/tabs.size)`）用 `lens(8dp,10dp,chromaticAberration=true)`，且铁律② 明确「lens 只留给小面积选中指示器」 | **M4**（`:73`）「自定义控件要 sparingly，把效果限制在最重要的功能元素」；**D4**（`:115`）禁滥用自定义玻璃控件；**S22**（`:162`）Lensing 不是简单高斯模糊；`SPEC` **未**给 chromatic aberration 专门条款 | ✅ **位置上属 sparingly 范畴，判定「合规」**（唯一 lens 点、面积小、是选中态这一最重要功能元素），**但附 3 个条件**：① `lens` 需 **API 33+**（`backdrop-effects.md`），低版本必须降级；② `Capsule` 是否满足 `CornerBasedShape` **未核实**（X5 / §7.3）；③ `8dp/10dp` 折射量在 54dp 高指示器上是否过大需真机验证。另 `SPEC` M4 是定性条款，无量化边界，不臆测判定 |
| C8 | **导航标签固定彩色 `Accent` vs 单色外观** | `:272` `colorFilter.tint(if (isActive) Accent else TextSecondary)`、`:279` tab label 同；`Chip` 选中 `colorOf` 默认 `Accent` | **M17**（`:86`）避免标签色与内容层背景相近；**S2**（`:142`）「玻璃默认无色；小组件（toolbar/tab bar）符号文字默认**单色**，底内容亮则变深、暗则变浅」；**S3**（`:143`）彩色内容层 → 导航用单色外观；**D6**（`:117`） | ⚠️ 固定 `#7CA6FF` 不随背景明暗自适应，与 S2 冲突。App 内容层是用户自定义背景图（彩色）→ 按 S3 应改单色外观；`Accent` 建议只留作**唯一 tinted prominent 主行动**（01 §9.2 第 10 项 / `SPEC` 6.7 口径） |
| C9 | **【加分项】「内容层不放玻璃」与 D1 的一致性** | `README.md:26`「你的内容，这里**不能出现任何玻璃**」、`:28-29`「控件层：玻璃件放这里」、`:37`「玻璃件一律放控件层，内容层里不放玻璃」；`GlassKit.kt:60-61` 红线「`drawBackdrop` 元素绝不能位于 `layerBackdrop` 捕获子树内」 | **D1**（`SPEC:112`）「Don't use Liquid Glass in the content layer.」；**M1**（`:70`）玻璃形成「控件与导航的功能层」；**M2**（`:71`）内容层用 standard materials | ✅ **完全一致，且是加分项**：新引擎把 D1 从「规范条文」升级为**引擎级硬约束**——违反不只是视觉层级混乱，而是 **RenderThread `SIGSEGV` 崩溃**。这是新引擎相对旧引擎（旧引擎靠「静态背板」间接限制，且与滚动列表冲突）**最大的规范契合度提升**。同时 `README.md:19-27` 的「背景 bleed + 内容层 + 控件层兄弟结构」与 `SPEC` **M9**（全屏背景延伸到 bar 下方）/ **M8**（控件与内容视觉分离、不垫底板）同向。**应明确写入方案作为正向依据** |
| C10 | 其他连带冲突 | `GlassRoundButton:146` `size(44.dp)`；`GlassBottomTabs` 多个组件各自 `drawBackdrop`、无成组容器；`GlassTopBar` 16sp 无英雄文字；无 scroll edge effect | **`SPEC:232`** Android 触控目标 **≥48×48dp**（【建议值】，iOS regular 44pt 已达标）；**M23**（`:92`）多个玻璃组件必须放进 `GlassEffectContainer`；**M24/D9**（`:93/:120`）限制同屏玻璃数量；**M8/M10/D10**（`:77/:79/:121`）scroll edge effect；`:58` Large Title **31pt** | ⚠️ ① 44dp < 48dp 建议值；② 新引擎「每个组件各自 `drawBackdrop`」与 M23 成组渲染相悖 → 路径 A 的 `GlassSurface` 单容器 + `useGlassBudget()` 更合规；③ 新引擎**没有**英雄文字组件，与用户「英雄文字」诉求冲突，App 现有 `ScreenHeader:93` 24/800 与 `typography.largeTitle 34` 反而更接近，不应反向降级到 16sp；④ 无 scroll edge effect，App 侧须自行补（01 §8.1 / 03 方案） |

---

## 6. 循环捕获红线如何转译

### 6.1 红线原始表述（两层，务必区分）

| 层 | 表述 | 出处 |
| --- | --- | --- |
| 新引擎 README | 「`drawBackdrop` 的元素绝不能位于 `layerBackdrop` 捕获子树内 —— 循环捕获会导致 RenderThread `SIGSEGV` 栈溢出（点一下就崩）。玻璃件一律放控件层，内容层里不放玻璃。」 | `README.md:34-37`；`GlassKit.kt:60-61` |
| **上游官方（更精确）** | WRONG code：`Column(Modifier.layerBackdrop(bottomSheetBackdrop).drawBackdrop())` 内含 `Box(Modifier.drawBackdrop(backdrop = bottomSheetBackdrop))` → 「Because the `layerBackdrop` modifier will draw the content to the `bottomSheetBackdrop`, and the content will draw the `bottomSheetBackdrop`, **it's a loop**!」→ `Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR), fault addr 0x__ in tid __ (RenderThread), pid __`<br>**CORRECT**：「Use `exportedBackdrop` in `drawBackdrop` modifier, **it will skip drawing the content**」 | `glass-bottom-sheet.md` Steps 2/3 + Final code；`faq.md`「Why did it crash?」指向该页 |
| 官方 API 补充 | `rememberLayerBackdrop`「must be used with `Modifier.layerBackdrop` … or it's derived by using `exportedBackdrop` parameter of the `drawBackdrop` modifier. **It is coordinates-dependent.**」另有 `rememberCombinedBackdrop`（merge，用于 tabs/sliders）、`rememberCanvasBackdrop`（coordinates-independent） | `backdrops.md` |

> **重要差异**：新引擎 README 的解法是「**把玻璃移出捕获子树**」（`GlassBottomTabs` 把指示器做成 bar 的兄弟节点）；上游官方教程的解法是「**用 `exportedBackdrop` 跳过内容绘制**」，允许玻璃与捕获在同一子树内共存。二者都能避免 loop，但**官方方案更通用**（尤其对「玻璃叠玻璃」的 sheet / 弹层场景）。Phase 2 不应只照抄新引擎 README。

### 6.2 路径 A（RN 侧 `expo-blur` 等效）下的转译

RN 侧**没有** Compose `layerBackdrop` 图层捕获，`expo-blur` 是 View 级 backdrop 采样，因此 **RenderThread `SIGSEGV` 循环崩溃风险在路径 A 下不存在**。但红线必须转译为下列**架构约束**，否则会出现等价的「采样自身 / 视觉黑洞」问题：

| # | 约束 | 落地位置 | 对应 `SPEC` |
| --- | --- | --- | --- |
| A1 | RN 视图树显式分两层兄弟节点：**内容层**（`ImageBackground` + `ScrollView`/`FlatList` + 卡片，**零玻璃**）/ **控件层**（`AppTabBar`、`ScreenHeader` 浮层、`PlayerChrome` dock、`MiniPlayer`、`AppToast`）。玻璃容器**不得**作为内容层滚动容器的后代 | `App.tsx:641,701-709` 根结构；`src/navigation/index.tsx` 全局浮层挂载点（`AppToast` / `MiniPlayer` / `PipToggleBridge` 已在导航根，天然是内容层兄弟节点 → 合规） | **D1 / M1 / M9 / M8** |
| A2 | `BlurView` **不得采样自身或其祖先链中的玻璃容器**；每个 `GlassSurface` 单一容器承载全部效果，禁止 4 层独立平铺互相采样 | 拟建 `GlassSurface`（03 方案 §3.5 L287）；替换 `AppTabBar.tsx:119-158` | **M23**（成组容器）/ **D9** |
| A3 | `glass.ts` 增加 `layer` 白名单断言：`layer === 'content'` 时直接 `degrade()` 为实色 / 开发期报错（03 方案 L288 已有此契约，**保留**） | 拟建 `src/theme/glass.ts` | **D1** |
| A4 | 玻璃容器计数白名单固定「直播页 ≤3 个真玻璃容器」（`AppTabBar` / `PlayerChrome` 悬浮底坞 / 全局 `MiniPlayer`）；弹幕 `DanmakuOverlay`（无 blur 无底板）与 `AppToast` **不计入**；Sheet 按模态例外处理 | `01 §8.3 第7步` / `§9 R1` 口径**保留**（但不再引用旧引擎性能预算数值，改标 `SPEC` M24/D9 建议值 + 真机实测） | **M24 / D9 / M31** |
| A5 | RN `Modal` / sheet 内**不做真模糊**（高不透明膜层 + 边缘光 + 同心圆角） | 03 方案 L587 保留；**理由改写**为「跨 window backdrop 采样行为未核实（§7.4）+ `SPEC` M31/D18」，**删除**「引擎 README 自承退化」 | **M31 / D18 / 5.1** |
| A6 | 背景必须有明暗起伏（铁律③）：纯色/纯黑背景时给出提示或降级；`glowScale` 类参数下限 >0 | `src/theme/glass.ts` + `SettingsScreen.tsx` | 铁律③ / **M19** |

### 6.3 Phase 2（原生桥接）下的转译

| # | 约束 / 动作 | 明确结论 |
| --- | --- | --- |
| B1 | **两个 Maven 坐标**：`implementation("io.github.kyant0:backdrop:2.0.1")` + `implementation("io.github.kyant0:shapes:1.2.1")` | `README.md:10-11`；上游 `backdrop/build.gradle.kts` `coordinates("io.github.kyant0","backdrop","2.0.1")` 与 `libs.versions.toml kyantShapes="1.2.1"` 已核实。发布到 **Maven Central**（vanniktech `publishToMavenCentral()`），App `android/build.gradle:6,18` 已配 `mavenCentral()` → **无需新增仓库**（旧引擎的 JitPack 需求作废） |
| B2 | **是否需 Compose 构建特性** | **是**。`android/app/build.gradle` 需加 `buildFeatures { compose = true }` + `org.jetbrains.kotlin.plugin.compose`（Kotlin **2.4.10** 精确对齐）+ Compose foundation / ui / ui-graphics。**额外未核实项**：上游是 **CMP（`org.jetbrains.compose.*`）** 多平台库（含 android / jvm / js / wasmJs / ios / macos target，§7.2），其 **Android target 产物能否在纯 Android（非 KMP）Gradle 工程中与 `androidx.compose.*` 共存**，官方文档未说明 → **未核实，必须先跑 `assembleDebug` 验证** |
| B3 | **是否需开 Fabric（`newArchEnabled`）** | **否**。Paper `SimpleViewManager` + `AbstractComposeView` / `ComposeView` 是普通 Android `View`，可在 `newArchEnabled=false` 下工作；开 Fabric 反而牵动全部老架构 ViewManager（`01 §9 R6`）。**`LiveExoViewManager.java` 先例仍可复用**：`LiveExoViewManager.java:12` `extends SimpleViewManager<LiveExoView>`、`:19-22` `createViewInstance(ThemedReactContext)`、`:25-39` `@ReactProp` 下发 —— 骨架完全适用 |
| B4 | **但先例复用有新增门槛（01 §7.5 未覆盖）** | `MainActivity.kt:13` `class MainActivity : ReactActivity()`，**不是 `ComponentActivity` / `AppCompatActivity`**；RN 的 `ThemedReactContext` 默认不提供 `ViewTreeLifecycleOwner` / `ViewTreeViewModelStoreOwner` / `ViewTreeSavedStateRegistryOwner`，而 `ComposeView.setContent` 需要这些 owner → 必须手动 `ViewTreeLifecycleOwner.set(view, ...)` 或自建 `LifecycleRegistry`，或改 MainActivity 继承（会牵动 `:29-122` 的 PiP / 媒体会话 / ColorOS 兼容逻辑，风险高）。**Phase 2 的真实工作量高于 01 §7.5 估计** |
| B5 | **循环捕获的架构约束** | ① 全局**单一** `Box(Modifier.fillMaxSize())` 根：内层 `Box(Modifier.layerBackdrop(backdrop))` 只放 RN 内容（通过 `AndroidView` 挂载 RN root），外层放全部玻璃件；② 玻璃件严格是捕获子树的**兄弟节点**；③ 若需「玻璃叠玻璃」（底栏选中指示器 / 玻璃 sheet 内按钮），**优先用上游官方 `exportedBackdrop`**（`drawBackdrop(backdrop = 主, exportedBackdrop = barBackdrop)`，"skip drawing the content"），而不是仅依赖人工维护兄弟节点位置 |
| B6 | **需实测的疑点：`GlassBottomTabs` 自身是否触发 loop** | `GlassKit.kt:237-255` 中 `Row` **同时**挂 `.layerBackdrop(barBackdrop)` 与 `.drawBackdrop(backdrop = 主backdrop)`；由于读的是**主 backdrop** 而非 `barBackdrop`，按官方 WRONG 例（`layerBackdrop` 导出 X + 子树内 `drawBackdrop` 读 X）**不构成直接 loop**；且读 `barBackdrop` 的指示器是 Row 的兄弟节点（`:288-307`）。但 `layerBackdrop` 捕获的是「含 `drawBackdrop` 结果的 Row 内容」（`:214-217` 注释明确「含玻璃面与文字」）→ 存在「捕获结果含一次 `RenderEffect` 输出」的嵌套离屏绘制，官方教程未覆盖此拓扑。**结论：理论自洽但未经官方确认，Phase 2 必须真机回归 `Fatal signal 11 (SIGSEGV) ... (RenderThread)`，并准备 `exportedBackdrop` 作为 fallback** |
| B7 | **版本链** | 上游 `agp = 9.3.2` / `kotlin = 2.4.10` / `compose = 1.12.0` / `compileSdk = 37` / `buildTools 37.0.0` / `jvmTarget = JVM_11` / `minSdk = 21`（§7.2）；App 的 Kotlin / AGP / compileSdk 由 **Expo 54 注入、未显式声明**（`android/build.gradle:11` 仅 `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')` 无版本，`app/build.gradle:97` `compileSdk rootProject.ext.compileSdkVersion`）→ **冲突风险高于旧引擎**（旧为 8.7.3 / 2.0.20 / 2024.09.00 / 35）。App `minSdk 26` > 库 `minSdk 21`，此项不构成阻塞 |
| B8 | **API 门槛双档** | blur / vibrancy ≥ **API 31**；`lens` / `chromaticAberration` / `gammaAdjustment` ≥ **API 33**（`backdrop-effects.md`）。`GlassBottomTabs` 的核心视觉效果（指示器折射）在 26–32 全部不可用 → 降级为「不透明选中胶囊 + 边缘高光」，并计入 `degrade()` |
| B9 | **弹层独立 window** | **未核实**（§7.4）。Phase 2 必须实测 RN `Modal` 内的 `ComposeView` 能否读到主窗口 `backdrop`；在结论出来前，Modal 内一律不挂 `drawBackdrop` |
| B10 | 效果顺序 / shape 约束 | 上游 `backdrop-effects.md`：「The order of effects matters … **color filter ⇒ blur ⇒ lens**」；「⚠️ To use the lens effect, your `shape` must be `CornerBasedShape`」；`lens` 的 `height` 须在 `[0, shape.minCornerRadius]`、`amount` 在 `[0, size.minDimension]`。新引擎 `GlassBottomTabs:297` 用 `com.kyant.shapes.Capsule()` → **是否满足 `CornerBasedShape` 未核实**（X5） |

---

## 7. WebFetch 核实结果（Kyant0/AndroidLiquidGlass）

> 已抓取：GitHub 仓库主页（`kmp` 分支）、Release `2.0.1`、`backdrop/build.gradle.kts`（raw）、`gradle/libs.versions.toml`（raw）、`get-started.md`、`faq.md`、`api/backdrops.md`、`api/backdrop-effects.md`、`tutorials/glass-bottom-sheet.md`、`llms.txt`。以下逐项给出「已核实 / 未核实」，**未核实项不臆测**。

### 7.1 仓库与版本身份（已核实）

| 项 | 值 | 出处 |
| --- | --- | --- |
| 上游性质 | **「A customizable Liquid Glass effect library for Compose Multiplatform」**，README 标题 `Liquid Glass (Backdrop)`；GitHub About「Compose Multiplatform Liquid Glass effect」 | GitHub 主页 |
| 分支 / commit | `kmp` 分支，286 commits，最新 `65ab177`「Update dependencies」**2026-08-26** | GitHub 主页 |
| 最新 Release | **`2.0.1` Latest，2026-08-26**，Release note 唯一一条「**Update Compose to 1.12.0**」 | `/releases/tag/2.0.1` |
| 高级组件 | 官方 README：**「The library does not include any high-level components; you will need to create your own」**，只给 4 个示例（`LiquidButton` / `LiquidToggle` / `LiquidSlider` / `LiquidBottomTabs`） | GitHub 主页 → **印证新引擎 `GlassKit.kt` 的价值正是「把这些高级组件按 TechNews 风格实现了」** |
| 许可证 | Apache License 2.0 | `backdrop/build.gradle.kts` pom |

### 7.2 `backdrop:2.0.1` 最低 API / Compose / Kotlin 版本要求（已核实）

来源：`https://raw.githubusercontent.com/Kyant0/AndroidLiquidGlass/kmp/backdrop/build.gradle.kts` 与 `/kmp/gradle/libs.versions.toml`（均为 `kmp` 分支 main；`coordinates` 明确写 `2.0.1`，与 Release 2.0.1 的 Compose 版本一致，判定可对应）。

| 项 | 值 | 备注 |
| --- | --- | --- |
| **minSdk** | **`21`** | `kotlin { android { minSdk = 21 } }` —— 库自身门槛低于 App `minSdk 26`，不构成阻塞 |
| **compileSdk / buildTools** | **`37` / `"37.0.0"`** | 远高于 App 当前注入值 |
| **namespace** | `com.kyant.backdrop` | — |
| **jvmTarget** | `JvmTarget.JVM_11` | 而 App 侧 Kotlin 版本未显式 |
| **Kotlin** | **`2.4.10`** | `libs.versions.toml [versions] kotlin`；插件 `org.jetbrains.kotlin.multiplatform` / `org.jetbrains.kotlin.plugin.compose` |
| **Compose** | **`1.12.0`（CMP `org.jetbrains.compose.*`）** | `[versions] compose = "1.12.0"`；依赖 `org.jetbrains.compose.foundation` / `.ui` / `.ui-graphics`，插件 `org.jetbrains.compose` |
| **AGP** | **`9.3.2`** | `[versions] agp`；插件 `com.android.kotlin.multiplatform.library` |
| **shapes** | **`kyantShapes = "1.2.1"`** / `io.github.kyant0:shapes:1.2.1` | 与 `README.md:11` 一致 |
| 其他 | `activity = 1.13.0`、`core = 1.19.0`、`org.jetbrains:annotations:26.1.0` | — |
| 多平台 target | `android` / `jvm("desktop")` / `js` / `wasmJs` / `macosArm64` / `iosArm64` / `iosSimulatorArm64` | → **CMP，不是纯 AndroidX Compose** |
| Maven 发布 | `vanniktech maven-publish` + `publishToMavenCentral()` + `signAllPublications()`，`coordinates("io.github.kyant0","backdrop","2.0.1")` | → App 已有 `mavenCentral()` |
| **效果运行门槛** | **Android 12+ (API 31)**：「Backdrop effects are `RenderEffect`s radically. They only take effect with Android 12 and above.」；**Android 13+ (API 33)**：「Some effects involving with `RuntimeShader` need Android 13 and above.」「## Lens (Android 13+)」「## Gamma adjustment (Android 13+)」 | `api/backdrop-effects.md` |

> **口径修正（相对 team-lead 事实清单）**：事实清单写「基于 `layerBackdrop` 图层捕获方案（不是旧引擎的自研 RenderEffect / 静态 ImageBitmap 背板）」。准确表述应为：**背板获取方式改为图层捕获（相对旧引擎静态 `ImageBitmap` 是根本变化），但效果本身仍然是 `RenderEffect`，且官方文档明确其只在 Android 12+ 生效、部分需 Android 13+**。这一核实直接支撑 §3.2 #17 与 §5 C7 的双档门槛。

### 7.3 效果 API 与背板 API（已核实）

`api/backdrop-effects.md` 逐字要点：效果顺序 **`color filter ⇒ blur ⇒ lens`**；`vibrancy()` = `colorControls(saturation = 1.5f)`；`blur(radius: Float, edgeTreatment: TileMode = TileMode.Clamp)`；`lens(refractionHeight: Float, refractionAmount: Float = height, depthEffect: Boolean = false, chromaticAberration: Boolean = false)`（**Android 13+**，shape 须 `CornerBasedShape`，`height ∈ [0, shape.minCornerRadius]`、`amount ∈ [0, size.minDimension]`）；另有 `colorFilter / opacity / colorControls / exposureAdjustment / gammaAdjustment(13+) / effect(RenderEffect) / runtimeShaderEffect`。

`api/backdrops.md` 逐字要点：`rememberBackdrop`（custom commands）；**`rememberLayerBackdrop` must be used with `Modifier.layerBackdrop` to draw the Composable's content, or it's derived by using `exportedBackdrop` parameter of the `drawBackdrop` modifier. It is coordinates-dependent.**；`rememberCombinedBackdrop`（merge，useful for tabs and sliders）；`rememberCanvasBackdrop`（coordinates-independent）；`emptyBackdrop`。

`get-started.md` 只有 `implementation("io.github.kyant0:backdrop:<version>")`（版本占位符），**明确不含** minSdk / Kotlin / Compose 版本要求、Activity/window 配置、代码骨架 → §7.2 的版本值全部来自构建文件反推，不是官方「要求」声明，此点须如实标注。

### 7.4 「独立 window / Dialog 内 `drawBackdrop` 能否拿到主 backdrop」→ **未核实**

| 已查页面 | 是否出现 `Dialog` / `Popup` / separate window / 主窗口 backdrop 可见性 |
| --- | --- |
| GitHub 主页 / Release 2.0.1 | ❌ 无 |
| `get-started.md` | ❌ 无（只有安装行） |
| `faq.md` | ❌ 无；仅两条：「Why doesn't the effect work?」→ 检查 `Modifier.layerBackdrop`；「Why did it crash?」→ `Fatal signal 11 (SIGSEGV) ... (RenderThread)` 并指向 `glass-bottom-sheet.md` |
| `api/backdrops.md` | ❌ 无；仅有 `rememberLayerBackdrop` **"It is coordinates-dependent"** |
| `api/backdrop-effects.md` | ❌ 无 |
| `tutorials/glass-bottom-sheet.md` | ❌ 无；该页的 `GlassBottomSheet` 是 `BoxScope` 内的自定义 Composable，与 `MainNavHost` **同层组合**，不是独立 window；页面讲的是 `exportedBackdrop` 修复 loop，未讨论窗口边界 |
| `llms.txt` 索引 | 共 **10 页**（get-started / 5 tutorials / 2 api / faq），**无 limitations、performance、migration 专页** |

**结论（明确写「未核实」）**：官方文档**没有任何**关于 Dialog / Popup / 独立 window 内 `drawBackdrop` 能否读到主窗口 `backdrop` 的表述。唯一相关线索是 `rememberLayerBackdrop` 是 **coordinates-dependent**（坐标相关），据此**可以推断**独立 window 因坐标系不同可能无法取到主 backdrop，但 **这是推断，不是核实结论**。→ `01 §7.3 #19` / `§9 R9` 的「弹层 window 退化」硬约束**证据作废**；Phase 2 必须实测（§6.3 B9）；在结论出来前保持 03 方案 L587 的保守规避，但**理由改写**。

---

## 8. 修正后的路径建议

### 8.1 路径 A 是否仍推荐？

> **结论：是，路径 A（RN 侧 `expo-blur` + 自定义渲染等效实现）仍为推荐主路径，本轮不提前 Phase 2。**

理由（逐条可回溯，且**不使用已作废的静态背板 / 弹层退化论据**）：

1. **技术栈鸿沟不变**（Q1）：`newArchEnabled=false`、`MainActivity : ReactActivity()`（非 ComponentActivity）、`android/` 无 Compose 构建特性与依赖、TS/React 技术栈 → **新引擎 3 个 kt 文件在 RN App 中「直接可用」项仍为 0**。
2. **新引擎的集成成本不低于旧引擎**：旧引擎是 JitPack **AAR**（一个坐标）；新引擎是**源码组件集** —— 需「拷 3 个 kt 到 `android/.../ui` + 改 package + 引 2 个 Maven 坐标 + 开 Compose 构建特性与 `kotlin-compose` 插件 + 写 ViewManager + 注入 `ViewTreeLifecycleOwner`」（§6.3 B1–B4）。**步骤更多**。
3. **版本链更激进**：Kotlin 2.4.10 / AGP 9.3.2 / CMP 1.12.0 / compileSdk 37 / JVM 11，且上游是 **CMP 多平台库**，其 Android target 产物能否在纯 Android 工程与 `androidx.compose.*` 共存**未核实**；而 App 的 Kotlin/AGP/compileSdk 由 Expo 54 注入、无显式版本（`01 §9 R8` 已记录）→ 编译期冲突风险**高于**旧引擎。
4. **API 门槛升高**：效果需 API 31、`lens`/色散需 **API 33**；App `minSdk 26` → 大量用户连核心的选中指示器折射都看不到，而路径 A 可用 `Platform.Version` 双档 + 用户开关 + 低端机白名单做统一降级（01 §7.4 理由④ 保留并升级）。
5. **照搬会引入 6+ 处 Apple 规范违规**（§5）：10sp < 11pt、单一深色色板 vs M18 四套、组件内硬编码 vs D7、无 `reduceTransparency`/DynamicType/Reduce Motion、22dp 分类不明、44dp < 48dp 触控建议、引擎自身 X1/X2 违反铁律① → **直接引入原生组件反而需要一次完整的规范化重写**，工作量接近路径 A。
6. **治理约束仍是阻塞级**：`DESIGN_SYSTEM.md:71-72` 明令「禁止新增 npm 依赖、改 `android/` 原生、改 store/api、动播放器覆盖层」；本轮用户「只出文字方案、不改代码」；`01 §9.2 第1/2条` 与 `§9 R6` 的解禁问题**尚未得到用户答复**。
7. **新引擎真正有价值的部分，路径 A 可以 100% 复刻且无需原生**：① 「内容层零玻璃 / 控件层玻璃」结构（与 D1 同向，C9）；② 4 个成品件到 App 功能层组件的 1:1 契约与尺寸（§4）；③ 三条铁律（tint ≤0.12 / 大面积禁 lens / 背景明暗起伏）；④ 全局倍率单一来源；⑤ 循环捕获红线转译成的分层约束（§6.2）。**这些是纯契约，不是代码。**

### 8.2 但新引擎「明显更契合」的部分必须承认（结论修正）

`01 §7.4 理由②` 把「引擎与 App 场景天然错配」当作不推荐 B 的**核心理由**，该理由现已**整体作废**：

- 旧引擎的「静态背板」与本 App 30 页全屏滚动列表**根本冲突**；新引擎的 `layerBackdrop` 恰好解决此点，使 `SPEC` M1「内容从下方滚动透出」在原生侧成为可能。
- 新引擎的结构硬要求与 **D1 完全一致且是崩溃级硬约束**（C9），比规范条文更强。
- 组件化程度从 1 个成品件提升到 7 个，与 App 功能层组件几乎 1:1（§4）。

因此建议把 Phase 2 的定性从 `01` 的「**不推荐**」上调为「**有条件提前、但本轮不启动**」，并给出**路径 A+** 折中：

> **路径 A+**：以路径 A 为实现主体，**把新引擎的组件契约、尺寸/字号/圆角、三条铁律、内容层/控件层分层、循环捕获红线，全部作为 `src/theme/glass.ts` 与 `GlassSurface` 等 RN 组件 API 的设计蓝本**。这样既拿到新引擎 90% 的架构价值，又不触碰 `android/` 原生与新增依赖。
>
> `glass.ts` 相对 03 方案 §3.5 的**必改项**：① 删除 `transparency/refractDp/refractMode/dispersion/edgeWidthDp/edgeGlow/legacyBackdrop/scrim` 八项旧 `GlassDefaults` 参数（§3.2 #5/#6/#16/#21）；② 改为 `blurScale/tintScale/lensScale/glowScale` 四倍率 + `blurDp` 四档（14/12/10/8）+ 单一边缘高光 `1dp @0.14`；③ 新增 `Math.min(tintAlpha, 0.12)` 上界（修 X2）、`canBlur(≥31)` / `canLens(≥33)` 双档、`degrade()` 覆盖 `reduceTransparency`/`reduceMotion`；④ 全局状态用 **zustand + AsyncStorage**（对应 `GlassSettings` 可变单例），而非 03 L283 的 React Context；⑤ 保留 `dimming = 0.35` 与 `contentScrim`、`useGlassBudget()`、`childRadius()`、`layer` 白名单断言。

### 8.3 提前 Phase 2 的触发条件（**全部满足**才启动）

1. 【阻塞】用户明确解禁「改 `android/` + 新增依赖 + 开 Compose 构建特性」（`01 §9.2 第1条` / R6）。
2. `assembleDebug` 实测通过：Kotlin 2.4.10 / AGP 9.3.2 / CMP 1.12.0 / compileSdk 37 与 Expo 54 注入链对齐，且 **CMP Android target 产物在纯 Android 工程可用**（§6.3 B2 未核实项）。
3. 目标机型 API ≥33 占比达标，或用户接受「26–32 无 lens、26–30 无任何效果」的降级分层（`01 §9 R2` 双档化）。
4. 真机回归通过：`GlassBottomTabs` 兄弟节点拓扑**不触发** `Fatal signal 11 (SIGSEGV) ... (RenderThread)`（§6.3 B6），`exportedBackdrop` fallback 已备好；`Capsule` 满足 `CornerBasedShape` 或已替换（X5）。
5. 实测 RN `Modal` 独立 window 内 `ComposeView` 的 backdrop 行为，并给出明确结论（§7.4 未核实项）。
6. `ViewTreeLifecycleOwner` / `ViewModelStoreOwner` / `SavedStateRegistryOwner` 注入方案验证通过（§6.3 B4）。
7. 新引擎组件完成规范化重写：字号 ≥11sp、4 套色 token、降级开关、圆角按 `SPEC` 28–32dp 分类、触控 ≥48dp、去硬编码、修 X1/X2。
8. 维护策略确认：P1 允许 fork 到 `shufajiaok` 账号后，明确「跟随 `backdrop` 上游版本升级」的同步责任与回归范围（替代 `01 §7.3 #23` 的 HealthCheckIn 同步表）。

---

## 9. `01` 报告作废 / 修正清单

> **处理原则**：`01` 原稿**不改一字**（保留可追溯），本节是逐条的「以 04 为准」对照表。章节号 / 行号按 `01` v1.1 落盘版（812 行 / 115,512 字节）。

| `01` 位置 | 原结论 | 新结论 | 类别 |
| --- | --- | --- | --- |
| `§0.2 第1条` | 「LiquidGlass = 纯 Jetpack Compose Kotlin 库，靠 `RenderEffect`/`BlurEffect`/`CompositionLocal` 工作……引擎 Composable/API 直接可用项为 0」 | 引擎改为 `liquid-glass-compose`（CMP 组件集 + `com.kyant.backdrop` 图层捕获，无 `CompositionLocal`、无 `MaterialTheme`）；**「直接可用项 = 0」结论保留（Q1）** | 部分修正 |
| `§0.2 第7条` | 「**引擎自身有两条对本 App 致命的限制**（背板必须静态、对话框/底部弹层独立 window 退化）……本 App 恰是引擎最不适用的场景」 | **整条作废**：① 静态背板被图层捕获推翻（Q2）；② 弹层退化为**未核实**（Q3 / §7.4）。取代表述：「新引擎的硬约束是**循环捕获红线**，且该红线与 `SPEC` D1 同向；弹层独立 window 行为未核实」 | **作废** |
| `§0.2 第8条` | 「推荐路径 A……理由见 §7.4；若必须引入走 B（Phase 2）」 | **路径 A 推荐保留**；理由②作废、理由④/⑤数值更新、Phase 2 触发条件按 §8.3 重写；新增「路径 A+」折中 | 部分修正 |
| `§0.2 第10条` | 「真模糊需 API 31+」 | 双档：blur/vibrancy **API 31**、`lens`/色散 **API 33** | 修正 |
| `§1.4 / §1.5 / §2 / §3 / §4 / §5 / §8.1–8.3` | App 侧技术栈、目录、30 页清单、25 组件清单、设计系统与 C1a/C1b 冲突判定、影响面文件清单 | **全部保留，不重判**（换引擎不改变 App 事实）。其中 `§8.1` C1a「承载全屏背景的容器透明 + 整体压暗遮罩合规且必须保留」、C1b「控件/卡片自身底板半透明违规」的 v1.1 裁决**继续有效**，且 §4 映射表再次确认 `App.tsx:641,701-709`、`navigation/index.tsx:185,266,270,303`、`colors.ts:96-101` 行号无误 | 保留 |
| `§6` **全章**（`§6.1–6.6`） | 旧引擎全量盘点：文件与模块表、10 个 API、7 步渲染管线、`GlassDefaults` 参数表与区间、6 个示例组件、版本基线（Kotlin 2.0.20 / BOM 2024.09.00 / AGP 8.7.3 / Gradle 8.9 / compileSdk 35 / minSdk 26 / API 31+ / `groupId=com.jiale` / JitPack `0.1.3` / 零三方依赖）、限制表（静态背板 / 弹层退化 / `MaterialTheme` 依赖 / 出血节点）、性能预算（1 / ≈10 / ≈16 次、同屏 1–3 块）、9 条调参建议 | **整章作废**，以本报告 §2 + §7 替代。特别注意：`§6.5`「三方依赖：**无**」→ 新引擎**有 2 个 Maven 坐标**；`§6.6`「`MaterialTheme` 依赖 → 桥接需自建 MaterialTheme」→ 新引擎**无 Material 依赖**（X7），该复杂度消失 | **作废** |
| `§7.1 技术栈鸿沟表` | 8 维对比，结论「直接可用 = 0」 | 表格「引擎」列全部换为新引擎值（CMP / `com.kyant.backdrop` / 2 坐标 / `GlassSettings` 单例 / `GradientBackground`）；**新增「CMP vs AndroidX Compose 混用」维度**；**结论句「直接可用 = 0」保留** | 部分修正 |
| `§7.2 路径表` | B 前置「引入 Compose BOM + `buildFeatures compose=true` + `kotlin-compose` + JitPack/源码依赖」；C/D 同 | B 前置改为「2 个 Maven Central 坐标 + CMP + Compose 构建特性 + `ViewTreeLifecycleOwner` 注入」；**A 行保留**，并补「新引擎契约作蓝本」；C/D 结论保留 | 修正 |
| `§7.3` **23 行判定表** | 见 §3.2 原结论列 | **逐行按 §3.2 重判**：15 条结论变更（含 3 条作废、3 条部分），仅 #1 / #10 与 Q1 主结论实质保留；新增 N1–N12（§3.3） | **重判** |
| `§7.4 理由②` | 「**引擎与 App 场景天然错配**：两大硬限制是静态背板与弹层独立 window 退化……即使付出桥接成本，引擎在最需要玻璃的弹层上也只会退化成膜层，收益远小于成本」 | **整条作废**（两个前提全部不成立）。替换为 §8.2 的承认段：新引擎在结构契合度上明显更高（D1 同向、图层捕获支持滚动、7 个成品件），但工程契合度仍低（§8.1 理由 1–6）。`§7.4 理由①③④⑤⑥⑦` 保留，其中 ④ 的「每帧一次离屏 `RenderEffect`」改引上游 `backdrop-effects.md`、⑤ 的版本链换成 2.4.10/9.3.2/1.12.0/37 | **作废** |
| `§7.5` Phase 2 步骤表（7 步） | 步骤 1 JitPack/BOM、`步骤2` 自建 `MaterialTheme`、`步骤4` `@ReactProp` 传背景图路径 → `rememberBackdropImage(File)`、`步骤6` 禁用场景含「window 退化 / 静态背板」 | **整表重写**：按 §6.3 B1–B10。删除 JitPack、`MaterialTheme`、`File` 背板、「window 退化」「静态背板」两条禁用理由；新增 `exportedBackdrop`、双档 API 门槛、`SIGSEGV` 真机回归、CMP 混用验证、`ViewTreeLifecycleOwner` 注入、`Capsule` 类型核实 | **重写** |
| `§8.4` `GLASS_DEFAULTS` 建议代码块 | `transparency 0.38 / refractDp 5.0 / refractMode SCALE\|FIELD / edgeWidthDp / edgeGlow / dispersion / scrim 0.55 / dimming 0.35 / contentScrim / blurRadius 12 / compactBlur 6 / compactEdgeWidth 1.2` | **前半（引擎参数）作废**，按 §8.2 的 `glass.ts` 5 项必改重做；**`dimming = 0.35` 与 `contentScrim` 分档管理、`0.88/0.92/0.34` 归一而非删除、死代码 `tabBarStyle.ts` 值删除**等 v1.1 裁决**全部保留** | 部分修正 |
| `§9 R1` | 性能预算引 `LG/README.md:224-240` 的绘制次数与「同屏 1–3 块」；白名单计数口径（弹幕/Toast 不计入） | 数值依据**作废**（新引擎无性能预算，§7.5），改标「`SPEC` M24/D9 建议值 + 待真机实测」；**「只计真玻璃容器、不计浮层」「直播页 3 个白名单」计数口径保留** | 部分修正 |
| `§9 R2` | 「引擎真模糊需 API 31+」 | 双档 API 31 / API 33；App `minSdk 26` 与 `AppTabBar.tsx:101` 注释保留 | 修正 |
| `§9 R3 / R4 / R4b / R5 / R6 / R7 / R10 / R11 / R12` | 直播 SurfaceView、安全区、可访问性、治理、文档漂移、多语言、TabBar 隐藏、弹层叠放 | **全部保留**（App 侧事实，与引擎无关）。R3「控制条不做 backdrop blur」结论在新引擎下**仍成立**（SurfaceView 不可采样） | 保留 |
| `§9 R8` | 「**引擎维护与构建冲突（仅 Phase 2）**：Kotlin 2.0.20 / Compose BOM 2024.09.00 / AGP 8.7.3 / Gradle 8.9 / compileSdk 35；JitPack 首次云端现编；库与上游 HealthCheckIn 两份代码需手动同步」 | **重写**：版本链 → Kotlin **2.4.10** / AGP **9.3.2** / **CMP 1.12.0** / compileSdk **37** / JVM 11 / minSdk 21；JitPack → **Maven Central**（App 已配 `mavenCentral()`，此项**风险下降**）；上游 → **Kyant0/AndroidLiquidGlass + TechNews v2.1.0**；**新增**「CMP 多平台库在纯 Android 工程的产物可用性未核实」「ComposeView 的 ViewTreeLifecycleOwner 注入」「`Capsule` 类型兼容」三项；定性从「编译期版本冲突」升级为「**架构级依赖体系不确定**」 | **重写** |
| `§9 R9` | 「**引擎与本项目场景错配（仅 Phase 2）**：静态背板、弹层 window 退化、`MaterialTheme` 依赖 vs 全屏滚动列表 + 大量 RN `Modal` + `usePalette`；即使桥接成功弹层也没真玻璃，收益低」 | **整条作废**（三项前提全部不成立）。替换为新风险 **R9'**：「**循环捕获 `SIGSEGV` + 独立 window backdrop 行为未核实 + CMP/AndroidX Compose 混用未核实 + API 33 门槛**」；缓解 = §6.3 B5/B6/B9 + §8.3 触发条件 | **作废** |
| `§9.2 第2条` | 「本轮是否确认只做 RN 侧等效实现、不引入 Compose 原生引擎？若用户坚持必须用自研引擎，需重新评估 Phase 2 工期与版本冲突（R8/R9）」 | 改为「若用户坚持用**新引擎**」，并补 §8.3 的 **8 个触发条件**；新增 3 个待确认项：独立 window 内 `drawBackdrop` 行为、`GlassBottomTabs` 兄弟节点拓扑是否触发 loop、CMP Android target 产物可用性 | 修正 |
| `附录 A / B` | 核心证据文件索引 / 明确「未找到 / 无法核实」项 | 附录 A 的 `LG/*` 路径索引需并行保留并标注「旧引擎·仅作对比」，新增 `repo/liquid-glass-compose/*` 4 文件；附录 B **新增**：CMP Android 产物可用性、Dialog/独立 window 行为、`Capsule` 是否满足 `CornerBasedShape`、新引擎 commit 数/日期（落盘无 `.git`）、`Xenia0922` vs `shufajiaok` 仓库权限 | 修正 |

---

## 10. 连带影响提示（供 team-lead 转 `software-product-manager` 处理 #5）

> 本节**不修改 03 方案**（`03-liquid-glass-visual-redesign-plan.md`，PM 产出），仅列出其引用旧引擎结论、需在 **#5「基于新引擎的完整视觉方案 v2」** 中同步修订的位置。已核实行号：

| 03 位置 | 引用内容 | 需同步修订为 |
| --- | --- | --- |
| `L40` | 「LiquidGlass 引擎是纯 Jetpack Compose Kotlin……直接可用项 = 0；本轮走路径 A，理由见 §2.1」 | 引擎名与技术描述改新引擎；**「直接可用 = 0」保留**；路径 A 保留但理由换成 §8.1 |
| `L114-116` | 技术前提表两行（引擎 = `com.jiale.liquidglass` / `RenderEffect`/`CompositionLocal`；视图树不互通） | 改 `com.jiale.glasskit` + `com.kyant.backdrop` 图层捕获；鸿沟结论保留 |
| `L118-122`（§2.1 三条理由） | 理由 1「引擎 README 自承背板必须静态 + 弹层独立 window 退化」 | **整条重写**（两个前提作废，Q2/Q3）；理由 2（0 原生改动/0 新依赖）与理由 3（可复用的是契约与数值）保留，但理由 3 的「六参数单一来源、默认值与区间、性能预算、API 31+ 降级、弹层不用真模糊」需按 §3.2 逐项校正 |
| `L163` | 「引擎性能预算『同屏 1–3 块小面 ≈ 无感；一页 5 张卡片全玻璃 → 明显掉帧』（README L224-240）直接支撑该白名单」 | 删引擎引用，改标 `SPEC` M24/D9 建议值 + 真机实测；白名单口径保留 |
| `L263-277`（§3.5 参数表） | 「**照抄引擎 `GlassDefaults`**」+ 11 行六参数表 | 按 §8.2 的 `glass.ts` 5 项必改重做（删 8 项旧参数、改 4 倍率 + 双档 API + tint 上界）；`glassDimming 0.35` 保留 |
| `L281-290`（配套契约表） | `GlassProvider`/`useGlassParams()` ↔ `LocalGlassParams`；`resolveGlass` ↔ `COMPACT_*`；`canBlur` ↔ `SDK_INT >= S`；`degrade` ↔ API<31 膜层；`GlassSurface` ↔ `LiquidGlassSurface` 语义；`useGlassBudget` ↔ README 性能预算 | 逐行换对应物：`GlassSettings` 四倍率 ↔ zustand；`canBlur(≥31)` + 新增 `canLens(≥33)`；`degrade` 增加 `reduceTransparency`/`reduceMotion`；`GlassSurface` ↔ `glassSurface`；`useGlassBudget` 的引擎依据删除（改 `SPEC` 依据）；`layer` 白名单断言与 `childRadius()` **保留且升格**（对应新引擎红线 / D1） |
| `L287` | 「替代 `AppTabBar.tsx:119-158` 的 4 层独立平铺（M23）」 | 保留，并补 §6.2 A2「禁止互相采样」 |
| `L565 / L587` | 设置页「玻璃实验台（引擎 Slider/Switch 概念复刻）」；Modal「引擎 README 自承退化，统一不用真模糊」 | 实验台改 `GlassSettings` 四倍率滑块（区间 0–2.5/0–3/0–2/0–2，需补 0.12 上界）；Modal 做法保留、**理由改写**（§6.2 A5） |
| `L751 / L754 / L755`（R1/R4/R5） | R1 引引擎性能预算；R4「`glass.ts` 已按引擎六参数设计，未来桥接无需二次设计」；R5 解禁问题 | R1 同 L163；**R4 需推翻重述**（六参数已作废，`glass.ts` 须按四倍率重做）；R5 保留并补 §8.3 触发条件 |

---

## 附录 A：本报告证据文件索引

| 类别 | 路径 |
| --- | --- |
| 新引擎（本报告主对象） | `repo/liquid-glass-compose/GlassKit.kt`（364 行）、`GlassColors.kt`（70）、`GlassSettings.kt`（48）、`README.md`（62） |
| 旧引擎（仅作对比，`01 §6` 已全量盘点） | `repo/LiquidGlass/README.md`、`liquidglass/src/main/java/com/jiale/liquidglass/{LiquidGlass,GlassDefaults,GlassBackdrop,RefractMode}.kt`、`liquidglass/build.gradle.kts`、`gradle/libs.versions.toml`、`sample/.../MainActivity.kt` |
| App 源码（全部只读） | `package.json`、`app.json`、`android/build.gradle`、`android/app/build.gradle`、`android/gradle.properties`、`android/app/src/main/java/com/yk1z/yayamsg/{MainActivity.kt,LiveExoViewManager.java}`、`App.tsx`、`src/navigation/index.tsx`、`src/theme/{colors.ts,ui.ts,radii.ts,typography.ts}`、`src/components/{AppTabBar,ScreenHeader,Pill,HeaderAction,GlassCard,DanmakuOverlay,MiniPlayerBar,AppToast}.tsx`、`src/player/chrome/PlayerChrome.tsx`、`src/screens/{MediaScreen,FollowedRoomsScreen,HomeScreen,RechargeScreen,SettingsScreen}.tsx`、`src/hooks/useSafeAreaInsets.ts` |
| 团队交付物 | `deliverables/software-company/01-architecture-and-component-inventory.md`（v1.1，812 行）、`02-apple-liquid-glass-spec.md`、`03-liquid-glass-visual-redesign-plan.md`（均只读） |
| WebFetch 上游 | `https://github.com/Kyant0/AndroidLiquidGlass`（`kmp` 分支）、`/releases/tag/2.0.1`、`/raw/.../kmp/backdrop/build.gradle.kts`、`/raw/.../kmp/gradle/libs.versions.toml`、`https://kyant.gitbook.io/backdrop/`： `get-started.md`、`faq.md`、`api/backdrops.md`、`api/backdrop-effects.md`、`tutorials/glass-bottom-sheet.md`、`llms.txt` |

## 附录 B：明确「未核实 / 未找到」清单

1. 新引擎 commit 数与日期：落盘快照**无 `.git`**，`git log` 返回 `fatal: not a git repository`；「2 个 commit，2026-09-16 17:32」仅采信 team-lead 口径。
2. **独立 window / Dialog / Popup 内 `drawBackdrop` 能否读到主窗口 `backdrop`**：上游 10 篇官方文档全部无表述 → **未核实**（§7.4）。
3. `com.kyant.shapes.Capsule` 是否满足上游 `lens` 要求的 `CornerBasedShape` / 是否提供 `minCornerRadius` → **未核实**（X5 / §6.3 B10）。
4. CMP（`org.jetbrains.compose.*`）Android target 产物能否在纯 Android（非 KMP）Gradle 工程中与 `androidx.compose.*` 共存 → **未核实**（§6.3 B2）。
5. `GlassBottomTabs` 的「Row 同时挂 `layerBackdrop` + `drawBackdrop`、指示器为兄弟节点」拓扑是否触发官方 `SIGSEGV` loop → 理论自洽但**未经官方确认，未实测**（§6.3 B6）。
6. 上游 `backdrop:2.0.1` 的 **官方**最低 API / Kotlin / Compose「要求」声明：**未在文档中找到**；§7.2 的版本值来自 `kmp` 分支构建文件反推，`get-started.md` 只有版本占位符依赖行。
7. `01` 全文中**未找到**「self-fork 不可行」表述（P1 相关，见 §0.1）；`Xenia0922` 与 `shufajiaok` 两账号的仓库权限关系**未核实**。
8. 新引擎的性能预算数值：上游 `llms.txt` 索引 10 页**无** limitations / performance / migration 专页，`backdrop-effects.md` 无性能章节 → 旧引擎的「1 / ≈10 / ≈16 次绘制、同屏 1–3 块」**无对应新数值**。
9. `TechNews v2.1.0` 的 `SettingsScreen.kt` 滑块实现（`README.md:56` 指向）**不在落盘快照中**，仅知 README 提示「自绘轨道 + 圆点，无 Material 依赖；注意 `Dp * Float` 才合法，`Float * Dp` 编译不过」→ 未读到源码。
10. App 侧 Kotlin / AGP / compileSdk **显式版本**仍未找到（由 Expo 54 注入，`android/build.gradle:11` 无版本号、`app/build.gradle:97` 取 `rootProject.ext.compileSdkVersion`）—— 与 `01 §9 R8` 一致，本轮未新增发现。

---

> **报告结束** · 本轮只读分析，未修改任何 App / 引擎源码；唯一写入为 `deliverables/software-company/04-engine-swap-architecture-revision.md`。
