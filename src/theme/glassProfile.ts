/**
 * glassProfile —— it.16 App 侧玻璃默认配置单一来源
 *
 * 来源：**用户 2026-11-08 指定的 HealthCheckIn 实测配置**，逐项照抄，不得自行改动。
 * 依据：it.13/it.14 已对齐的 GlassTuning.java:21-57 / SettingsScreenKt.java:1905-2128
 *       反编译规格，以及用户本轮点名的四倍率 / 对齐项 / 扩展调试最终值。
 *
 * 本文件是 App 侧玻璃默认值的唯一出口：
 * - `GlassTestScreen` 的滑块 / 开关初值全部引用这里（不再散落字面量）；
 * - `AppTabBar` 的 dock 几何 / 玻璃参数全部引用这里（不自创尺寸）；
 * - `glass.ts` 的四倍率默认值（DEFAULT_SCALES）经 SCALE_RANGES 与本文件保持一致；
 * - it.17 起 `glassDockStore.ts` 的 22 项运行时状态默认值也全部引用这里。
 *
 * it.17 职责收窄：本文件**只放默认值常量**（纯数据，无 hook、无运行时状态）。
 * 运行时状态与订阅出口搬到 `glassDockStore.ts`（`useDockSettings` /
 * `useGlassScales` / `setGlassScale`），避免「默认值」与「运行时值」混在一个文件里。
 *
 * ⚠️ 修改本文件 = 改用户已验收的配置，必须有用户明确指令。
 * ⚠️ 守卫合规：降级实底色值集中在这里（theme 目录豁免 inline-rgba 基线），
 *    `AppTabBar.tsx` 不内联 rgba；所有圆角走 JSX inline 变量，不写死数字。
 */

/** 顶部总开关（用户 2026-11-08 指定） */
export const GLASS_SWITCH_DEFAULTS = {
  blurEnabled: true, // 模糊总开关
  forceDownsample: false, // 强制降采样（模拟器调试用）
  glassOnGlass: true, // 玻璃叠玻璃（指示器透镜）
} as const;

/** 三开关（全局联动，不为单组件硬编码） */
export const GLASS_EFFECT_DEFAULTS = {
  chromaticEnabled: true, // 色散（整层画三遍）
  depthEffect: true, // 景深
  vibrancyEnabled: true, // 鲜活度
} as const;

/** 四倍率 + HealthCheckIn 对齐项 */
export const GLASS_PROFILE = {
  blurScale: 0.2,
  tintScale: 2.0,
  lensScale: 3.0,
  glowScale: 2.0, // 柔光倍率（扩展调试项）
  highlightScale: 0.3, // 顶缘高光
  topBarWidthScale: 0.8,
  topBarHeightDp: 56.97,
  dockWidthScale: 0.81,
  dockHeightDp: 56.86,
  dockInnerPadDp: 5.36,
  dockFloatDp: 15.3,
} as const;

/** 扩展调试（Kotlin 无对应项） */
export const GLASS_DEBUG_DEFAULTS = {
  dockRadiusDp: 999, // 999 = 真胶囊
  dispersionLevel: 1.0, // 色散强度 0–1
  glowAlpha: 1.0, // 描边亮度 0–3
  glowWidth: 2.4, // 描边宽度 0–3
  glowBottom: 0.6, // 底缘加强 0–3
  radiusScale: 1.65, // 圆角倍率 0–3
  widthScale: 1.0,
  heightScale: 1.0,
} as const;

/** 玻璃 tint 色（与 GlassTestScreen.THEME_COLORS.glassTint 同源，勿 inline rgba） */
export const GLASS_TINT_COLOR = { light: '#FFFFFF', dark: '#1B242B' } as const;

/**
 * it.19 透镜量纲基准（**dp**）：对应原版四档透镜参数，供 `AppTabBar` 与
 * `GlassTestScreen` 共用同一套基准，避免调用点各写一份。
 *
 * 量纲口径（it.19 修正）：JS 只做 `dp × PixelRatio.get()` → **px**，
 * `lensScale` 由 native 统一乘一次（`GlassKitView.drawLensLayer`），
 * 最终位移 = `dp × density × lensScale`，跨机型一致、与滑块线性。
 *
 * 权威来源（唯一依据，不靠读数）：
 * - `GlassLevel.java:123-124`（BAR / CONTROL 构造）、`:37-38`（INDICATOR / OVERLAY）
 * - `GlassSurfaceKt.java:683-688`：
 *   `lensScale = lockedRefraction ?: refractionScale(滑块)`；
 *   `h_px = toPx(refractionHeightDp) × lensScale`；
 *   `amount_px = toPx(refractionAmountDp) × lensScale`
 * - `GlassTuning.java:24`：原版滑块 `refractionScale` **默认 3.0**（与我们 lensScale 默认 3 同值）
 *
 * 四档基准（dp）与原版有效 px（density 3）：
 *
 * | 档位      | blurDp | band dp | amount dp | chromatic | 原版有效 band/amount px |
 * |-----------|--------|---------|-----------|-----------|-------------------------|
 * | BAR       | 10     | 3       | 5         | false     | 27 / 45（滑块 3.0）     |
 * | CONTROL   | 10     | 5       | 8         | false     | 45 / 72（滑块 3.0）     |
 * | INDICATOR | 0      | 8       | 10        | **true**  | 19.2 / 24（锁 0.8）     |
 * | OVERLAY   | 30     | 3       | 5         | false     | 27 / 45（滑块 3.0）     |
 *
 * ★ INDICATOR 的 0.8 是**替换**滑块而非与滑块相乘（`?:` 而非 `×`）：原版
 *   `lensScale = 0.8`（与 refractionScale 3.0 无关）⇒ 有效 band 19.2px / amount 24px。
 *   我们按主理人拍板「指示器保留受 lensScale 调节」，但**校准点必须落在默认滑块值上**：
 *   用户默认 lensScale = 3.0，此时指示器应恰好等于原版锁定值（19.2 / 24 px）。
 *   故基数按「原版 dp × 0.8 ÷ 3.0」反算：
 *     - `indicatorBandDp`     = 8dp  × 0.8 / 3.0 = **2.1333**  → ×3(density)×3(滑块) = 19.2px
 *     - `indicatorRefractionDp` = 10dp × 0.8 / 3.0 = **2.6667** → ×3×3 = 24px
 *   滑块拖到 1.0 ⇒ 只有原版 1/3（用户主动要的「变弱」）；拖回 3.0 ⇒ 逐像素回到原版。
 *   ⚠️ 因此 dock/指示器的透镜 px **不能 Math.round**：2.1333×3 = 6.3999，round 成 6
 *   再 ×3 只有 18px（丢 1.2px）。调用点直接传浮点。
 *   inv-engine 记的「INDICATOR 带高 19dp」即 19.2 **px**（density 3 × 8dp × 0.8），
 *   单位被写成了 dp；BAR 的「9dp / 15dp」同理是 9px / 15px。
 *
 * - `indicatorDispersionDp`：色散基准幅，**恒等于 indicatorRefractionDp**。原版色散
 *   没有独立幅度参数（`dispersionIntensity = d × grad × (px·py)/(halfW·halfH)`，即 =
 *   折射位移 × 象限符号），所以 `dispK = uDispersionPx / uRefractionPx` 必须是滑块值本身：
 *   基数相等 ⇒ dispK = dispersionLevel。滑块满幅 1.0 时 dispK = 1.0 = 原版。
 *   （旧实现 10dp / 0.35 归一让默认 dispK ≈ 3.6，彩虹偏重 3.6 倍；改基数时若只动折射
 *   不动色散，dispK 会跟着变 3 倍 —— 两者必须同步改。）
 * - `dispersionLevelBase`：滑块 0–1 直接作倍数（1.0 = 原版满幅）。
 * - `control*` / `overlay*`：暂未接线（生产面目前只有 dock bar / 指示器走透镜；
 *   实验页面板未下发 lensBandPx，native 兜底 `band = amount`＝it.18 前的覆盖范围）。
 *   后续给卡片 / 弹层接透镜时直接用这四个值，不要再另算。
 */
export const GLASS_LENS_PROFILE = {
  barRefractionDp: 5,
  barBandDp: 3,
  /**
   * ⚠️ it.22：这两项**不再是「锁死参数」，只是默认值**。
   *
   * 用户 2026-11-09：「原版锁死指示器折射是因为调试好跑了，你不要盲目锁，我还要调试」
   * ⇒ 指示器的 blur / refraction / band 全部交给 `glassDockStore` 的 `indicator*`
   * 三项（实验页三个滑块实时可调），本文件只提供初值：改这里 = 改默认观感。
   *
   * it.23 默认值回到原版真值（字节码核实 `GlassLevel.java:36`）：
   *   `INDICATOR = (blurDp=0, refractionHeightDp=8, refractionAmountDp=10,
   *                tint=0, depth=false, vibrancy=false, chromatic=true,
   *                highlight=false, lockedRefraction=0.8)`
   * 语义：amount（位移）**大于** height（带高）是原版刻意的剖面 —— 边缘隆起后向内
   * 回落，同一段像素被压缩两次是设计本身，观感是「边缘放大镜」，不是重影。
   *
   * 换算（我们的 native 会再乘一次 lensScale，默认 3.0，density 3.5）：
   *   - amount 10dp × 0.8 = 8dp = 28px ⇒ `2.6667 × 3.5 × 3 = 28`
   *   - height  8dp × 0.8 = 6.4dp = 22.4px ⇒ `2.1333 × 3.5 × 3 = 22.4`
   * 旧默认 0.5 / 4.0（it.21 那版）位移只有 5px、带高 42px ⇒ 透镜几乎不存在，
   * 胶囊看着就是 bar 的 1:1 复制（用户反馈「像挖了个洞 / 最小模糊」）。已废弃。
   */
  indicatorRefractionDp: 2.6667,
  indicatorBandDp: 2.1333,
  /**
   * 已停用（it.22）：色散基数**恒等于运行时的 `indicatorRefractionDp`**
   * （`dispK = uDispersionPx / uRefractionPx` 必须等于色散滑块本身）。
   * 折射一旦可调，色散若还钉在常量上，dispK 就会随滑块漂移 —— 保留常量仅作历史
   * 换算记录，调用点请用 `indicatorRefractionDp × dispersionLevel`。
   */
  indicatorDispersionDp: 2.6667,
  dispersionLevelBase: 1,
  controlRefractionDp: 8,
  controlBandDp: 5,
  overlayRefractionDp: 5,
  overlayBandDp: 3,
} as const;

/**
 * 指示器模糊半径**默认值** dp（it.22 起只是默认值，不再是硬锁）。
 *
 * 原版真值（字节码核实 `GlassLevel.java:36`）：
 * `INDICATOR = (blurDp=0, refractionHeightDp=8, refractionAmountDp=10, tint=0,
 * chromatic=true, highlight=false, lockedRefraction=0.8)`。
 * 指示器是「玻璃叠玻璃」，采集源本身已经是模糊过的 bar，自己再模糊一次只会让
 * 胶囊与相邻 bar 的清晰度断层。
 *
 * ⚠️ it.23 定位到的真坑：`GlassKitView.tsx` 会把**全局 blurScale** 注入每一个
 * 玻璃（`blurScale ?? store.blurScale`），指示器也不例外 ⇒ 胶囊的最终模糊 =
 * `indicatorBlurDp × blurScale × density`。默认 0 时乘积恒为 0，拖全局「模糊」
 * 滑块胶囊纹丝不动（用户 2026-11-09：「依旧是最小模糊状态，不受滑块调节」）。
 * 修法：指示器显式传 `blurScale={1}`（见 AppTabBar / GlassTestScreen），让它只受
 * 自己那一个滑块控制，全局模糊只影响 bar —— 与「原版锁 0」的语义一致。
 */
export const GLASS_INDICATOR_BLUR_DP = 0;

/**
 * 全 App 统一的玻璃形状档（it.21「设计语言统一」唯一来源）。
 *
 * 起因（用户 2026-11-09）：「很多大小形状类似的按钮可以直接用玻璃版替换，主要是这些
 * 按钮都用上我们同款曲率圆角，设计语言要统一」。
 *
 * 使用口径：
 * - `capsule`：高 ≤64dp 的条状控件（顶栏 / chip / 分段 / dock）——
 *   传 999 + `capsuleContinuous`，引擎按 r=min(w,h)/2 + n=3 超椭圆端帽绘制，
 *   与 dock 的曲率完全同款；
 * - `panel` / `card` / `control`：内容容器，引擎默认超椭圆（n≈4），
 *   数值只在这里改一次，页面不再各自写 16 / 20 / 22 / 24。
 */
export const GLASS_SHAPE = {
  panel: 28,
  card: 22,
  control: 16,
  capsule: 999,
} as const;

export type GlassShapeKey = keyof typeof GLASS_SHAPE;

/**
 * dock bar 降级实底（!canBlur() || !canLens() 时使用）。
 * 沿用替换前 AppTabBar 的半透明实底；集中在 theme 目录定义，避免守卫 R1
 * 把 `AppTabBar.tsx` 里的内联 rgba 计为「新增」。
 */
export const GLASS_BAR_FALLBACK = {
  dark: 'rgba(30,31,36,0.94)',
  light: 'rgba(245,246,250,0.94)',
} as const;

/**
 * 指示器降级实底（半透明白）：实色 + opacity，不产生内联 rgba。
 * 对齐 GlassTestScreen dockIndicatorFallback 的 0.25 语义。
 * it.17：`glassOnGlass=false` 与无透镜能力两种情形共用本常量。
 */
export const GLASS_INDICATOR_FALLBACK = {
  color: '#FFFFFF',
  opacity: 0.25,
} as const;

/**
 * dock tab 文字/图标色 —— 原版 glasskit 库写死的**品牌玻璃色**（深色）。
 *
 * 来源：`hc-src/.../com/jiale/glasskit/GlassKitKt.java` GlassBottomTabs：
 * 选中 #7CA6FF（Bold）/ 未选中 #9CA8BC（Normal）。
 *
 * 用户 2026-11-09 裁决：「只放开颜色，字号保 11sp」⇒ 这两个色值获准落地，
 * 守卫 D7 对它们的白名单仅限本文件 + 这两个常量名（scripts/glass-guard.js
 * 的 brandGlassColorFile / brandGlassColorLine）。
 *
 * ⚠️ 该库色板**写死深色、不跟随 light/dark**；我们 App 有浅色主题，
 * #9CA8BC 在浅底上对比度不足 ⇒ 只在深色主题取权威值，浅色主题仍走 palette。
 */
export const GLASS_DOCK_ACTIVE = '#7CA6FF';
export const GLASS_DOCK_INACTIVE = '#9CA8BC';

/**
 * dock bar 卡纸底衬色（不透明）—— **it.17 起已停用，常量保留**。
 *
 * 历史（it.16-fix1）：Kotlin 版底栏之所以像一张不透明卡纸，是因为其页面内容在
 * bar 区域本来就是背景色（内容带 bottom inset），玻璃采集到的是纯背景；而 yaya
 * 的列表内容一直延伸到 dock 下方，bar 玻璃的采集源是 App 级 GlassKitBackdrop
 * （整棵内容树）⇒ 内容原样透上来。模糊救不了这件事：反编译 GlassSurfaceKt.java:680
 * 的公式是 `blur = level.blurDp × blurScale`，BAR 的 10dp × 0.2 同样只有 2dp。
 * 当时的修法：bar 内层放一块不透明 surface 色并注册成采集源，bar 玻璃只采它
 * ⇒ 纯色卡纸 + tint/膜层/底缘高光质感。
 *
 * it.17 撤销（用户 2026-11-08：「确实有一层卡纸」→ 要求改成透视玻璃）：
 * 已删除 `AppTabBar` 里那段 `GlassKitBackdrop` 内层渲染，bar 的 `backdropTag`
 * 回到 `useBackdropTag()`（App 级采集源）⇒ 恢复透视玻璃。
 *
 * ✅ 已验证可用，需要卡纸时恢复这段 JSX 即可：frame 下插入
 *    `<GlassKitBackdrop ref={barBaseRef} onLayout={onBarBaseLayout}>` 包一层
 *    backgroundColor 为本色的绝对填充 View，并把 bar 玻璃的 `backdropTag`
 *    改成 `barBaseTag ?? backdropTag`。色值本身不需要改，故常量保留。
 */
export const GLASS_BAR_SURFACE = {
  dark: '#1E1F24',
  light: '#F5F6FA',
} as const;

/* ------------------------------------------------------------------ *
 * 运行时状态与订阅出口 → 见 `glassDockStore.ts`（it.17）
 *
 * 原先放在本文件的 `useGlassScales()` 已迁到 glassDockStore.ts，并扩展为返回
 * 四项 { blurScale, tintScale, lensScale, glowScale }；本文件回归「纯默认值常量」。
 * ------------------------------------------------------------------ */
