/**
 * GlassTestScreen —— GlassKit 原生引擎验证页（玻璃迭代 it.17）。
 *
 * it.17（可调参数提升为全局 store，实验页与 App 本体共用一套参数）：
 * ① 本页原先的 22 个本地 useState（3 顶部开关 / 3 三开关 / 6 几何 / 7 扩展调试 /
 *    1 高光 / 1 dock 选中态）全量迁入 `src/theme/glassDockStore.ts`，本页改为
 *    读 / 写 store ⇒ 拖滑块时 App 本体 `AppTabBar` 实时联动（用户 2026-11-08：
 *    「三个都要」「可调节，就和实验页一样啊，同步统一调节的」）。
 * ② 滑块顺序 / 标签 / 区间 / 两位小数 / 折叠区结构一律不动；区间**数值**改为引用
 *    store 的 `DOCK_RANGES`（与原先字面量逐项同值，只换唯一来源，防两处漂移）。
 * ③ 四倍率（模糊 / 折射 / 膜层 / glowScale）仍在 `glass.ts` 的 useGlassStore，
 *    本页经 `useGlassScales()` / `setGlassScale()` 消费（订阅在 .ts，守卫 S3 不计数）。
 * ④ dock 段的玻璃 props 与 `AppTabBar` 保持同一套派生逻辑：tintAlpha 走
 *    `resolveTintAlpha(TINT_ALPHA_BASE, tintScale)` 且显式 `tintScale={1}`（避免
 *    原生再乘一次），并补 glowScale / glowAlphaScale / glowWidthScale /
 *    glowBottomScale ⇒「实验页所见 = 本体所得」。
 *
 * it.14（底栏 Continuous Capsule + 指示器单独提亮）：
 * ① P0-1 底栏 / 指示器 / 顶栏演示件传 capsuleContinuous={true}：真胶囊
 *    r=min(w,h)/2 一字不动，引擎把本帧超椭圆指数局部覆盖为 n=3（2<3<4），
 *    clipPath 与 AGSL SDF 同 n → 端帽呈 G2 连续曲率，仍是胶囊（几何 / 滑动
 *    目标 x 零影响）。RN dockFrame 去掉 overflow（圆弧父 clip 会先裁掉超椭圆
 *    外扩角部），track 最大右边界 dockWidth−dockInnerPad < dockWidth 不露馅。
 *    hero / chip / 工具条 / clear 不开启，n≈4 逐位零回归。GPU 模糊链
 *    （HardwareRenderer / ImageReader / BitmapShader）完全不动。
 * ② P0-2 指示器传 indicatorBoostAlpha={0.05}：对齐 Kotlin
 *    GlassKitKt.java:1434-1435,1451 → GlassSurfaceKt.java:704-708 的第二笔
 *    White@0.05 rect（③tint 阶段末尾、高光之前）；Kotlin 无对应滑块 ⇒ 硬编码，
 *    不加滑块 / 开关 / 内联 rgba / fallback 分支。
 * ③ P1 指示器 highlightScale={0}：INDICATOR highlight=false
 *    （GlassLevel.java:37 / GlassSurfaceKt.java:710）⇒ 不画 18dp 顶缘渐变。
 *    chromaticEnabled / vibrancyEnabled 三开关有意保留全局联动（Kotlin
 *    INDICATOR 真值 chromatic=true / vibrancy=false，见指示器处注释），
 *    不硬编码，避免破坏 it.13 已验收的全局开关联动。
 *
 * it.13（SwiftUI 标准连续曲率圆角 + 滑块数值完全对齐 HealthCheckIn）：
 * ① 连续曲率（引擎侧，方案 B：Path + AGSL SDF 统一超椭圆）：
 *    - 组件形状分配（测试页 props 层）：dock bar / dock 指示器用
 *      cornerRadiusDp=999（默认 dockRadius=999，真胶囊）→ it.13 引擎 n=2 硬守卫
 *      改走精确 Kyant0 Bezier 连续曲率端帽（it.15 方案 A）；chip /
 *      工具条 / hero / clear 用 SHAPE_CONTAINER=24（GlassShape.java:11 container）
 *      → 连续曲率 n≈4（G2）；顶栏演示件亦为真胶囊。GPU 模糊链
 *      （HardwareRenderer / ImageReader / BitmapShader）完全不动，本页不直接
 *      参与几何计算，只负责把 cornerRadiusDp 送进引擎。
 *    - 契约红线：H1 tint≤0.24（it.19 P0-5 由 0.12 提到原版同值）、canBlur≥31/canLens≥33、绘制顺序
 *      ①采集→②模糊/透镜→③tint→④膜层→⑤压暗→⑥高光、圆角钳 min(w,h)/2。
 * ② 滑块数值完全对齐（SettingsScreenKt.java:1898-2128 / GlassTuning.java:21-57）：
 *    Q1「膜层」= tintScale 0–2/2.0（不是 membraneAlpha）；Q5 Kotlin 无对应的
 *    9 个滑块保留但移入「扩展调试（非对齐项）」折叠区；Q6 顶栏宽/高两滑块
 *    新增「顶栏演示件」（GlassPanel + backdropTag，宽=屏宽×scale、高=heightDp）。
 *    10 个对齐滑块 + 3 个开关逐字照抄 Kotlin 标签，数值连续无 steps、两位小数。
 * ③ 三开关（默认全 true）：色散（整层画三遍）/ 景深 / 鲜活度，走引擎新 prop；
 *    顶缘高光 0–1/0.2 驱动 highlightScale（18dp 竖向渐变，GlassSurfaceKt.java:710-713）。
 * ④ 膜层语义：删除「膜层浓度」滑块，native membraneAlpha 默认 0.38→0，白膜
 *    层引擎代码保留但默认不画；it.19 P0-5 口径：测试页透传 tintAlpha 基准
 *    TINT_ALPHA_BASE(0.10)，0.10 × tintScale(2.0) = 0.20 ≤ 0.24 上界
 *    （native coerceIn(0,0.24)、0.24 常量，floor 取整口径不变）。颜色继续随主题
 *    panelTintFor(scheme) 亮 #FFFFFF / 暗 #1B242B（GlassThemeKt.java:41/45）。
 * ⑤ Q3 指示器折射：保留现状——指示器仍随 lensScale（「折射」滑块）变化，
 *    **不**按 Kotlin lockedRefraction=0.8 锁死（GlassLevel.java:37）。理由：
 *    it.10 用户明确要求「指示器受滑块调节」，锁死 = 回退已修功能；此处为
 *    有意偏离并登记出处。
 *
 * it.12（组件几何全面对齐，保留）：色板（GlassThemeKt.java:41/45）、dock
 * 64.3/7/0.9/15.3（GlassTuning.java:48-57）、弹簧 spring(0.85,380)→RN 33.14/
 * 380 与按压缩放 spring(0.62,200)→RN 17.54/200（SolidControlsKt.java:478）、
 * 圆角 container 24 / sheet 28（GlassShape.java）、字号（GlassType.java:28-35）、
 * 页面 padding 16（GlassLayoutKt.java:228）、dock tab 内容（GlassKitKt.java:1601-1609）。
 * it.11：指示器几何错位修正（track 宽 = (dockWidth−2×内缩)/N、spring 目标
 * 内缩 + i×tabWidth）、dock 独立高度/宽度/圆角滑块。
 * it.10：指示器 transform 挂弹簧、接全局滑块、bar 加折射、玻璃叠玻璃 A/B 开关。
 * it.9：GPU 全分辨率模糊 / 闪烁修复 / 玻璃叠玻璃 demo / 四倍率工作台。
 *
 * 用途：验证 GlassKitBackdrop（采集源）+ GlassKitView（玻璃面板）链路、四倍率
 * 实时调参联动、连续曲率角部无彩边/锯齿、三开关 A/B。
 *
 * ⚠️ 本页为临时验证页：路由经 GLASS_TEST_FIRST 临时首屏开关进入
 * （navigation/index.tsx），验证完成后改回 false 即恢复原首屏，本页路由保留。
 *
 * 守卫合规：无内联 rgba 背景（实色 + opacity）、圆角全走 radii token / 变量、
 * 字号 ≥11、无 BlurView、无玻璃 API 在内容层组件内直接调用。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  findNodeHandle,
  PanResponder,
  PixelRatio,
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
import { canBlur, canLens, resolveTintAlpha, SCALE_RANGES, TINT_ALPHA_BASE } from '../theme/glass';
import { GLASS_LENS_PROFILE } from '../theme/glassProfile';
import GlassKitRimView from '../native/GlassKitRimView';
import {
  DOCK_RANGES,
  setGlassScale,
  useDockSettings,
  useGlassScales,
} from '../theme/glassDockStore';
import { radii } from '../theme/radii';

/** 临时首屏开关 companion：见 src/navigation/index.tsx 顶部同名常量（同一布尔口径）。 */
export const GLASS_TEST_ROUTE = 'GlassTest';

/** 版本号：app.json version（随每次迭代 bump，构建期注入原生 manifest 同步改）。 */
const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

/** it.12 色板：HealthCheckIn GlassTheme 反编译实证（GlassThemeKt.java:41 light /
 *  :45 dark；带 alpha 的项为 RN #RRGGBBAA 序）。dark = isSystemInDarkTheme
 *  （MainActivity.java:73）→ RN useColorScheme 同口径。 */
const THEME_COLORS = {
  light: {
    canvas: '#F2F5F7',
    surface: '#FFFFFF',
    contentPrimary: '#17212B',
    contentSecondary: '#17212B99',
    contentTertiary: '#17212B66',
    accent: '#185FA5',
    accentSecondary: '#0F6E56',
    accentTertiary: '#993C1D',
    up: '#B3261E',
    down: '#0F6E56',
    glassTint: '#FFFFFF',
    onAccent: '#FFFFFF',
  },
  dark: {
    canvas: '#10161B',
    surface: '#1B242B',
    contentPrimary: '#E8EEF2',
    contentSecondary: '#E8EEF299',
    contentTertiary: '#E8EEF266',
    accent: '#8AB4E8',
    accentSecondary: '#6FD3B4',
    accentTertiary: '#E0A187',
    up: '#FFA9A2',
    down: '#6FD3B4',
    glassTint: '#1B242B',
    onAccent: '#10161B',
  },
} as const;

type GlassScheme = keyof typeof THEME_COLORS;

/** it.12 dock tab 未选中色：glasskit TextSecondary #9CA8BC（GlassColorsKt.java:55）；
 *  选中色按主题语义对位 GlassTheme accent（真值 glasskit Accent 被守卫 D7 禁落地）。 */
const DOCK_TAB_INACTIVE_COLOR = '#9CA8BC';

/** 圆角 / 页面几何（反编译实证；变量形式传 borderRadius 以过守卫 R3）。 */
const SHAPE_CONTAINER = 24; // GlassShape.java:11 container=24
/** it.12 sheet 圆角（GlassShape.java:12 sheet=28）：测试页无 sheet 演示件，仅登记。 */
export const SHAPE_SHEET = 28;
const PAGE_HORIZONTAL_PAD = 16; // GlassLayoutKt.java:228 GlassPage horizontalPadding
const TEXT_BUTTON_HEIGHT = 44; // GlassControlsKt.java:441 minHeight 44

/** it.13 对齐项区间与默认值（SettingsScreenKt.java:1905-2128 / GlassTuning.java:21-57）。 */
const BLUR_MIN = 0.2;
const BLUR_MAX = 3.0;
const LENS_MIN = 0;
const LENS_MAX = 3;
const TINT_MIN = 0;
const TINT_MAX = 2;
/**
 * it.17：区间**数值**的唯一来源改为 `glassDockStore.DOCK_RANGES`（与 it.16 的字面量
 * 逐项同值，滑块区间一字未变）；默认值不再在本文件出现，由 store 初值提供
 * （store 初值又逐项引用 glassProfile.ts）。MIN/MAX 仍以常量形式传给滑块，
 * 保持 JSX 可读性与守卫 R3 口径不变。
 */
const HIGHLIGHT_MIN = DOCK_RANGES.highlightScale.min;
const HIGHLIGHT_MAX = DOCK_RANGES.highlightScale.max;
const TOP_BAR_WIDTH_MIN = DOCK_RANGES.topBarWidthScale.min;
const TOP_BAR_WIDTH_MAX = DOCK_RANGES.topBarWidthScale.max;
const TOP_BAR_HEIGHT_MIN = DOCK_RANGES.topBarHeightDp.min;
const TOP_BAR_HEIGHT_MAX = DOCK_RANGES.topBarHeightDp.max;
const DOCK_WIDTH_MIN = DOCK_RANGES.dockWidthScale.min;
const DOCK_WIDTH_MAX = DOCK_RANGES.dockWidthScale.max;
const DOCK_HEIGHT_MIN = DOCK_RANGES.dockHeightDp.min;
const DOCK_HEIGHT_MAX = DOCK_RANGES.dockHeightDp.max;
const DOCK_INNER_PAD_MIN = DOCK_RANGES.dockInnerPadDp.min;
const DOCK_INNER_PAD_MAX = DOCK_RANGES.dockInnerPadDp.max;
const DOCK_FLOAT_DP_MIN = DOCK_RANGES.dockFloatDp.min;
const DOCK_FLOAT_DP_MAX = DOCK_RANGES.dockFloatDp.max;

/** it.9 tint 色（旧架构 Paper 桥接对 customType="Color" 自动 processColor，必须传原始
 *  字符串，禁止调用方预 processColor；真机 logcat + 像素取证实证）。 */
function panelTintFor(scheme: GlassScheme): string {
  return THEME_COLORS[scheme].glassTint;
}

/** it.9 色散强度换算（扩展调试项）：dispersionPx = 值 × 20。 */
const DISPERSION_PX_PER_UNIT = 20;

/** it.9 Dock tab 集（demo 无图标资源：emoji 色块模拟实例 Image 图标区）。 */
const DOCK_TABS = [
  { icon: '⌂', label: '首页' },
  { icon: '✉', label: '消息' },
  { icon: '＋', label: '发布' },
  { icon: '⚙', label: '我的' },
] as const;

/** it.9 指示器弹簧：spring(0.85, 380) → RN damping 0.85×2×√380 ≈ 33.14。 */
const DOCK_SPRING = { stiffness: 380, damping: 33.14, mass: 1 } as const;

/** it.12 按压缩放弹簧：solidPress spring(0.62, 200) → RN damping ≈ 17.54。 */
const PRESS_SPRING = { stiffness: 200, damping: 17.54, mass: 1 } as const;

/** 滑块值统一夹取 + 两位小数（避免拖动中浮点尾巴引发文本抖动；Kotlin 无 steps）。 */
function clampRange(next: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, next)).toFixed(2));
}

function clampScale(key: keyof typeof SCALE_RANGES, next: number): number {
  const range = SCALE_RANGES[key];
  return clampRange(next, range.min, range.max);
}

/** 通用滑块行：label 左 / 滑块中(flex) / 数值右（两位小数）。 */
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

/** 四倍率专用滑块行：区间取自 SCALE_RANGES，onChange 走 store 钳制。 */
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

/** 开关行：label 左 / Switch 右。 */
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
 * 可拖动容器（便于观察模糊/折射）；interactive=true 时让位子组件手势（dock 点按）。
 * it.12：按压缩放走 solidPress spring(0.62, 200)。
 */
function DraggableGlass(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  onLayout?: (evt: { nativeEvent: { layout: { width: number; height: number } } }) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const gestureRef = useRef({ baseX: 0, baseY: 0, originX: 0, originY: 0 });
  const pressScale = useRef(new Animated.Value(1)).current;
  const panResponder = useRef(
    PanResponder.create({
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
        Animated.spring(pressScale, { toValue: 1, ...PRESS_SPRING, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pressScale, { toValue: 1, ...PRESS_SPRING, useNativeDriver: true }).start();
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

/**
 * 玻璃面板容器：GlassKitView（功能层叶子）+ 叠加说明文字。
 * it.19 P0-5 口径：测试页透传 tintAlpha 基准 TINT_ALPHA_BASE(0.10)
 * （0.10×tintScale(2.0)=0.20 ≤ 0.24 上界，native coerceIn(0,0.24)）；
 * membraneAlpha 不传（native 默认 0，白膜层默认不画）；新增四效果
 * prop；glowTopScale 固定 1（glow 双带降为扩展调试，顶缘改由 highlightScale 承担）。
 */
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
  membraneAlpha?: number;
  /** it.14：仅顶栏演示件传 true（Continuous Capsule）；其余面板默认 false 零回归。 */
  capsuleContinuous?: boolean;
  glowAlphaScale?: number;
  glowWidthScale?: number;
  glowBottomScale?: number;
  highlightScale: number;
  chromaticEnabled: boolean;
  depthEffect: boolean;
  vibrancyEnabled: boolean;
  blurEnabled: boolean;
  forceDownsample: boolean;
  /**
   * it.19 P0-1 轮廓光：默认 false ⇒ 其余面板零回归。
   * 本轮只给 Hero 开一个 demo（验证 45° 方向调制对不对就够），
   * dock bar / 指示器的接线留到 2076027 inset 那笔一起做。
   */
  rimEnabled?: boolean;
}) {
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  return (
    <View style={[styles.panel, props.style]}>
      <GlassKitView
        style={StyleSheet.absoluteFill}
        backdropTag={props.backdropTag}
        blurDp={props.blurDp}
        tintAlpha={TINT_ALPHA_BASE}
        tintColor={panelTintFor(scheme)}
        cornerRadiusDp={props.cornerRadiusDp}
        refractionPx={props.refractionPx}
        dispersionPx={props.dispersionPx}
        dimmingAlpha={props.dimmingAlpha}
        membraneAlpha={props.membraneAlpha}
        capsuleContinuous={props.capsuleContinuous ?? false}
        glowAlphaScale={props.glowAlphaScale}
        glowWidthScale={props.glowWidthScale}
        glowTopScale={1}
        glowBottomScale={props.glowBottomScale}
        highlightScale={props.highlightScale}
        chromaticEnabled={props.chromaticEnabled}
        depthEffect={props.depthEffect}
        vibrancyEnabled={props.vibrancyEnabled}
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
      {/*
        it.19 P0-1 轮廓光：**必须是最后一个子节点** —— 原版 HighlightNode 在内容之后
        绘制（盖住图标 / 文字），RN 同层后绘者在上，放前面就会被文字压住。
        与玻璃同圆角、同胶囊开关，absoluteFill + pointerEvents="none" 不吃触摸。
        本轮只有 Hero 开（rimEnabled），其余面板不传 ⇒ 零回归。
      */}
      {props.rimEnabled ? (
        <GlassKitRimView
          cornerRadiusDp={props.cornerRadiusDp}
          capsuleContinuous={props.capsuleContinuous ?? false}
        />
      ) : null}
    </View>
  );
}

export default function GlassTestScreen(props: { navigation: { navigate: (route: string) => void } }) {
  const scheme: GlassScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = THEME_COLORS[scheme];
  const backdropRef = useRef(null);
  const [backdropTag, setBackdropTag] = useState<number | undefined>(undefined);

  /**
   * it.17：22 项可调参数全部来自全局 store（`glassDockStore`），与 App 本体
   * `AppTabBar` 共用同一份运行时状态 ⇒「实验页拖滑块 = 本体底栏同步变」。
   * 本页不再持有任何参数 useState；折叠区开合属本页 UI 局部状态，留在本地。
   *
   * 别名说明（避免改动下方 JSX 与滑块文案）：blurOn / forceDown / dockWidthMult /
   * dockHeight / dockInnerPad / dockRadius 都是 store 字段的本地别名，取值口径与 it.16
   * 完全一致，只是「真相源」从 useState 换成 store。
   */
  const [debugExpanded, setDebugExpanded] = useState(false);
  const {
    blurEnabled: blurOn,
    forceDownsample: forceDown,
    glassOnGlass,
    chromaticEnabled,
    depthEffect,
    vibrancyEnabled,
    topBarWidthScale,
    topBarHeightDp,
    dockWidthScale: dockWidthMult,
    dockHeightDp: dockHeight,
    dockInnerPadDp: dockInnerPad,
    dockFloatDp,
    dockRadiusDp: dockRadius,
    dispersionLevel,
    glowAlpha,
    glowWidth,
    glowBottom,
    radiusScale,
    widthScale,
    heightScale,
    highlightScale,
    dockSelected,
    setNumber,
    setBoolean,
    setDockSelected,
  } = useDockSettings();

  // it.9 Dock：容器宽（指示器 translationX 由弹簧驱动）+ bar 采集源 tag
  const [dockWidth, setDockWidth] = useState(0);
  const dockIndicatorX = useRef(new Animated.Value(0)).current;
  const dockGlassRef = useRef(null);
  const [dockGlassTag, setDockGlassTag] = useState<number | undefined>(undefined);

  // 四倍率（仍在 glass.ts 的 useGlassStore；订阅出口收敛在 .ts，守卫 S3 不计数）
  const { blurScale, tintScale, lensScale, glowScale } = useGlassScales();

  const onBackdropLayout = useCallback(() => {
    const handle = findNodeHandle(backdropRef.current);
    if (handle != null) setBackdropTag(handle);
  }, []);

  const onDockGlassLayout = useCallback(() => {
    const handle = findNodeHandle(dockGlassRef.current);
    if (handle != null) setDockGlassTag(handle);
  }, []);

  const onDockFrameLayout = useCallback((evt: { nativeEvent: { layout: { width: number } } }) => {
    setDockWidth(evt.nativeEvent.layout.width);
  }, []);

  // it.11 指示器几何对齐 tab：track 宽 = (dockWidth − 2×内缩)/N、spring 目标 =
  // 内缩 + i×tabWidth，胶囊 inset = 内缩 → 中心严格重合。
  // it.13：内缩由常量改为「底栏内缩 dp」滑块 state（默认 7）。
  const dockTabWidth =
    dockWidth > 0 ? (dockWidth - dockInnerPad * 2) / DOCK_TABS.length : 0;

  useEffect(() => {
    if (dockTabWidth <= 0) return;
    Animated.spring(dockIndicatorX, {
      toValue: dockInnerPad + dockSelected * dockTabWidth,
      ...DOCK_SPRING,
      useNativeDriver: true,
    }).start();
  }, [dockSelected, dockTabWidth, dockInnerPad, dockIndicatorX]);

  const panelDispersionPx = Math.round(dispersionLevel * DISPERSION_PX_PER_UNIT);
  /**
   * it.19 量纲修正（dp → px）：JS 只做 `dp × PixelRatio.get()`，
   * lensScale 由 native 统一乘一次（GlassKitView.drawLensLayer）。
   * 修正前这里写的是 `round(8 × lensScale)` 而 native 又乘一次 ⇒ 实际 = 8 × lensScale²，
   * 默认 lensScale=3 / density=3 时恰好等于原版 72px，但滑块响应非线性、且与 density 无关。
   * 基准值统一来自 glassProfile.GLASS_LENS_PROFILE（与 AppTabBar 同一份）。
   */
  // ⚠️ 透镜 px 不取整（2.1333dp × 3 = 6.3999，round 成 6 会丢 1.2px @ ×lensScale）
  const density = PixelRatio.get();
  const barRefractionPx = GLASS_LENS_PROFILE.barRefractionDp * density;
  const barLensBandPx = GLASS_LENS_PROFILE.barBandDp * density;
  const indicatorRefractionPx = GLASS_LENS_PROFILE.indicatorRefractionDp * density;
  const indicatorLensBandPx = GLASS_LENS_PROFILE.indicatorBandDp * density;
  const indicatorDispersionPx =
    GLASS_LENS_PROFILE.indicatorDispersionDp *
    density *
    (dispersionLevel / GLASS_LENS_PROFILE.dispersionLevelBase);
  const indicatorBlurDp = Math.round(2 * blurScale);
  // Q3：指示器仍随全局 lensScale 变化，不按 GlassLevel.java:37 的
  // INDICATOR lockedRefraction=0.8f 锁死（it.10 用户要求「指示器受滑块调节」）。
  // it.17：dock bar 的 tint 与 AppTabBar 同一口径 —— resolveTintAlpha 是 glass.ts 的
  // H1 唯一出口（0.10 × tintScale，≤0.24）；原生最终 alpha = min(tintAlpha × tintScale,
  // 0.24)，若再传 store 的 tintScale 会二次乘算，故显式传 tintScale={1}。
  const dockBarTintAlpha = resolveTintAlpha(TINT_ALPHA_BASE, tintScale);

  // it.8：chip/toolbar 行宽缩放（对同乘 widthScale 是 no-op，改缩放整行宽度）。
  const winWidth = useWindowDimensions().width;
  const panelRowMargin = Math.max(-20, ((winWidth - 40) * (1 - widthScale)) / 2);

  // it.12：dockFrame 宽 = 屏宽 × 宽度倍率（GlassTuning.java:48，
  // MainScaffoldKt.java:473 coerceIn(0.7,1.0)）。it.13：内缩 / 留白亦由滑块驱动。
  const dockFrameWidth = Math.round(winWidth * dockWidthMult);
  const dockFrameRadius = Math.min(dockRadius, dockHeight / 2);
  const dockFallbackRadius = Math.max(
    0,
    Math.min(dockRadius, (dockHeight - dockInnerPad * 2) / 2),
  );
  // 顶栏演示件（Q6）：宽 = 屏宽 × 顶栏宽度倍率，高 = 顶栏高度 dp。
  const topBarDemoWidth = Math.round(winWidth * topBarWidthScale);

  /** it.13 所有面板共用的效果 / 调试 props（避免逐面板重复透传）。 */
  const effectProps = {
    glowAlphaScale: glowAlpha,
    glowWidthScale: glowWidth,
    glowBottomScale: glowBottom,
    highlightScale,
    chromaticEnabled,
    depthEffect,
    vibrancyEnabled,
    blurEnabled: blurOn,
    forceDownsample: forceDown,
  };

  const apiLevel = Platform.OS === 'android' ? Number(Platform.Version) : -1;

  return (
    <View style={[styles.root, { backgroundColor: C.canvas }]}>
      {/* 内容层：被玻璃采集的彩色背景（GlassKitBackdrop 原生注册） */}
      <GlassKitBackdrop ref={backdropRef} style={StyleSheet.absoluteFill} onLayout={onBackdropLayout}>
        <LinearGradient colors={['#1b2735', '#7b4397', '#2cd8d5']} style={StyleSheet.absoluteFill} />
        <View style={[styles.blob, styles.blobA, { backgroundColor: C.accent }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: C.accentSecondary }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: C.accentTertiary }]} />
      </GlassKitBackdrop>

      <ScrollView contentContainerStyle={styles.foreground}>
        <Text style={[styles.hero, { color: C.contentPrimary }]}>玻璃引擎测试</Text>
        <Text style={[styles.statusLine, { color: C.contentSecondary }]}>
          {`${APP_VERSION}-it.19 · API ${apiLevel} · canBlur=${canBlur()} · canLens=${canLens()} · blur=${blurOn}`}
        </Text>
        <Text style={[styles.statusLine, { color: C.contentSecondary }]}>
          {`采样路径：${forceDown ? '强制降采样（模拟器用）' : 'GPU 全分辨率高斯（真机）'} · 连续曲率 · 面板可拖动`}
        </Text>

        {/* hero：圆角 24（GlassShape.container）→ 连续曲率 n≈4 */}
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
            subtitle="blurDp 14 · 圆角24(连续曲率) · 轮廓光"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={14}
            cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
            refractionPx={10}
            dispersionPx={panelDispersionPx}
            rimEnabled
            {...effectProps}
          />
        </DraggableGlass>

        {/* it.14 顶栏演示件（Q6）：宽 = 屏宽 × 顶栏宽度 ×屏、高 = 顶栏高度 dp，
            真胶囊 cornerRadiusDp=999 + capsuleContinuous={true} → 与 dock 同为
            Continuous Capsule（n=3 端帽）；r 仍 = min(w,h)/2，几何不变。 */}
        <DraggableGlass
          style={[
            styles.topBarDemoWrap,
            { width: topBarDemoWidth, height: topBarHeightDp, alignSelf: 'center' },
          ]}
        >
          <GlassPanel
            title="顶栏演示件"
            subtitle={`${topBarWidthScale.toFixed(2)}×屏 · ${topBarHeightDp.toFixed(2)}dp · 真胶囊`}
            style={styles.panelCompact}
            backdropTag={backdropTag}
            blurDp={10}
            cornerRadiusDp={999}
            capsuleContinuous={true}
            refractionPx={10}
            dispersionPx={panelDispersionPx}
            {...effectProps}
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
              cornerRadiusDp={Math.round(SHAPE_CONTAINER * radiusScale)}
              refractionPx={10}
              dispersionPx={panelDispersionPx}
              {...effectProps}
            />
          </DraggableGlass>
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
              {...effectProps}
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
            {...effectProps}
          />
        </DraggableGlass>

        {/* 底部标签栏（玻璃叠玻璃 · 点按弹簧移动）：bar 与指示器 cornerRadiusDp
            共用 dock 圆角滑块（默认 999 真胶囊）。it.14 两者均开启
            capsuleContinuous={true} → Continuous Capsule（n=3 端帽，仍是胶囊）。 */}
        <Text style={[styles.dockCaption, { color: C.accent }]}>底部标签栏（玻璃叠玻璃 · 点按弹簧移动）</Text>
        <DraggableGlass style={[styles.dockWrap, { marginBottom: dockFloatDp }]} interactive={true}>
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
            <GlassKitView
              ref={dockGlassRef}
              style={StyleSheet.absoluteFill}
              onLayout={onDockGlassLayout}
              backdropTag={backdropTag}
              capturable={true}
              blurDp={10}
              blurScale={blurScale}
              tintAlpha={dockBarTintAlpha}
              tintScale={1}
              tintColor={panelTintFor(scheme)}
              cornerRadiusDp={dockRadius}
              capsuleContinuous={true}
              refractionPx={barRefractionPx}
              lensBandPx={barLensBandPx}
              dispersionPx={0}
              highlightScale={highlightScale}
              glowScale={glowScale}
              glowAlphaScale={glowAlpha}
              glowWidthScale={glowWidth}
              glowBottomScale={glowBottom}
              chromaticEnabled={chromaticEnabled}
              depthEffect={depthEffect}
              vibrancyEnabled={vibrancyEnabled}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
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
                {/*
                 * it.14 指示器分级对齐（Kotlin GlassLevel.INDICATOR，GlassLevel.java:37）：
                 * ① P0-1 capsuleContinuous={true}：与 dock bar 同为 Continuous Capsule（n=3 端帽）；
                 * ② P0-2 indicatorBoostAlpha={0.05}：White@0.05 专属提亮
                 *    （GlassKitKt.java:1434-1435,1451 → GlassSurfaceKt.java:704-708），
                 *    Kotlin 无对应滑块（SettingsScreenKt.java:1898-2128）⇒ 硬编码常量，
                 *    不加滑块 / 开关 / 内联 rgba / fallback 分支；
                 * ③ P1 highlightScale={0}：INDICATOR highlight=false
                 *    （GlassLevel.java:37 / GlassSurfaceKt.java:710）⇒ 不画 18dp 顶缘渐变。
                 * Kotlin INDICATOR 真值登记：chromatic=true / vibrancy=false（GlassLevel.java:37）
                 * ——此处「有意不」硬编码这两个开关：用户 it.13 刚验收三开关全局联动，
                 * 且长期偏好「全局滑块统一控制，不为每个组件单独配置」，硬编码会破坏该功能
                 * ⇒ chromaticEnabled / depthEffect / vibrancyEnabled 三开关保持全局联动。
                 */}
                {glassOnGlass ? (
                  <GlassKitView
                    style={[
                      styles.dockIndicator,
                      {
                        top: dockInnerPad,
                        left: dockInnerPad,
                        right: dockInnerPad,
                        bottom: dockInnerPad,
                      },
                    ]}
                    backdropTag={dockGlassTag}
                    blurDp={indicatorBlurDp}
                    cornerRadiusDp={dockRadius}
                    capsuleContinuous={true}
                    indicatorBoostAlpha={0.05}
                    refractionPx={indicatorRefractionPx}
                    lensBandPx={indicatorLensBandPx}
                    dispersionPx={indicatorDispersionPx}
                    highlightScale={0}
                    chromaticEnabled={chromaticEnabled}
                    depthEffect={depthEffect}
                    vibrancyEnabled={vibrancyEnabled}
                    blurEnabled={blurOn}
                    forceDownsample={forceDown}
                  />
                ) : (
                  <View
                    style={[
                      styles.dockIndicatorFallback,
                      {
                        top: dockInnerPad,
                        left: dockInnerPad,
                        right: dockInnerPad,
                        bottom: dockInnerPad,
                        borderRadius: dockFallbackRadius,
                      },
                    ]}
                  />
                )}
              </Animated.View>
            )}
            <View style={[styles.dockTabsRow, { padding: dockInnerPad }]} pointerEvents="box-none">
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
          {/* 三个原调试开关保留原位不动（it.17：值与写入全部走 store） */}
          <SwitchRow
            label="模糊总开关"
            value={blurOn}
            onChange={(next) => setBoolean('blurEnabled', next)}
          />
          <SwitchRow
            label="强制降采样（模拟器调试用）"
            value={forceDown}
            onChange={(next) => setBoolean('forceDownsample', next)}
          />
          <SwitchRow
            label="玻璃叠玻璃（指示器透镜）"
            value={glassOnGlass}
            onChange={(next) => setBoolean('glassOnGlass', next)}
          />

          {/* it.13 对齐项：顺序 / 标签 / 区间 / 默认值逐字照抄
              SettingsScreenKt.java:1905-2128 + GlassTuning.java:21-57
              it.17：值来自 store、写入经 setNumber / setGlassScale（store 内再钳一次） */}
          <Text style={[styles.groupCaption, { color: C.accent }]}>
            HealthCheckIn 对齐项（10 滑块 + 3 开关）
          </Text>
          <ScaleSliderRow
            label="模糊"
            value={blurScale}
            scaleKey="blurScale"
            onChange={(next) => setGlassScale('blurScale', clampScale('blurScale', next))}
          />
          <ScaleSliderRow
            label="折射"
            value={lensScale}
            scaleKey="lensScale"
            onChange={(next) => setGlassScale('lensScale', clampScale('lensScale', next))}
          />
          <ScaleSliderRow
            label="膜层"
            value={tintScale}
            scaleKey="tintScale"
            onChange={(next) => setGlassScale('tintScale', clampScale('tintScale', next))}
          />
          <SliderRow
            label="顶缘高光"
            value={highlightScale}
            min={HIGHLIGHT_MIN}
            max={HIGHLIGHT_MAX}
            onChange={(next) =>
              setNumber('highlightScale', clampRange(next, HIGHLIGHT_MIN, HIGHLIGHT_MAX))
            }
          />
          <SwitchRow
            label="色散（整层画三遍）"
            value={chromaticEnabled}
            onChange={(next) => setBoolean('chromaticEnabled', next)}
          />
          <SwitchRow
            label="景深"
            value={depthEffect}
            onChange={(next) => setBoolean('depthEffect', next)}
          />
          <SwitchRow
            label="鲜活度"
            value={vibrancyEnabled}
            onChange={(next) => setBoolean('vibrancyEnabled', next)}
          />
          <SliderRow
            label="顶栏宽度 ×屏"
            value={topBarWidthScale}
            min={TOP_BAR_WIDTH_MIN}
            max={TOP_BAR_WIDTH_MAX}
            onChange={(next) =>
              setNumber('topBarWidthScale', clampRange(next, TOP_BAR_WIDTH_MIN, TOP_BAR_WIDTH_MAX))
            }
          />
          <SliderRow
            label="顶栏高度 dp"
            value={topBarHeightDp}
            min={TOP_BAR_HEIGHT_MIN}
            max={TOP_BAR_HEIGHT_MAX}
            onChange={(next) =>
              setNumber('topBarHeightDp', clampRange(next, TOP_BAR_HEIGHT_MIN, TOP_BAR_HEIGHT_MAX))
            }
          />
          <SliderRow
            label="底栏宽度 ×屏"
            value={dockWidthMult}
            min={DOCK_WIDTH_MIN}
            max={DOCK_WIDTH_MAX}
            onChange={(next) =>
              setNumber('dockWidthScale', clampRange(next, DOCK_WIDTH_MIN, DOCK_WIDTH_MAX))
            }
          />
          <SliderRow
            label="底栏高度 dp"
            value={dockHeight}
            min={DOCK_HEIGHT_MIN}
            max={DOCK_HEIGHT_MAX}
            onChange={(next) =>
              setNumber('dockHeightDp', clampRange(next, DOCK_HEIGHT_MIN, DOCK_HEIGHT_MAX))
            }
          />
          <SliderRow
            label="底栏内缩 dp"
            value={dockInnerPad}
            min={DOCK_INNER_PAD_MIN}
            max={DOCK_INNER_PAD_MAX}
            onChange={(next) =>
              setNumber('dockInnerPadDp', clampRange(next, DOCK_INNER_PAD_MIN, DOCK_INNER_PAD_MAX))
            }
          />
          <SliderRow
            label="底栏留白 dp"
            value={dockFloatDp}
            min={DOCK_FLOAT_DP_MIN}
            max={DOCK_FLOAT_DP_MAX}
            onChange={(next) =>
              setNumber('dockFloatDp', clampRange(next, DOCK_FLOAT_DP_MIN, DOCK_FLOAT_DP_MAX))
            }
          />

          {/* it.13 Q5：Kotlin 无对应的 9 个调试滑块移入可折叠「扩展调试」区 */}
          <Pressable onPress={() => setDebugExpanded(!debugExpanded)}>
            <Text style={[styles.debugHeader, { color: C.accent }]}>
              {`${debugExpanded ? '▾' : '▸'} 扩展调试（非对齐项）`}
            </Text>
          </Pressable>
          <Text style={[styles.debugNote, { color: C.contentSecondary }]}>
            Kotlin 无对应的调试参数：dock 圆角 / 柔光倍率 / 色散强度 / 描边亮度 /
            描边宽度 / 底缘加强 / 圆角倍率 / 宽度倍率 / 高度倍率
          </Text>
          {debugExpanded && (
            <View>
              <SliderRow
                label="dock 圆角（0–48，999=全胶囊）"
                value={dockRadius}
                min={DOCK_RANGES.dockRadiusDp.min}
                max={DOCK_RANGES.dockRadiusDp.max}
                onChange={(next) =>
                  setNumber(
                    'dockRadiusDp',
                    Math.round(
                      clampRange(next, DOCK_RANGES.dockRadiusDp.min, DOCK_RANGES.dockRadiusDp.max),
                    ),
                  )
                }
              />
              <ScaleSliderRow
                label="glowScale（柔光倍率）"
                value={glowScale}
                scaleKey="glowScale"
                onChange={(next) => setGlassScale('glowScale', clampScale('glowScale', next))}
              />
              <SliderRow
                label="色散强度（0–1）"
                value={dispersionLevel}
                min={DOCK_RANGES.dispersionLevel.min}
                max={DOCK_RANGES.dispersionLevel.max}
                onChange={(next) =>
                  setNumber(
                    'dispersionLevel',
                    clampRange(next, DOCK_RANGES.dispersionLevel.min, DOCK_RANGES.dispersionLevel.max),
                  )
                }
              />
              <SliderRow
                label="描边亮度（0–3）"
                value={glowAlpha}
                min={DOCK_RANGES.glowAlpha.min}
                max={DOCK_RANGES.glowAlpha.max}
                onChange={(next) =>
                  setNumber('glowAlpha', clampRange(next, DOCK_RANGES.glowAlpha.min, DOCK_RANGES.glowAlpha.max))
                }
              />
              <SliderRow
                label="描边宽度（0–3）"
                value={glowWidth}
                min={DOCK_RANGES.glowWidth.min}
                max={DOCK_RANGES.glowWidth.max}
                onChange={(next) =>
                  setNumber('glowWidth', clampRange(next, DOCK_RANGES.glowWidth.min, DOCK_RANGES.glowWidth.max))
                }
              />
              <SliderRow
                label="底缘加强（0–3）"
                value={glowBottom}
                min={DOCK_RANGES.glowBottom.min}
                max={DOCK_RANGES.glowBottom.max}
                onChange={(next) =>
                  setNumber(
                    'glowBottom',
                    clampRange(next, DOCK_RANGES.glowBottom.min, DOCK_RANGES.glowBottom.max),
                  )
                }
              />
              <SliderRow
                label="圆角倍率（0–3）"
                value={radiusScale}
                min={DOCK_RANGES.radiusScale.min}
                max={DOCK_RANGES.radiusScale.max}
                onChange={(next) =>
                  setNumber(
                    'radiusScale',
                    clampRange(next, DOCK_RANGES.radiusScale.min, DOCK_RANGES.radiusScale.max),
                  )
                }
              />
              <SliderRow
                label="宽度倍率（0.5–2）"
                value={widthScale}
                min={DOCK_RANGES.widthScale.min}
                max={DOCK_RANGES.widthScale.max}
                onChange={(next) =>
                  setNumber(
                    'widthScale',
                    clampRange(next, DOCK_RANGES.widthScale.min, DOCK_RANGES.widthScale.max),
                  )
                }
              />
              <SliderRow
                label="高度倍率（0.5–2）"
                value={heightScale}
                min={DOCK_RANGES.heightScale.min}
                max={DOCK_RANGES.heightScale.max}
                onChange={(next) =>
                  setNumber(
                    'heightScale',
                    clampRange(next, DOCK_RANGES.heightScale.min, DOCK_RANGES.heightScale.max),
                  )
                }
              />
            </View>
          )}
        </View>

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
  root: { flex: 1 },
  blob: { position: 'absolute', borderRadius: radii.pill },
  blobA: { width: 180, height: 180, top: 40, left: 24, opacity: 0.85 },
  blobB: { width: 140, height: 140, top: 240, right: 30, opacity: 0.8 },
  blobC: { width: 120, height: 120, bottom: 120, left: 60, opacity: 0.8 },
  foreground: { padding: PAGE_HORIZONTAL_PAD, paddingTop: 64 },
  hero: { fontSize: 44, fontWeight: '500', marginBottom: 6 },
  statusLine: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  panel: { justifyContent: 'center', padding: 16 },
  panelCompact: { flex: 1, paddingVertical: 6 },
  panelFill: { flex: 1 },
  panelTextWrap: { alignItems: 'flex-start' },
  panelTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  panelSubtitle: { fontSize: 11, fontWeight: '400' },
  panelHero: { marginBottom: 16 },
  // it.13 顶栏演示件（Q6）：尺寸由 JSX inline 驱动
  topBarDemoWrap: { marginBottom: 16 },
  panelRow: { flexDirection: 'row', marginBottom: 16 },
  panelChip: { flex: 1, marginRight: 8 },
  panelToolbar: { flex: 1.4 },
  panelClear: { marginBottom: 18 },
  dockCaption: { fontSize: 11, fontWeight: '400', marginBottom: 6 },
  // it.13：marginBottom 由「底栏留白 dp」滑块 inline 驱动
  dockWrap: {},
  // it.14 P0-1 必要伴生改动：去掉 overflow，RN 父 View 的圆弧 clip 会先裁掉
  // n=3 超椭圆角部的外扩部分（it14-spec C7）；track 最大右边界 =
  // dockWidth−dockInnerPad < dockWidth，去掉后不会露出界外内容。
  // borderRadius 由 JSX inline（dockFrameRadius）传入，此处不再放任何裁剪样式。
  dockFrame: {},
  dockIndicatorTrack: { position: 'absolute', top: 0, left: 0 },
  // it.13：top/left/right/bottom 由「底栏内缩 dp」滑块 inline 驱动
  dockIndicator: { position: 'absolute' },
  dockIndicatorFallback: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    opacity: 0.25,
  },
  // it.13：padding 由「底栏内缩 dp」滑块 inline 驱动
  dockTabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  dockTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dockTabIconWrap: { height: 20, justifyContent: 'center' },
  dockTabIcon: { fontSize: 16, color: DOCK_TAB_INACTIVE_COLOR },
  dockTabLabel: { fontSize: 11, color: DOCK_TAB_INACTIVE_COLOR, marginTop: 2 },
  dockTabActive: { fontWeight: '700' },
  controlCard: { borderRadius: SHAPE_CONTAINER, opacity: 0.94, padding: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  rowLabel: { fontSize: 12, fontWeight: '500', marginRight: 8 },
  rowValue: { width: 52, fontSize: 12, fontWeight: '500', textAlign: 'right' },
  // it.13 分组标题 / 折叠区（字号 12 / 11，守卫 R6 合规）
  groupCaption: { fontSize: 12, fontWeight: '500', marginTop: 12, marginBottom: 2 },
  debugHeader: { fontSize: 12, fontWeight: '500', marginTop: 14 },
  debugNote: { fontSize: 11, fontWeight: '400', marginTop: 2, marginBottom: 4 },
  backButton: {
    marginTop: 18, marginBottom: 40, height: TEXT_BUTTON_HEIGHT, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
  },
  backButtonText: { fontSize: 15, fontWeight: '400' },
});
