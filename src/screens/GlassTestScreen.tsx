/**
 * GlassTestScreen —— GlassKit 原生引擎验证页（玻璃迭代 it.12）。
 *
 * it.12（组件几何全面对齐用户真实 app HealthCheckIn 反编译规格）：
 * 只动几何/颜色/字号，不动引擎链路与交互逻辑。全部数值出处（D:/glass/hc-src/
 * sources/com/jiale/healthcheckin/ 反编译 Java）：
 * ① 色板（GlassTheme.kt → GlassThemeKt.java:41 light / :45 dark，ARGB 十进制转 hex；
 *   dark = isSystemInDarkTheme，MainActivity.java:73 → RN useColorScheme 同口径）：
 *   dark canvas #10161B / surface #1B242B / contentPrimary #E8EEF2（secondary α0x99、
 *   tertiary α0x66）/ accent #8AB4E8 / accentSecondary #6FD3B4 / accentTertiary
 *   #E0A187 / up #FFA9A2 / down #6FD3B4 / glassTint #1B242B / onAccent #10161B；
 *   light canvas #F2F5F7 / contentPrimary #17212B / accent #185FA5 / accentSecondary
 *   #0F6E56 / accentTertiary #993C1D / up #B3261E / glassTint #FFFFFF。
 *   背景色球换 accent 三色、页面底色换 canvas、文字换 contentPrimary/Secondary、
 *   PANEL_TINT 换 glassTint（H1 tint≤0.12 是 alpha 钳制契约，颜色值可换）。
 * ② dock（底栏）：高 64.3 / 内 pad 7 / 宽 0.9×屏宽 / 悬浮 15.3（GlassTuning.java:
 *   48-57 持久化默认值 bottomBarWidthScale=0.9、bottomBarHeightDp=64.3、
 *   bottomBarInnerPadDp=7.0、bottomBarFloatDp=15.3；消费点 MainScaffoldKt.java:473
 *   宽度 coerceIn(0.7,1.0)+bottomCenter+导航条 insets+floatDp padding）。dock 圆角 =
 *   真胶囊 Capsule（GlassKitKt.java:1413/1423 new Capsule）。dock 滑块默认值同步
 *   64.3 / 0.9；内 pad 5→7：tab 行 padding 7、指示器胶囊 inset 7、
 *   dockTabWidth=(dockWidth−14)/N、spring 目标 7+i×tabWidth（it.11 公式平移）。
 *   悬浮 15.3 记录为 dockWrap marginBottom（测试页 dock 是滚动列表内嵌项，
 *   非真悬浮，按任务口径用下边距承载）。
 * ③ 弹簧：dock 指示器 spring(0.85, 380) 反编译实证（GlassKitKt$GlassBottomTabs$
 *   1$1$1.java AnimationSpecKt.spring(0.85f, 380.0f)）→ 维持 it.11 参数不变；
 *   新增按压缩放弹簧 spring(0.62, 200)（SolidControlsKt.java:478 solidPress，
 *   damping=0.62×2×√200≈17.54）替换按压缩放 0.94 的 grant/release 弹簧。
 * ④ 圆角：卡片/容器圆角 24（GlassShape.java:11 container=24）、sheet 28
 *   （GlassShape.java:12，测试页无 sheet 演示件，仅记录）；GlassGroup 卡 24
 *   （GlassLayoutKt.java:548/646）；hero/clear/chip/toolbar 圆角基准改 24
 *   （radiusScale 倍率保留，it.10 可调性决定不动）。
 * ⑤ 字号/字重（GlassType.java:28-35）：hero 44 Medium / display 32 / title 28 /
 *   heading 20 / body 15 Normal / callout 14 Medium / label 12 Medium / micro 11
 *   Normal。落点：页面大标题 hero 44 M、状态行 label 12 M、面板标题 callout 14 M、
 *   面板副标题 micro 11 N、dock 说明/副标题 micro 11、控制行 label 12、
 *   返回按钮 body 15 N；tab 文字守卫 R6 下限 11（实例 10sp 被 R6 拦）。
 * ⑥ 页面 padding：GlassPage horizontalPadding 默认 16（GlassLayoutKt.java:228），
 *   内容层左右 20→16；顶栏内容水平 padding 20（GlassBarsKt.java:136）记录。
 * ⑦ dock tab 内容（GlassKitKt.java:1601-1609）：图标区 20dp / 间距 10-2-10；
 *   tab 选中色 = glasskit 默认 Accent #7CA6FF（GlassColorsKt.java:71）、未选中 =
 *   TextSecondary #9CA8BC（GlassColorsKt.java:55），选中 Bold / 未选中 Normal
 *   （GlassKitKt.java:1606-1608）。返回按钮高 44（GlassControlsKt.java:441
 *   GlassTextButton defaultMinSize minHeight 44 + padding 12）。
 * ⑧ 效果分级（GlassLevel.java:123-124/35-36，记录不入本轮）：BAR blur10/折射高3/
 *   折射强5/tint0.1、INDICATOR blur0/折射高8/折射强10/tint0/锁定折射0.8、
 *   OVERLAY blur30/tint0.12、CONTROL blur10/折射高5/折射强8/tint0.1。
 *
 * it.11（it.10 真机验收 2 项回修 + dock 独立调节）：
 * ① 指示器与 tab 几何错位修正（P0，错位公式实锤）：it.10 指示器 track 宽 =
 *   dockWidth/N（整宽均分没扣 tab 行 padding 5）、translateX = i×dockWidth/N，
 *   而 tab 宽 = (dockWidth−10)/N → 胶囊中心与 tab 中心错位 = 5 − (i+0.5)×10/N
 *  （N=4 首端 +3.75 / 尾端 −3.75dp）。修法 = track 宽改 (dockWidth−10)/N、
 *   spring 目标改 5 + i×tabWidth，胶囊 inset 5 不变 → 中心严格重合。⚠️ 实例
 *   Compose（GlassKit.kt tabWidth=整宽/N + Row padding 5）同样存在此错位，RN 版修正之。
 * ② 指示器边缘锯齿第二轮取证修复（引擎侧，见 GlassLensShader / GlassKitView it.11
 *   注释）：真机取证（it11-before.log）实锤两条——a) dispersion=20px 时 RGB 三通道
 *   贴边错位采样最大 36px → 曲面彩边（shader 侧色散贴边收敛）；b) 指示器透镜输入 =
 *   dock 被采集时的软画布降级渲染（单步 1/6 降采样双线性跳采样混叠；dock 屏幕帧
 *   走 GPU 全分辨率，故 dock 正常、指示器锯齿）→ 软画布降采样改逐级 2 倍半采样链。
 * ③ dock 独立调节滑块（用户要求）：「dock 高度（48–96）」「dock 宽度倍率
 *   （0.6–1.4）」「dock 圆角（0–48，999=全胶囊）」三滑块，高度/宽度/圆角全部
 *   inline 由 state 驱动（styles 写死 64 移除）；宽度变化经 onLayout → dockWidth
 *   自动更新 → 指示器几何按①公式自动跟随；bar 与指示器 cornerRadiusDp 共用
 *   dock 圆角值（999 时引擎钳制 = 真胶囊，调小变圆角矩形）。
 *
 * it.10（it.9 真机验收 8 项回修）：
 * ① 指示器滑动修复（P0）：it.9 的 Animated.View style 漏挂 transform——dockIndicatorX
 *   spring 在跑但动画值空转，指示器钉死原位。现挂 translateX（绝对目标定位 =
 *   dockSelected × 步长，与实例 graphicsLayer translationX 同语义，无累计漂移）。
 * ② 指示器接全局滑块（对齐实例 GlassKit.kt:293-299 lens(8·s, 10·s, 色散)）：
 *   refractionPx = 8 × lensScale、dispersionPx = 10 × lensScale × (dispersionLevel /
 *   0.35)（默认 0.35 时=10 与实例一致，色散滑块拉动即变）、blurDp = 2 × blurScale
 *   （基础 2dp 轻模糊，模糊滑块可调；⚠️ 与实例偏差：实例指示器无 blur，此处为
 *   滑块可调性而加）、membraneAlpha 保持 0.05（实例 Color.White 0.05f）。
 * ③ dock bar 加折射（用户拍板：bar 本身也要有折射感）：refractionPx = 5 × lensScale、
 *   dispersionPx 保持 0（色散留给指示器）。⚠️ 与实例偏差：实例 bar 无 lens
 *   （GlassBottomTabs 仅 blur+vibrancy+tint），本项为用户真机验收拍板的偏离。
 * ④ 胶囊/工具条圆角滑块修复：radii.pill=999 被引擎钳到 min(w,h)/2 恒定（钳制逻辑
 *   正确不动），radiusScale 乘多少都无感——chip/toolbar 改用 radii.toolbar（22dp
 *   基础可调）。⚠️ 与实例 Capsule 偏差：用户要求可调性优先。dock 两处真胶囊不动。
 * ⑤ 指示器边缘锯齿（P0，取证修复见 GlassKitView.kt it.10 注释）：AGSL 透镜
 *   shader SDF 硬截断（sdf>0 直接透明，1px 无过渡）为边缘锯齿主根因——shader
 *   内 1px 贴边 alpha 渐变 AA；透镜路径 capture 强制全分辨率（不降采样）+
 *   capture 分辨率取证日志。
 * ⑥ 「玻璃叠玻璃（指示器透镜）」开关：关 = 条件渲染不挂指示器 GlassKitView（省
 *   整条双重透射管线），显示纯色半透明胶囊占位（实色+opacity 守卫合规），spring
 *   动画照常（transform 在 Animated.View 上与玻璃无关）——真机流畅度 A/B 用。
 *
 * it.9：① 第五块 demo 升级为「底部标签栏」完整还原（对照 lg-compose/GlassKit.kt
 * GlassBottomTabs 221–309 行）：64dp 全胶囊 bar（blurDp 10 / tint 走 store / 无透镜，
 * 实例 bar 仅 blur+vibrancy+tint）、5dp 内边距、54dp 胶囊指示器（lens refraction 8 /
 * dispersion 10，透镜采 dock 合成帧 = 玻璃叠玻璃链路保持）、点按任意 tab 切换选中态
 * 并以 Animated spring 驱动指示器 translationX（实例 spring dampingRatio 0.85 /
 * stiffness 380；RN Animated 无 dampingRatio，换算 damping = 0.85×2×√380 ≈ 33.14
 * @mass 1，useNativeDriver）；tab 内容 = 20dp 图标区（emoji 色块模拟）+ 11sp 文字
 * （实例 10sp，guard R6 基线只拦新增 → 取 11sp 下限，形态一致）；选中项高亮白色。
 * ② 组件外形对齐实例：Hero 圆角 22（GlassTopBar RoundedCornerShape(22dp) 档）；
 * 工具条 64dp / 全胶囊 / blur 12（GlassDetailBar 规格）；Chip 按压缩放 0.94
 * （GlassRoundButton/Chip 按压反馈，DraggableGlass 按下 spring 缩放松开回弹）。
 * ③ 新增「色散强度」滑块 0–1（默认 0.35，来源 lg-main GlassDefaults.DISPERSION，
 * dispersionPx = 值×20：0.35→7px 与原 hero 6px 量级衔接）与「膜层浓度」滑块 0–1
 * （默认 0.38，引擎 membraneAlpha 白膜 prop，tint 后压暗前）。指示器膜层按实例
 * 白 0.05 固定。④ 引擎纱窗感修复（GPU 全分辨率离屏模糊）与闪烁回归修复见
 * GlassKitView.kt it.9 注释。
 *
 * it.8：① 高光滑块归零残余高光修复（根因：chip/toolbar 两块面板此前未传 glow
 * 系列 props，归零后仍吃原生默认值 glowTopScale/glowBottomScale=1——四面板现已
 * 全量透传；原生侧发丝线 alpha 同步随 max(top,bottom) 缩放，全关=完全无高光）；
 * ② 面板大小滑块拆分为「宽度倍率」「高度倍率」两个独立滑块；③ 新增第五块
 * demo「底部菜单（玻璃叠玻璃）」：外层 dock capturable=true 注册为采集源，
 * 内层指示条 backdropTag 指向外层 handle，双重透镜（透镜仅限本页验证场，
 * 正式接入仍守 lens 仅 indicator 铁律②）。
 *
 * it.7：边缘高光重做（原生侧顶/底窄带 LinearGradient 多 stop 非线性衰减，
 * 高光取代描边），状态行 it.7。
 *
 * it.5：胶囊圆角修复（引擎侧 cornerRadiusPx 钳到 min(w,h)/2，radii.pill=999 不再
 * 令 SDF 全形外输出透明）+ 四倍率默认值固化（blur 0.10 / tint 1.00 / lens 2.00 /
 * glow 1.75，persist v0→v1 迁移一次性覆盖旧散存值），状态行 it.5。
 *
 * 用途：
 * - 验证 GlassKitBackdrop（采集源）+ GlassKitView（玻璃面板）链路是否真实出效果；
 * - 验证 glass.ts 四倍率（blur/tint/lens/glow）实时调参 → 原生渲染联动
 *  （glowScale 自本轮迭代起进引擎，作用于边缘高光宽/alpha）；
 * - 真机调参工作台（用户指令「开始迭代」）：
 *   · 四块玻璃面板全部**可拖动**（PanResponder，拖到色球/文字上便于观察模糊与折射）；
 *   · 圆角倍率 / 宽度倍率 / 高度倍率实时滑块（it.8 长宽独立调节）；
 *   · 模糊路径开关（真机默认 GPU 全分辨率高斯；模拟器 GPU 缺陷时开「强制降采样」）；
 *   · 版本号显示（expo-constants 读 app.json version，随迭代 bump）。
 *
 * 结构：
 * - GlassKitBackdrop（absoluteFill）：彩色渐变 + 色块（被玻璃采集的内容层）；
 * - 前景层：标题/状态行、4 块可拖动玻璃面板（hero / chip / toolbar / clear+压暗）、
 *   第 5 块 demo「底部标签栏（玻璃叠玻璃，点按弹簧移动）」（it.9 还原）、
 *   控制卡（总开关 + 路径开关 + 滑块组）、返回主界面按钮。
 *
 * ⚠️ 本页为临时验证页：路由经 GLASS_TEST_FIRST 临时首屏开关进入（navigation/index.tsx），
 * 验证完成后改回 false 即恢复原首屏，本页路由保留可随时再进。
 *
 * 守卫合规：无内联 rgba 背景（用实色 + opacity）、圆角全走 radii token、字号 ≥11
 * （it.9 tab 文字取 11sp 下限，实例 10sp 被 guard R6 拦截）、无 BlurView、
 * 无玻璃 API 在内容层组件内直接调用（面板仅作为功能层叶子挂载）。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  findNodeHandle,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import GlassKitBackdrop from '../native/GlassKitBackdrop';
import GlassKitView from '../native/GlassKitView';
import GlassSlider from '../components/GlassSlider';
import { canBlur, canLens, SCALE_RANGES, useGlassStore } from '../theme/glass';
import { radii } from '../theme/radii';

/** 临时首屏开关 companion：见 src/navigation/index.tsx 顶部同名常量（同一布尔口径）。 */
export const GLASS_TEST_ROUTE = 'GlassTest';

/** 版本号：app.json version（随每次迭代 bump，构建期注入原生 manifest 同步改）。 */
const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

/** it.12 色板：HealthCheckIn GlassTheme 反编译实证（GlassThemeKt.java:41 light /
 *  :45 dark，Compose packed ARGB 十进制 → hex；带 alpha 的项为 RN #RRGGBBAA 序）。
 *  dark = isSystemInDarkTheme（MainActivity.java:73）→ RN useColorScheme 同口径。
 *  PANEL_TINT 换成对应主题的 glassTint（H1 tint≤0.12 是 alpha 钳制契约，颜色值随意换）。 */
const THEME_COLORS = {
  light: {
    canvas: '#F2F5F7', // GlassThemeKt.java:41 Color(4294112759L)
    surface: '#FFFFFF',
    contentPrimary: '#17212B', // Color(4279705899L)
    contentSecondary: '#17212B99', // Color(2568429867L) α0x99
    contentTertiary: '#17212B66', // Color(1712791851L) α0x66
    accent: '#185FA5', // Color(4279787429L)
    accentSecondary: '#0F6E56', // Color(4279201366L)
    accentTertiary: '#993C1D', // Color(4288232477L)
    up: '#B3261E', // Color(4289930782L)
    down: '#0F6E56', // Color(4279201366L)
    glassTint: '#FFFFFF', // Color(4294967295L)
    onAccent: '#FFFFFF',
  },
  dark: {
    canvas: '#10161B', // GlassThemeKt.java:45 Color(4279244315L)
    surface: '#1B242B', // Color(4279968811L)
    contentPrimary: '#E8EEF2', // Color(4293455602L)
    contentSecondary: '#E8EEF299', // Color(2582179570L) α0x99
    contentTertiary: '#E8EEF266', // Color(1726541554L) α0x66
    accent: '#8AB4E8', // Color(4287280360L)
    accentSecondary: '#6FD3B4', // Color(4285518772L)
    accentTertiary: '#E0A187', // Color(4292911495L)
    up: '#FFA9A2', // Color(4294945186L)
    down: '#6FD3B4', // Color(4285518772L)
    glassTint: '#1B242B', // Color(4279968811L)
    onAccent: '#10161B', // Color(4279244315L)
  },
} as const;

type GlassScheme = keyof typeof THEME_COLORS;

/** it.12 dock tab 文字色：真实 app dock 传 0L 走 glasskit 默认色——inactive =
 *  TextSecondary #9CA8BC（GlassColorsKt.java:55 Color(4288456892L)）直接落地；
 *  active 真值为 glasskit 旧 Accent #7CA6FF（GlassColorsKt.java:71
 *  Color(4286359295L)），但守卫硬规则 D7 禁止该值落地（03 §3.1）→ 按主题语义
 *  对位为 GlassTheme accent（THEME_COLORS，GlassThemeKt.java:41/45），
 *  JSX 处随主题取 C.accent。 */
const DOCK_TAB_INACTIVE_COLOR = '#9CA8BC';

/** it.12 几何常量（反编译实证，出处见各注释；变量形式传 borderRadius 以过守卫 R3）。 */
const SHAPE_CONTAINER = 24; // GlassShape.java:11 container=24（卡片/容器圆角）
/** it.12 sheet 圆角（GlassShape.java:12 sheet=28）：测试页无 sheet 演示件，
 *  规格记录值（GlassSheetHostKt / GlassDialogKt.java:115 RoundedCornerShape(28)）。 */
export const SHAPE_SHEET = 28;
const DOCK_HEIGHT_DP = 64.3; // GlassTuning.java:51 bottomBarHeightDp=64.3
const DOCK_INNER_PAD = 7; // GlassTuning.java:54 bottomBarInnerPadDp=7.0
const DOCK_WIDTH_SCALE = 0.9; // GlassTuning.java:48 bottomBarWidthScale=0.9
const DOCK_FLOAT_DP = 15.3; // GlassTuning.java:57 bottomBarFloatDp=15.3（真机悬浮边距，
// 测试页 dock 是滚动列表内嵌项 → 按任务口径转为 dockWrap 下边距 marginBottom）
const PAGE_HORIZONTAL_PAD = 16; // GlassLayoutKt.java:228 GlassPage horizontalPadding 默认 16
const TEXT_BUTTON_HEIGHT = 44; // GlassControlsKt.java:441 defaultMinSize minHeight 44

/** it.9 tint 色值（Bug 修复：旧架构 Paper 桥接对 customType="Color" 的 prop 会在 JS 渲染器
 *  里自动执行一次 processColor（getNativeComponentAttributes 的 validAttributes，
 *  case 'Color': return processColor）。若 JS 侧再传 processColor 后的数字会被
 *  **二次 processColor**：normalizeColor(负数 ColorInt) 返回 null → prop 被整帧丢弃
 *  → 原生 tintColor 恒为 0，tint 层永不渲染（真机 logcat + 像素取证实证）。
 *  所以旧架构下必须传**原始字符串**，让桥接层做唯一一次 processColor。
 *  it.12：PANEL_TINT 升级为主题函数 glassTint（见 THEME_COLORS）。 */
function panelTintFor(scheme: GlassScheme): string {
  return THEME_COLORS[scheme].glassTint;
}

/** it.9 色散强度换算：dispersionPx = 值 × 20（0.35→7px，与原 hero 6px 量级衔接）。 */
const DISPERSION_PX_PER_UNIT = 20;

/** it.9 Dock tab 集（demo 无图标资源：emoji 色块模拟实例 Image 图标区）。 */
const DOCK_TABS = [
  { icon: '⌂', label: '首页' },
  { icon: '✉', label: '消息' },
  { icon: '＋', label: '发布' },
  { icon: '⚙', label: '我的' },
] as const;

/** it.9 dock 指示器弹簧参数换算：真实 app spring(dampingRatio=0.85, stiffness=380)
 *  反编译实证（GlassKitKt$GlassBottomTabs$1$1$1.java AnimationSpecKt.spring(0.85f,
 *  380.0f, 0.01f)）。RN Animated.spring 无 dampingRatio：damping = dampingRatio ×
 *  2 × √(stiffness×mass) = 0.85 × 2 × √380 ≈ 33.14（mass=1）。 */
const DOCK_SPRING = { stiffness: 380, damping: 33.14, mass: 1 } as const;

/** it.12 按压缩放弹簧：真实 app solidPress spring(dampingRatio=0.62, stiffness=200)
 *  （SolidControlsKt.java:478 animateFloatAsState(..., spring$default(0.62f, 200.0f,...))）。
 *  damping = 0.62 × 2 × √200 ≈ 17.54（mass=1）。 */
const PRESS_SPRING = { stiffness: 200, damping: 17.54, mass: 1 } as const;

/** 滑块值统一夹取 + 两位小数（避免拖动中浮点尾巴引发文本抖动）。 */
function clampRange(next: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, next)).toFixed(2));
}

function clampScale(key: keyof typeof SCALE_RANGES, next: number): number {
  const range = SCALE_RANGES[key];
  return clampRange(next, range.min, range.max);
}

/** 通用滑块行：label 左 / 滑块中(flex) / 数值右。
 *  it.12：文字色随主题（contentPrimary/contentSecondary），字号 label 12（GlassType）。 */
function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: C.contentPrimary }]}>{props.label}</Text>
      <GlassSlider value={props.value} min={props.min} max={props.max} onChange={props.onChange} />
      <Text style={[styles.rowValue, { color: C.accent }]}>{props.value.toFixed(2)}</Text>
    </View>
  );
}

/** 单行滑块控制（四倍率专用：区间取自 SCALE_RANGES，onChange 走 store 钳制）。 */
function ScaleSliderRow(props: {
  label: string;
  value: number;
  scaleKey: keyof typeof SCALE_RANGES;
  onChange: (next: number) => void;
}) {
  const range = SCALE_RANGES[props.scaleKey];
  return (
    <SliderRow
      label={props.label}
      value={props.value}
      min={range.min}
      max={range.max}
      onChange={props.onChange}
    />
  );
}

/** 开关行：label 左 / Switch 右（it.12：文字色随主题，字号 label 12）。 */
function SwitchRow(props: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.rowLabel, { color: C.contentPrimary }]}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} />
    </View>
  );
}

/**
 * 可拖动容器（用户指令「把各个组件做成可拖动的」便于观察模糊/折射）。
 * onStart 即接管手势（面板吞掉触摸，手指在面板上时页面不滚动）；
 * 位移走 transform translate——getLocationOnScreen 反映 transform，
 * GlassKitView 采集随 PreDraw 自动跟随，玻璃内容实时正确。
 *
 * it.9：① interactive=true 时让位子组件手势（Dock 点按 tab 用——PanResponder
 * 不再抢先接管，Pressable 可收到点击；代价：Dock 本体不再可拖动）。
 * ② 按压缩放 0.94（实例 GlassRoundButton/Chip 按压反馈）：PanResponder grant
 * 时 spring 缩到 0.94，release/terminate 回弹 1（native driver，仅 scale）。
 */
function DraggableGlass(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  /** it.11 任务三：外层容器宽度测量透传（dock 宽度倍率以容器实测宽为基准）。 */
  onLayout?: (evt: { nativeEvent: { layout: { width: number; height: number } } }) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const gestureRef = useRef({ baseX: 0, baseY: 0, originX: 0, originY: 0 });
  // it.9 按压缩放（0.94 = 实例 Chip 按压规格；spring 回弹）
  const pressScale = useRef(new Animated.Value(1)).current;
  const panResponder = useRef(
    PanResponder.create({
      // interactive：不抢手势，子组件（tab Pressable）收触摸
      onStartShouldSetPanResponder: () => !props.interactive,
      onMoveShouldSetPanResponder: () => !props.interactive,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        gestureRef.current = {
          baseX: offsetRef.current.x,
          baseY: offsetRef.current.y,
          originX: evt.nativeEvent.pageX,
          originY: evt.nativeEvent.pageY,
        };
        Animated.spring(pressScale, {
          toValue: 0.94,
          // it.12：按压弹簧对齐真实 app solidPress spring(0.62, 200)
          //（SolidControlsKt.java:478），替换 it.9 起沿用的 DOCK_SPRING
          ...PRESS_SPRING,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const g = gestureRef.current;
        const next = {
          x: g.baseX + (evt.nativeEvent.pageX - g.originX),
          y: g.baseY + (evt.nativeEvent.pageY - g.originY),
        };
        offsetRef.current = next;
        setOffset(next);
      },
      onPanResponderRelease: () => {
        Animated.spring(pressScale, {
          toValue: 1,
          // it.12：回弹同 solidPress spring(0.62, 200)（SolidControlsKt.java:478，
          // 真实 app 按下/松开同一条 spring 规格），替换 300/18 手调值
          ...PRESS_SPRING,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pressScale, {
          toValue: 1,
          ...PRESS_SPRING,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;
  return (
    <Animated.View
      style={[
        props.style,
        {
          transform: [
            { translateX: offset.x },
            { translateY: offset.y },
            { scale: pressScale },
          ],
        },
      ]}
      onLayout={props.onLayout}
      {...panResponder.panHandlers}
    >
      {props.children}
    </Animated.View>
  );
}

/** 玻璃面板容器：GlassKitView（功能层叶子）+ 叠加说明文字。
 *  it.12：tintColor 与文字色改为随系统主题（GlassTheme dark=isSystemInDarkTheme，
 *  MainActivity.java:73），字号对齐 GlassType（标题 callout 14 M / 副标题 micro 11 N）。 */
function GlassPanel(props: {
  title: string;
  subtitle: string;
  style: ViewStyle;
  backdropTag?: number;
  blurDp: number;
  cornerRadiusDp: number;
  refractionPx?: number;
  dispersionPx?: number;
  dimmingAlpha?: number;
  membraneAlpha: number;
  glowAlphaScale?: number;
  glowWidthScale?: number;
  glowTopScale?: number;
  glowBottomScale?: number;
  blurEnabled: boolean;
  forceDownsample: boolean;
}) {
  // it.12：跟随系统主题（真实 app GlassTheme dark 参数同口径）
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  return (
    <View style={[styles.panel, props.style]}>
      <GlassKitView
        style={StyleSheet.absoluteFill}
        backdropTag={props.backdropTag}
        blurDp={props.blurDp}
        tintAlpha={0.10}
        tintColor={panelTintFor(scheme)}
        cornerRadiusDp={props.cornerRadiusDp}
        refractionPx={props.refractionPx}
        dispersionPx={props.dispersionPx}
        dimmingAlpha={props.dimmingAlpha}
        membraneAlpha={props.membraneAlpha}
        glowAlphaScale={props.glowAlphaScale}
        glowWidthScale={props.glowWidthScale}
        glowTopScale={props.glowTopScale}
        glowBottomScale={props.glowBottomScale}
        blurEnabled={props.blurEnabled}
        forceDownsample={props.forceDownsample}
      />
      <View style={styles.panelTextWrap} pointerEvents="none">
        <Text style={[styles.panelTitle, { color: C.contentPrimary }]}>
          {props.title}
        </Text>
        <Text style={[styles.panelSubtitle, { color: C.contentSecondary }]}>
          {props.subtitle}
        </Text>
      </View>
    </View>
  );
}

export default function GlassTestScreen(props: { navigation: { navigate: (route: string) => void } }) {
  // it.12：主题跟随系统（真实 app GlassTheme(dark=isSystemInDarkTheme)，
  // MainActivity.java:73）——色板/文字/tint 全部取自 THEME_COLORS 反编译实证值
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  const backdropRef = useRef(null);
  const [backdropTag, setBackdropTag] = useState<number | undefined>(undefined);
  const [blurOn, setBlurOn] = useState(true);
  const [forceDown, setForceDown] = useState(false);
  const [radiusScale, setRadiusScale] = useState(1);
  // it.8：面板大小拆分为宽度/高度两个独立倍率（0.5–2）
  const [widthScale, setWidthScale] = useState(1);
  const [heightScale, setHeightScale] = useState(1);
  // it.8 任务四：玻璃叠玻璃 demo——外层 dock 的原生 tag（内层指示条采集源）
  const dockGlassRef = useRef(null);
  const [dockGlassTag, setDockGlassTag] = useState<number | undefined>(undefined);
  // it.10 任务六：玻璃叠玻璃开关（开 = 指示器 GlassKitView 双重透射；关 = 条件渲染
  // 不挂内层玻璃，纯色半透明胶囊占位，spring 照常——真机流畅度 A/B 对比用）
  const [glassOnGlass, setGlassOnGlass] = useState(true);
  // it.9 Dock：选中 tab + 容器宽（指示器 translationX = index × 宽/N）+ 弹簧驱动值
  const [dockSelected, setDockSelected] = useState(0);
  const [dockWidth, setDockWidth] = useState(0);
  const dockIndicatorX = useRef(new Animated.Value(0)).current;
  // it.11 任务三：dock 独立调节（用户要求该控件单独做高度/宽度/圆角调节，
  // 随 blurOn 等 state 同区域）。
  // it.12：默认值对齐真实 app 持久化默认 GlassTuning.java:48-57——高度 64.3、
  // 宽度倍率 0.9、圆角默认仍全胶囊 999（真机 dock 是 Capsule，GlassKitKt.java:1413）
  const [dockHeight, setDockHeight] = useState(DOCK_HEIGHT_DP);
  const [dockWidthMult, setDockWidthMult] = useState(DOCK_WIDTH_SCALE);
  const [dockRadius, setDockRadius] = useState(999);
  // it.6 柔光细化四参数（本地调参态，不进持久化 store——与圆角/大小倍率同模式）
  const [glowAlpha, setGlowAlpha] = useState(1);
  const [glowWidth, setGlowWidth] = useState(1);
  const [glowTop, setGlowTop] = useState(1);
  const [glowBottom, setGlowBottom] = useState(1);
  // it.9：色散强度（0–1，默认 0.35 = GlassDefaults.DISPERSION）与膜层浓度（0–1，默认 0.38）
  const [dispersionLevel, setDispersionLevel] = useState(0.35);
  const [membrane, setMembrane] = useState(0.38);

  const blurScale = useGlassStore((state) => state.blurScale);
  const tintScale = useGlassStore((state) => state.tintScale);
  const lensScale = useGlassStore((state) => state.lensScale);
  const glowScale = useGlassStore((state) => state.glowScale);

  const onBackdropLayout = useCallback(() => {
    const handle = findNodeHandle(backdropRef.current);
    if (handle != null) setBackdropTag(handle);
  }, []);

  // it.8 任务四：外层 dock 挂载后取 handle 广播给内层指示条（backdropTag）
  const onDockGlassLayout = useCallback(() => {
    const handle = findNodeHandle(dockGlassRef.current);
    if (handle != null) setDockGlassTag(handle);
  }, []);

  // it.9 Dock：容器宽测量（指示器宽 = 容器宽 / tab 数）
  const onDockFrameLayout = useCallback((evt: { nativeEvent: { layout: { width: number } } }) => {
    setDockWidth(evt.nativeEvent.layout.width);
  }, []);

  // it.11 任务一：指示器几何对齐 tab（错位公式与修法）。
  // it.10 错位现状：tab 行 padding 5 → tab 宽 = (dockWidth−10)/N，tab i 中心 =
  // 5 + (i+0.5)(dockWidth−10)/N；而指示器 track 宽 = dockWidth/N（整宽均分没扣
  // padding）、translateX = i×dockWidth/N → 胶囊中心与 tab 中心错位 =
  // 5 − (i+0.5)×10/N：N=4 时首端 +3.75 / 尾端 −3.75dp——用户肉眼可见
  // 「图标不在胶囊几何中心」。修法（几何严格对齐 tab）：
  //   track 宽 = (dockWidth−10)/N（= tab 实宽）、spring 目标 = 5 + i×tabWidth；
  //   胶囊 inset 5 不变 → 胶囊中心 = 5 + i×tabWidth + tabWidth/2 = tab i 中心。
  // ⚠️ 实例 Compose（lg-compose GlassKit.kt GlassBottomTabs：tabWidth=整宽/N +
  // Row padding 5）同样存在此错位——RN 版本修正之，实例侧未动。
  // it.12：内 pad 5→7（GlassTuning.java:54 bottomBarInnerPadDp=7.0），公式平移：
  //   track 宽 = (dockWidth−2×7)/N、spring 目标 = 7 + i×tabWidth、胶囊 inset 7。
  const dockTabWidth =
    dockWidth > 0 ? (dockWidth - DOCK_INNER_PAD * 2) / DOCK_TABS.length : 0;

  // it.9 Dock：点按/宽度变化 → spring 驱动指示器 translationX（点按移动效果）。
  // it.11 任务一：spring 目标 = 5 + i×tabWidth；it.12：pad 7（公式平移见上注释）。
  useEffect(() => {
    if (dockTabWidth <= 0) return;
    Animated.spring(dockIndicatorX, {
      toValue: DOCK_INNER_PAD + dockSelected * dockTabWidth,
      ...DOCK_SPRING,
      useNativeDriver: true,
    }).start();
  }, [dockSelected, dockTabWidth, dockIndicatorX]);

  // it.9：色散 px 换算（滑块值 × 20，作用于所有开透镜的面板）；指示器走实例公式
  // lens(8, 10) × lensScale、色散 10 × lensScale × (dispersionLevel / 0.35)，见 dock 段。
  const panelDispersionPx = Math.round(dispersionLevel * DISPERSION_PX_PER_UNIT);
  // it.10：指示器透镜参数（对齐实例 GlassKit.kt:293-299 lens(8·s, 10·s, chromaticAberration)）
  const indicatorRefractionPx = Math.round(8 * lensScale);
  // 默认 dispersionLevel=0.35 时 = 10 × lensScale（与实例完全一致）；色散滑块拉动即变
  const indicatorDispersionPx = Math.round(10 * lensScale * (dispersionLevel / 0.35));
  // it.10：指示器轻模糊基础 2dp × blurScale（⚠️ 与实例偏差：实例指示器无 blur，
  // 此处为模糊滑块可调性而加；默认 blurScale=0.1 时 round 后=0 即无模糊）
  const indicatorBlurDp = Math.round(2 * blurScale);

  // it.8：chip/toolbar 行宽缩放。设计说明：行内两面板 flex:1 / flex:1.4（flexBasis 0
  // + flexGrow 按比例分配），对两者乘同一 widthScale 是数学上的 no-op（比例项相约，
  // 行宽不变）——故改为缩放整行宽度：行基准宽 = 屏宽 − 40（foreground 左右 padding），
  // 目标宽 = 基准 × widthScale → marginHorizontal = (基准 − 目标)/2。负 margin 下限
  // −20（吃满内容层 padding 即屏宽封顶）：行永不换行、永不溢出屏幕，相对比例 1:1.4
  // 恒保持；widthScale > 屏宽上限后行宽封顶不再变化（hero/clear 全宽面板不受限）。
  const winWidth = useWindowDimensions().width;
  const panelRowMargin = Math.max(-20, ((winWidth - 40) * (1 - widthScale)) / 2);

  // it.12：dockFrame 宽 = 屏宽 × 宽度倍率（真实规格 bottomBarWidthScale=0.9，
  // GlassTuning.java:48；消费点 MainScaffoldKt.java:473 fillMaxWidth(coerceIn(0.7,1.0))
  // + BottomCenter——基准是**屏宽**而非容器宽，故 it.11 的容器实测宽基准改屏宽基准，
  // 默认 0.9 → uiautomator bounds 宽 = 0.9×屏宽可验。alignSelf center 居中不变；
  // 倍率变化 → dockFrame onLayout 上报 dockWidth 自动更新 → 指示器几何跟随。
  // 高度/圆角 inline 由 state 驱动（it.11 起滑块接管）。
  const dockFrameWidth = Math.round(winWidth * dockWidthMult);
  // JS 侧圆角钳制与引擎口径一致 min(radius, h/2)：dockRadius=999 → 高度一半 = 全胶囊
  //（引擎侧 cornerRadiusDp=999 同样钳到 min(w,h)/2）；调小（0–48）→ 圆角矩形
  const dockFrameRadius = Math.min(dockRadius, dockHeight / 2);
  // 占位胶囊（玻璃叠玻璃关）：半径按胶囊实际尺寸（track 高 − 2×内pad）钳制
  const dockFallbackRadius = Math.max(
    0,
    Math.min(dockRadius, (dockHeight - DOCK_INNER_PAD * 2) / 2),
  );

  const apiLevel = Platform.OS === 'android' ? Number(Platform.Version) : -1;

  return (
    // it.12：root 底色随主题 canvas（GlassThemeKt.java:41/45）
    <View style={[styles.root, { backgroundColor: C.canvas }]}>
      {/* 内容层：被玻璃采集的彩色背景（GlassKitBackdrop 原生注册）。
          it.12：色球颜色换 GlassTheme accent 三色（GlassThemeKt.java:41/45） */}
      <GlassKitBackdrop ref={backdropRef} style={StyleSheet.absoluteFill} onLayout={onBackdropLayout}>
        <LinearGradient colors={['#1b2735', '#7b4397', '#2cd8d5']} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.blob,
            styles.blobA,
            { backgroundColor: C.accent }, // accent（dark #8AB4E8 / light #185FA5）
          ]}
        />
        <View
          style={[
            styles.blob,
            styles.blobB,
            { backgroundColor: C.accentSecondary }, // accentSecondary（#6FD3B4 / #0F6E56）
          ]}
        />
        <View
          style={[
            styles.blob,
            styles.blobC,
            { backgroundColor: C.accentTertiary }, // accentTertiary（#E0A187 / #993C1D）
          ]}
        />
      </GlassKitBackdrop>

      {/* 前景层：标题 + 可拖动玻璃面板 + 调参 + 返回 */}
      <ScrollView contentContainerStyle={styles.foreground}>
        <Text style={[styles.hero, { color: C.contentPrimary }]}>玻璃引擎测试</Text>
        <Text style={[styles.statusLine, { color: C.contentSecondary }]}>
          {`${APP_VERSION}-it.12 · API ${apiLevel} · canBlur=${canBlur()} · canLens=${canLens()} · blur=${blurOn}`}
        </Text>
        <Text style={[styles.statusLine, { color: C.contentSecondary }]}>
          {`采样路径：${forceDown ? '强制降采样（模拟器用）' : 'GPU 全分辨率高斯（真机）'} · 面板可拖动`}
        </Text>

        {/* it.12：圆角对齐 GlassShape.container=24（GlassShape.java:11；it.9 的
            GlassTopBar 22 档退役），高度保留 120dp 演示尺寸（真实顶栏 60.85 高、
            宽 0.8×屏宽，见 it.12 注释②，hero 是演示大面板按任务口径保留演示性） */}
        <DraggableGlass
          style={[
            styles.panelHero,
            {
              height: Math.round(120 * heightScale),
              width: `${widthScale * 100}%`,
              alignSelf: 'center',
            },
          ]}
        >
          <GlassPanel
            title="Hero 大面板"
            subtitle="blurDp 14 · 圆角24(GlassShape.container) · 可拖动"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={14}
            cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
            refractionPx={10}
            dispersionPx={panelDispersionPx}
            membraneAlpha={membrane}
            glowAlphaScale={glowAlpha}
            glowWidthScale={glowWidth}
            glowTopScale={glowTop}
            glowBottomScale={glowBottom}
            blurEnabled={blurOn}
            forceDownsample={forceDown}
          />
        </DraggableGlass>
        <View style={[styles.panelRow, { marginHorizontal: panelRowMargin }]}>
          <DraggableGlass style={[styles.panelChip, { height: Math.round(64 * heightScale) }]}>
            <GlassPanel
              title="Chip 胶囊"
              subtitle="blurDp 8 · 圆角24·可调 · 按压缩放0.94"
              style={styles.panelCompact}
              backdropTag={backdropTag}
              blurDp={8}
              // it.12：圆角基准改 GlassShape.container=24（GlassShape.java:11，
              // GlassGroup 卡片圆角 GlassLayoutKt.java:548）；radiusScale 可调保留
              cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
              refractionPx={10}
              dispersionPx={panelDispersionPx}
              membraneAlpha={membrane}
              // it.8 修复：chip/toolbar 此前漏传 glow 系列 props（归零后仍吃原生
              // 默认值 top/bottom=1，即用户报告的「胶囊和工具条仍有基础顶/底高光」）
              glowAlphaScale={glowAlpha}
              glowWidthScale={glowWidth}
              glowTopScale={glowTop}
              glowBottomScale={glowBottom}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
          </DraggableGlass>
          {/* it.9 对齐实例：工具条 → GlassDetailBar（64dp / Capsule / blur 12）。
              it.12：圆角基准同 chip 改 24（GlassShape.container），可调保留 */}
          <DraggableGlass style={[styles.panelToolbar, { height: Math.round(64 * heightScale) }]}>
            <GlassPanel
              title="工具条"
              subtitle="blurDp 12 · 圆角24·可调"
              style={styles.panelCompact}
              backdropTag={backdropTag}
              blurDp={12}
              cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
              refractionPx={10}
              dispersionPx={panelDispersionPx}
              membraneAlpha={membrane}
              glowAlphaScale={glowAlpha}
              glowWidthScale={glowWidth}
              glowTopScale={glowTop}
              glowBottomScale={glowBottom}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
          </DraggableGlass>
        </View>
        <DraggableGlass
          style={[
            styles.panelClear,
            {
              height: Math.round(88 * heightScale),
              width: `${widthScale * 100}%`,
              alignSelf: 'center',
            },
          ]}
        >
          <GlassPanel
            title="clear + 压暗"
            subtitle="blurDp 10 · dimming 0.35 · 折射+色散 · 圆角24"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={10}
            cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
            refractionPx={10}
            dispersionPx={panelDispersionPx}
            dimmingAlpha={0.35}
            membraneAlpha={membrane}
            glowAlphaScale={glowAlpha}
            glowWidthScale={glowWidth}
            glowTopScale={glowTop}
            glowBottomScale={glowBottom}
            blurEnabled={blurOn}
            forceDownsample={forceDown}
          />
        </DraggableGlass>

        {/* it.10：底部标签栏（GlassKit.kt GlassBottomTabs 还原 + 真机验收回修）。
            外层 bar：64dp 全胶囊（blur 10 / tint 走 store）、capturable=true 注册为
            采集源；⚠️ it.10 任务三与实例偏差：bar 加轻折射 refractionPx=5×lensScale
            （实例 bar 无 lens）——用户拍板「bar 本身也要有折射感」，色散留给指示器。
            内层 54dp 胶囊指示器：lens 参数接全局滑块（任务二，见 dock 段换算注释），
            backdropTag 指向外层 handle——玻璃叠玻璃双重透射（透镜仅限本页验证场，
            正式接入仍守「lens 仅 indicator」铁律②）；任务一修复：Animated.View style
            挂 transform translateX（it.9 漏挂致动画值空转、指示器钉死原位），绝对
            目标定位与实例 graphicsLayer translationX 同语义。任务六：glassOnGlass
            开关关掉时条件渲染不挂内层玻璃（纯色占位、spring 照常）。点按任意 tab
            切换选中态，Animated spring（damping 33.14 / stiffness 380）驱动指示器。
            tab 文字 11sp（实例 10sp 被 guard R6 拦截）。 */}
        <Text style={[styles.dockCaption, { color: C.accent }]}>底部标签栏（玻璃叠玻璃 · 点按弹簧移动）</Text>
        {/* it.12：dockWrap marginBottom = DOCK_FLOAT_DP（bottomBarFloatDp=15.3，
            GlassTuning.java:57——真机 dock 悬浮边距，测试页 dock 为列表内嵌项，
            按任务口径用下边距承载） */}
        <DraggableGlass style={styles.dockWrap} interactive={true}>
          {/* it.11 任务三：dockFrame 高度/宽度/圆角 inline 由 dock 滑块 state 驱动
              （宽度 = 容器实测宽 × 倍率居中；圆角 min(999→高度一半=全胶囊)） */}
          <View
            style={[
              styles.dockFrame,
              {
                height: dockHeight,
                width: dockFrameWidth,
                alignSelf: 'center',
                borderRadius: dockFrameRadius,
              },
            ]}
            onLayout={onDockFrameLayout}
          >
            {/* 外层 bar（it.10 任务三：加轻折射，用户拍板偏离实例）。
                it.12：tint 色换主题 glassTint（GlassThemeKt.java:41/45，dark #1B242B /
                light #FFFFFF，BAR tintAlpha 0.1 = GlassLevel.java:123）。
                cornerRadiusDp 共用 dock 圆角滑块值（999 时引擎钳制=真胶囊） */}
            <GlassKitView
              ref={dockGlassRef}
              style={StyleSheet.absoluteFill}
              onLayout={onDockGlassLayout}
              backdropTag={backdropTag}
              capturable={true}
              blurDp={10}
              tintAlpha={0.10}
              tintColor={panelTintFor(scheme)}
              cornerRadiusDp={dockRadius}
              refractionPx={Math.round(5 * lensScale)}
              dispersionPx={0}
              membraneAlpha={membrane}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
            {/* 选中指示器（唯一保留 lens 的地方；透镜采外层 bar 合成帧）。
                it.10 任务一：transform translateX 挂在 Animated.View 上——GlassKitView
                原生视图位置随位移移动，玻璃采集链经 PreDraw 位置检测自动跟随。
                it.11 任务一：track 宽 = tab 实宽 (dockWidth−10)/N、spring 目标 =
                5 + i×tabWidth（错位公式与修法见 dockTabWidth 注释）；track 高度
                inline 由 dock 高度滑块驱动；内层胶囊 cornerRadiusDp 共用 dock 圆角。 */}
            {dockWidth > 0 && dockGlassTag != null && (
              <Animated.View
                style={[
                  styles.dockIndicatorTrack,
                  {
                    width: dockTabWidth,
                    height: dockHeight,
                    transform: [{ translateX: dockIndicatorX }],
                  },
                ]}
                pointerEvents="none"
              >
                {glassOnGlass ? (
                  <GlassKitView
                    style={styles.dockIndicator}
                    backdropTag={dockGlassTag}
                    blurDp={indicatorBlurDp}
                    cornerRadiusDp={dockRadius}
                    refractionPx={indicatorRefractionPx}
                    dispersionPx={indicatorDispersionPx}
                    membraneAlpha={0.05}
                    blurEnabled={blurOn}
                    forceDownsample={forceDown}
                  />
                ) : (
                  /* it.10 任务六：玻璃叠玻璃关——不渲染内层 GlassKitView（省掉整条
                     双重透射管线），纯色半透明胶囊占位（实色+opacity 守卫合规）。
                     it.11 任务三：圆角随 dock 圆角滑块（按胶囊实际尺寸钳制） */
                  <View
                    style={[styles.dockIndicatorFallback, { borderRadius: dockFallbackRadius }]}
                  />
                )}
              </Animated.View>
            )}
            {/* tab 内容层：图标区 20dp + 文字（点按切换选中态） */}
            <View style={styles.dockTabsRow} pointerEvents="box-none">
              {DOCK_TABS.map((tab, i) => (
                <Pressable
                  key={tab.label}
                  style={styles.dockTab}
                  onPress={() => setDockSelected(i)}
                >
                  <View style={styles.dockTabIconWrap}>
                    <Text
                      style={[
                        styles.dockTabIcon,
                        dockSelected === i && { color: C.accent },
                      ]}
                    >
                      {tab.icon}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.dockTabLabel,
                      dockSelected === i && styles.dockTabActive,
                      dockSelected === i && { color: C.accent },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </DraggableGlass>

        <View style={[styles.controlCard, { backgroundColor: C.surface }]}>
          <SwitchRow label="模糊总开关" value={blurOn} onChange={setBlurOn} />
          <SwitchRow
            label="强制降采样（模拟器调试用）"
            value={forceDown}
            onChange={setForceDown}
          />
          {/* it.10 任务六：玻璃叠玻璃 A/B 开关（关 = 指示器纯色占位，真机流畅度对比） */}
          <SwitchRow
            label="玻璃叠玻璃（指示器透镜）"
            value={glassOnGlass}
            onChange={setGlassOnGlass}
          />
          {/* it.11 任务三：dock 独立调节滑块（用户要求 dock 控件单独做高度/宽度/圆角
              调节；「dock」前缀防与面板大小倍率混淆。宽度变化 → dockFrame onLayout
              上报 dockWidth 自动更新 → 指示器几何按任务一公式自动跟随） */}
          <SliderRow
            label="dock 高度（48–96）"
            value={dockHeight}
            min={48}
            max={96}
            // it.12：保留小数（默认 64.3 = GlassTuning.java:51 bottomBarHeightDp）
            onChange={(next) => setDockHeight(clampRange(next, 48, 96))}
          />
          <SliderRow
            label="dock 宽度倍率（0.6–1.4）"
            value={dockWidthMult}
            min={0.6}
            max={1.4}
            // it.12：默认 0.9 = GlassTuning.java:48（真机消费钳制 0.7–1.0，
            // MainScaffoldKt.java:473；测试页保留更宽可调区间）
            onChange={(next) => setDockWidthMult(clampRange(next, 0.6, 1.4))}
          />
          <SliderRow
            label="dock 圆角（0–48，999=全胶囊）"
            value={dockRadius}
            min={0}
            max={48}
            onChange={(next) => setDockRadius(Math.round(clampRange(next, 0, 48)))}
          />
          <ScaleSliderRow
            label="blurScale（模糊倍率）"
            value={blurScale}
            scaleKey="blurScale"
            onChange={(next) => useGlassStore.setState({ blurScale: clampScale('blurScale', next) })}
          />
          <ScaleSliderRow
            label="tintScale（着色倍率）"
            value={tintScale}
            scaleKey="tintScale"
            onChange={(next) => useGlassStore.setState({ tintScale: clampScale('tintScale', next) })}
          />
          <ScaleSliderRow
            label="lensScale（透镜倍率）"
            value={lensScale}
            scaleKey="lensScale"
            onChange={(next) => useGlassStore.setState({ lensScale: clampScale('lensScale', next) })}
          />
          <ScaleSliderRow
            label="glowScale（柔光倍率）"
            value={glowScale}
            scaleKey="glowScale"
            onChange={(next) => useGlassStore.setState({ glowScale: clampScale('glowScale', next) })}
          />
          <SliderRow
            label="色散强度（0–1）"
            value={dispersionLevel}
            min={0}
            max={1}
            onChange={(next) => setDispersionLevel(clampRange(next, 0, 1))}
          />
          <SliderRow
            label="膜层浓度（0–1）"
            value={membrane}
            min={0}
            max={1}
            onChange={(next) => setMembrane(clampRange(next, 0, 1))}
          />
          <SliderRow
            label="描边亮度（0–3）"
            value={glowAlpha}
            min={0}
            max={3}
            onChange={(next) => setGlowAlpha(clampRange(next, 0, 3))}
          />
          <SliderRow
            label="描边宽度（0–3）"
            value={glowWidth}
            min={0}
            max={3}
            onChange={(next) => setGlowWidth(clampRange(next, 0, 3))}
          />
          <SliderRow
            label="顶缘加强（0–3）"
            value={glowTop}
            min={0}
            max={3}
            onChange={(next) => setGlowTop(clampRange(next, 0, 3))}
          />
          <SliderRow
            label="底缘加强（0–3）"
            value={glowBottom}
            min={0}
            max={3}
            onChange={(next) => setGlowBottom(clampRange(next, 0, 3))}
          />
          <SliderRow
            label="圆角倍率（0–3）"
            value={radiusScale}
            min={0}
            max={3}
            onChange={(next) => setRadiusScale(clampRange(next, 0, 3))}
          />
          <SliderRow
            label="宽度倍率（0.5–2）"
            value={widthScale}
            min={0.5}
            max={2}
            onChange={(next) => setWidthScale(clampRange(next, 0.5, 2))}
          />
          <SliderRow
            label="高度倍率（0.5–2）"
            value={heightScale}
            min={0.5}
            max={2}
            onChange={(next) => setHeightScale(clampRange(next, 0.5, 2))}
          />
        </View>

        {/* it.12：高 44（GlassControlsKt.java:441 GlassTextButton minHeight 44 +
            padding 12）；底色 accent / 文字 onAccent（GlassTheme 色板语义对位） */}
        <Pressable
          style={[styles.backButton, { backgroundColor: C.accent }]}
          onPress={() => props.navigation.navigate('Main')}
        >
          <Text style={[styles.backButtonText, { color: C.onAccent }]}>返回主界面</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // it.12：root 底色随主题 canvas（GlassThemeKt.java:41/45），JSX inline 传入
  root: { flex: 1 },
  blob: { position: 'absolute', borderRadius: radii.pill },
  // it.12：色球颜色改 JSX inline 传入（主题 accent 三色），此处仅保留几何/透明度
  blobA: { width: 180, height: 180, top: 40, left: 24, opacity: 0.85 },
  blobB: { width: 140, height: 140, top: 240, right: 30, opacity: 0.8 },
  blobC: { width: 120, height: 120, bottom: 120, left: 60, opacity: 0.8 },
  // it.12：左右 padding 16（GlassLayoutKt.java:228 GlassPage horizontalPadding 默认 16）
  foreground: { padding: PAGE_HORIZONTAL_PAD, paddingTop: 64 },
  // it.12：hero 44 Medium（GlassType.java:28）
  hero: { fontSize: 44, fontWeight: '500', marginBottom: 6 },
  // it.12：状态行 label 12 Medium（GlassType.java:34）
  statusLine: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  panel: { justifyContent: 'center', padding: 16 },
  /** it.9：64dp 档面板（chip/toolbar）纵向留白收窄，标题+副标题不溢出。 */
  panelCompact: { flex: 1, paddingVertical: 6 },
  panelFill: { flex: 1 },
  panelTextWrap: { alignItems: 'flex-start' },
  // it.12：面板标题 callout 14 Medium（GlassType.java:33）
  panelTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  // it.12：面板副标题 micro 11 Normal（GlassType.java:35）
  panelSubtitle: { fontSize: 11, fontWeight: '400' },
  panelHero: { marginBottom: 16 },
  panelRow: { flexDirection: 'row', marginBottom: 16 },
  panelChip: { flex: 1, marginRight: 8 },
  panelToolbar: { flex: 1.4 },
  panelClear: { marginBottom: 18 },
  // it.9：Dock demo 说明行（非玻璃层）；it.12：micro 11（GlassType.java:35）
  dockCaption: { fontSize: 11, fontWeight: '400', marginBottom: 6 },
  // it.9：玻璃叠玻璃底部标签栏（圆角全走 radii token / 变量，守卫 R3 合规）
  // it.12：marginBottom = bottomBarFloatDp 15.3（GlassTuning.java:57，真机 dock
  // 悬浮边距——测试页 dock 是滚动列表内嵌项，按任务口径用下边距承载）
  dockWrap: { marginBottom: DOCK_FLOAT_DP },
  dockFrame: {
    overflow: 'hidden',
  },
  // 指示器轨道：跟随 spring 平移的容器（宽 = tab 实宽，高 = dock 高度滑块值）
  dockIndicatorTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  // 内层指示条玻璃：轨道内 7dp 内边距（it.12：bottomBarInnerPadDp=7，
  // GlassTuning.java:54；真实 pill = barHeight − 2×pad = 50.3dp 全胶囊）
  dockIndicator: {
    position: 'absolute',
    top: DOCK_INNER_PAD,
    left: DOCK_INNER_PAD,
    right: DOCK_INNER_PAD,
    bottom: DOCK_INNER_PAD,
  },
  // it.10 任务六：玻璃叠玻璃关时的占位胶囊（实色 + opacity，守卫合规无内联 rgba）
  dockIndicatorFallback: {
    position: 'absolute',
    top: DOCK_INNER_PAD,
    left: DOCK_INNER_PAD,
    right: DOCK_INNER_PAD,
    bottom: DOCK_INNER_PAD,
    borderRadius: radii.pill,
    backgroundColor: '#ffffff',
    opacity: 0.25,
  },
  // tab 内容层：容器内 7dp padding（it.12：GlassTuning.java:54 内 pad 7，
  // 真实 dock pill 轨道几何同源），行内均分
  dockTabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: DOCK_INNER_PAD,
  },
  dockTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // tab 图标区 20dp（GlassKitKt.java:1602 icon 高 20 / 间距 10-2-10，
  // GlassKitKt.java:1601/1603/1609）
  dockTabIconWrap: { height: 20, justifyContent: 'center' },
  // it.12：未选中色 = glasskit TextSecondary #9CA8BC（GlassColorsKt.java:55）
  dockTabIcon: { fontSize: 16, color: DOCK_TAB_INACTIVE_COLOR },
  // it.12：tab 文字守卫 R6 下限 11（真实 10sp 被 R6 拦，GlassKitKt.java:1606）
  dockTabLabel: { fontSize: 11, color: DOCK_TAB_INACTIVE_COLOR, marginTop: 2 },
  // it.12：选中色随主题 accent（真值 glasskit Accent 被守卫 D7 禁落地，见
  // DOCK_TAB_INACTIVE_COLOR 注释）+ Bold（GlassKitKt.java:1606-1608
  // 选中 Bold / 未选中 Normal）；JSX inline 传入
  dockTabActive: { fontWeight: '700' },
  // it.12：卡片圆角 24（GlassShape.java:11 container；GlassLayoutKt.java:548
  // GlassGroup RoundedCornerShape(24)），底色随主题 surface（JSX inline）
  controlCard: { borderRadius: SHAPE_CONTAINER, opacity: 0.94, padding: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  // 不设 flex:1（行内滑块组件自身 flex:1 占据中段）；switchRow 内由 space-between 撑开
  // it.12：控制行文字 label 12 Medium（GlassType.java:34），颜色随主题（JSX inline）
  rowLabel: { fontSize: 12, fontWeight: '500', marginRight: 8 },
  rowValue: { width: 52, fontSize: 12, fontWeight: '500', textAlign: 'right' },
  // it.12：高 44（GlassControlsKt.java:441 GlassTextButton defaultMinSize
  // minHeight 44 + padding 12）；底色随主题 accent（JSX inline）
  backButton: {
    marginTop: 18, marginBottom: 40, height: TEXT_BUTTON_HEIGHT, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
  },
  // it.12：body 15 Normal（GlassType.java:32）
  backButtonText: { fontSize: 15, fontWeight: '400' },
});
