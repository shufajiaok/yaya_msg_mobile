/**
 * GlassTestScreen —— GlassKit 原生引擎验证页（玻璃迭代 it.9）。
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
import { typography } from '../theme/typography';

/** 临时首屏开关 companion：见 src/navigation/index.tsx 顶部同名常量（同一布尔口径）。 */
export const GLASS_TEST_ROUTE = 'GlassTest';

/** 版本号：app.json version（随每次迭代 bump，构建期注入原生 manifest 同步改）。 */
const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

/** tint 色值（Bug 修复：旧架构 Paper 桥接对 customType="Color" 的 prop 会在 JS 渲染器
 *  里自动执行一次 processColor（getNativeComponentAttributes 的 validAttributes，
 *  case 'Color': return processColor）。若 JS 侧再传 processColor 后的数字会被
 *  **二次 processColor**：normalizeColor(负数 ColorInt) 返回 null → prop 被整帧丢弃
 *  → 原生 tintColor 恒为 0，tint 层永不渲染（真机 logcat + 像素取证实证）。
 *  所以旧架构下必须传**原始字符串**，让桥接层做唯一一次 processColor。 */
const PANEL_TINT = '#DCE6FF';

/** it.9 色散强度换算：dispersionPx = 值 × 20（0.35→7px，与原 hero 6px 量级衔接）。 */
const DISPERSION_PX_PER_UNIT = 20;

/** it.9 Dock tab 集（demo 无图标资源：emoji 色块模拟实例 Image 图标区）。 */
const DOCK_TABS = [
  { icon: '⌂', label: '首页' },
  { icon: '✉', label: '消息' },
  { icon: '＋', label: '发布' },
  { icon: '⚙', label: '我的' },
] as const;

/** it.9 指示器弹簧参数换算：实例 spring(dampingRatio=0.85, stiffness=380)。
 *  RN Animated.spring 无 dampingRatio：damping = dampingRatio × 2 × √(stiffness×mass)
 *  = 0.85 × 2 × √380 ≈ 33.14（mass=1）。 */
const DOCK_SPRING = { stiffness: 380, damping: 33.14, mass: 1 } as const;

/** 滑块值统一夹取 + 两位小数（避免拖动中浮点尾巴引发文本抖动）。 */
function clampRange(next: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, next)).toFixed(2));
}

function clampScale(key: keyof typeof SCALE_RANGES, next: number): number {
  const range = SCALE_RANGES[key];
  return clampRange(next, range.min, range.max);
}

/** 通用滑块行：label 左 / 滑块中(flex) / 数值右。 */
function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <GlassSlider value={props.value} min={props.min} max={props.max} onChange={props.onChange} />
      <Text style={styles.rowValue}>{props.value.toFixed(2)}</Text>
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

/** 开关行：label 左 / Switch 右。 */
function SwitchRow(props: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.rowLabel}>{props.label}</Text>
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
          ...DOCK_SPRING,
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
          stiffness: 300,
          damping: 18,
          mass: 1,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pressScale, {
          toValue: 1,
          stiffness: 300,
          damping: 18,
          mass: 1,
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
      {...panResponder.panHandlers}
    >
      {props.children}
    </Animated.View>
  );
}

/** 玻璃面板容器：GlassKitView（功能层叶子）+ 叠加说明文字。 */
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
  return (
    <View style={[styles.panel, props.style]}>
      <GlassKitView
        style={StyleSheet.absoluteFill}
        backdropTag={props.backdropTag}
        blurDp={props.blurDp}
        tintAlpha={0.10}
        tintColor={PANEL_TINT}
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
        <Text style={[styles.panelTitle, { fontSize: props.refractionPx ? 17 : 15 }]}>
          {props.title}
        </Text>
        <Text style={styles.panelSubtitle}>{props.subtitle}</Text>
      </View>
    </View>
  );
}

export default function GlassTestScreen(props: { navigation: { navigate: (route: string) => void } }) {
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
  // it.9 Dock：选中 tab + 容器宽（指示器 translationX = index × 宽/N）+ 弹簧驱动值
  const [dockSelected, setDockSelected] = useState(0);
  const [dockWidth, setDockWidth] = useState(0);
  const dockIndicatorX = useRef(new Animated.Value(0)).current;
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

  // it.9 Dock：点按/宽度变化 → spring 驱动指示器 translationX（点按移动效果）
  useEffect(() => {
    if (dockWidth <= 0) return;
    Animated.spring(dockIndicatorX, {
      toValue: dockSelected * (dockWidth / DOCK_TABS.length),
      ...DOCK_SPRING,
      useNativeDriver: true,
    }).start();
  }, [dockSelected, dockWidth, dockIndicatorX]);

  // it.9：色散 px 换算（滑块值 × 20，作用于所有开透镜的面板；指示器固定 8/10 走实例）
  const panelDispersionPx = Math.round(dispersionLevel * DISPERSION_PX_PER_UNIT);

  // it.8：chip/toolbar 行宽缩放。设计说明：行内两面板 flex:1 / flex:1.4（flexBasis 0
  // + flexGrow 按比例分配），对两者乘同一 widthScale 是数学上的 no-op（比例项相约，
  // 行宽不变）——故改为缩放整行宽度：行基准宽 = 屏宽 − 40（foreground 左右 padding），
  // 目标宽 = 基准 × widthScale → marginHorizontal = (基准 − 目标)/2。负 margin 下限
  // −20（吃满内容层 padding 即屏宽封顶）：行永不换行、永不溢出屏幕，相对比例 1:1.4
  // 恒保持；widthScale > 屏宽上限后行宽封顶不再变化（hero/clear 全宽面板不受限）。
  const winWidth = useWindowDimensions().width;
  const panelRowMargin = Math.max(-20, ((winWidth - 40) * (1 - widthScale)) / 2);

  const apiLevel = Platform.OS === 'android' ? Number(Platform.Version) : -1;

  return (
    <View style={styles.root}>
      {/* 内容层：被玻璃采集的彩色背景（GlassKitBackdrop 原生注册） */}
      <GlassKitBackdrop ref={backdropRef} style={StyleSheet.absoluteFill} onLayout={onBackdropLayout}>
        <LinearGradient colors={['#1b2735', '#7b4397', '#2cd8d5']} style={StyleSheet.absoluteFill} />
        <View style={[styles.blob, styles.blobA]} />
        <View style={[styles.blob, styles.blobB]} />
        <View style={[styles.blob, styles.blobC]} />
      </GlassKitBackdrop>

      {/* 前景层：标题 + 可拖动玻璃面板 + 调参 + 返回 */}
      <ScrollView contentContainerStyle={styles.foreground}>
        <Text style={styles.hero}>玻璃引擎测试</Text>
        <Text style={styles.statusLine}>
          {`${APP_VERSION}-it.9 · API ${apiLevel} · canBlur=${canBlur()} · canLens=${canLens()} · blur=${blurOn}`}
        </Text>
        <Text style={styles.statusLine}>
          {`采样路径：${forceDown ? '强制降采样（模拟器用）' : 'GPU 全分辨率高斯（真机）'} · 面板可拖动`}
        </Text>

        {/* it.9 对齐实例：Hero → GlassTopBar 圆角 22 档（高度保留 120dp 演示尺寸） */}
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
            subtitle="blurDp 14 · 圆角22(GlassTopBar档) · 可拖动"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={14}
            cornerRadiusDp={Math.round(radii.toolbar * radiusScale)}
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
              subtitle="blurDp 8 · 全胶囊 · 按压缩放0.94"
              style={styles.panelCompact}
              backdropTag={backdropTag}
              blurDp={8}
              cornerRadiusDp={Math.round(radii.pill * radiusScale)}
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
          {/* it.9 对齐实例：工具条 → GlassDetailBar（64dp / Capsule / blur 12） */}
          <DraggableGlass style={[styles.panelToolbar, { height: Math.round(64 * heightScale) }]}>
            <GlassPanel
              title="工具条"
              subtitle="blurDp 12 · GlassDetailBar 64dp·Capsule"
              style={styles.panelCompact}
              backdropTag={backdropTag}
              blurDp={12}
              cornerRadiusDp={Math.round(radii.pill * radiusScale)}
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
            subtitle="blurDp 10 · dimming 0.35 · 折射+色散"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={10}
            cornerRadiusDp={Math.round(radii.xl * radiusScale)}
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

        {/* it.9：底部标签栏完整还原（GlassKit.kt GlassBottomTabs）。
            外层 bar：64dp 全胶囊（blur 10 / tint 走 store / 无透镜——实例 bar 仅
            blur+vibrancy+tint），capturable=true 注册为采集源；内层 54dp 胶囊
            指示器：lens refractionPx 8 / dispersionPx 10（实例指示器规格），backdropTag
            指向外层 handle——采集到的是「已被外层模糊+tint 过一次」的合成帧，
            再叠一层透镜 = 玻璃叠玻璃链路（透镜仅限本页验证场，正式接入仍守
            「lens 仅 indicator」铁律②）。点按任意 tab 切换选中态，Animated spring
            （dampingRatio 0.85 / stiffness 380，换算 damping 33.14）驱动指示器
            translationX 到选中位。tab 文字 11sp（实例 10sp 被 guard R6 拦截）。 */}
        <Text style={styles.dockCaption}>底部标签栏（玻璃叠玻璃 · 点按弹簧移动）</Text>
        <DraggableGlass style={styles.dockWrap} interactive={true}>
          <View style={styles.dockFrame} onLayout={onDockFrameLayout}>
            {/* 外层 bar（无透镜，对齐实例 GlassBottomTabs 的 Row） */}
            <GlassKitView
              ref={dockGlassRef}
              style={StyleSheet.absoluteFill}
              onLayout={onDockGlassLayout}
              backdropTag={backdropTag}
              capturable={true}
              blurDp={10}
              tintAlpha={0.10}
              tintColor={PANEL_TINT}
              cornerRadiusDp={radii.pill}
              refractionPx={0}
              dispersionPx={0}
              membraneAlpha={membrane}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
            {/* 选中指示器（唯一保留 lens 的地方；透镜采外层 bar 合成帧） */}
            {dockWidth > 0 && dockGlassTag != null && (
              <Animated.View
                style={[styles.dockIndicatorTrack, { width: dockWidth / DOCK_TABS.length }]}
                pointerEvents="none"
              >
                <GlassKitView
                  style={styles.dockIndicator}
                  backdropTag={dockGlassTag}
                  blurDp={0}
                  cornerRadiusDp={radii.pill}
                  refractionPx={8}
                  dispersionPx={10}
                  membraneAlpha={0.05}
                  blurEnabled={blurOn}
                  forceDownsample={forceDown}
                />
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
                    <Text style={[styles.dockTabIcon, dockSelected === i && styles.dockTabActive]}>
                      {tab.icon}
                    </Text>
                  </View>
                  <Text style={[styles.dockTabLabel, dockSelected === i && styles.dockTabActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </DraggableGlass>

        <View style={styles.controlCard}>
          <SwitchRow label="模糊总开关" value={blurOn} onChange={setBlurOn} />
          <SwitchRow
            label="强制降采样（模拟器调试用）"
            value={forceDown}
            onChange={setForceDown}
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

        <Pressable style={styles.backButton} onPress={() => props.navigation.navigate('Main')}>
          <Text style={styles.backButtonText}>返回主界面</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101418' },
  blob: { position: 'absolute', borderRadius: radii.pill },
  blobA: { width: 180, height: 180, top: 40, left: 24, backgroundColor: '#ff6f91', opacity: 0.85 },
  blobB: { width: 140, height: 140, top: 240, right: 30, backgroundColor: '#58a6ff', opacity: 0.8 },
  blobC: { width: 120, height: 120, bottom: 120, left: 60, backgroundColor: '#ffd166', opacity: 0.8 },
  foreground: { padding: 20, paddingTop: 64 },
  hero: { ...typography.hero, color: '#ffffff', marginBottom: 6 },
  statusLine: { fontSize: 12, color: '#d7dde6', marginBottom: 6 },
  panel: { justifyContent: 'center', padding: 16 },
  /** it.9：64dp 档面板（chip/toolbar）纵向留白收窄，标题+副标题不溢出。 */
  panelCompact: { flex: 1, paddingVertical: 6 },
  panelFill: { flex: 1 },
  panelTextWrap: { alignItems: 'flex-start' },
  panelTitle: { fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  panelSubtitle: { fontSize: 11, color: '#e6ebf2' },
  panelHero: { marginBottom: 16 },
  panelRow: { flexDirection: 'row', marginBottom: 16 },
  panelChip: { flex: 1, marginRight: 8 },
  panelToolbar: { flex: 1.4 },
  panelClear: { marginBottom: 18 },
  // it.9：Dock demo 说明行（非玻璃层）
  dockCaption: { fontSize: 11, color: '#8fd3ff', marginBottom: 6 },
  // it.9：玻璃叠玻璃底部标签栏（圆角全走 radii token，守卫 R3 合规）
  dockWrap: { marginBottom: 18 },
  dockFrame: {
    height: 64,
    borderRadius: radii.capsule,
    overflow: 'hidden',
  },
  // 指示器轨道：跟随 spring 平移的容器（宽 = 容器宽 / tab 数，高同 bar）
  dockIndicatorTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 64,
  },
  // 内层指示条玻璃：轨道内 5dp 内边距（实例 padding(5)）→ 54dp 高全胶囊
  dockIndicator: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
  },
  // tab 内容层：容器内 5dp padding（实例 Row padding(5)），行内均分
  dockTabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: 5,
  },
  dockTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockTabIconWrap: { height: 20, justifyContent: 'center' },
  dockTabIcon: { fontSize: 16, color: '#e6ebf2' },
  dockTabLabel: { fontSize: 11, color: '#e6ebf2', marginTop: 2 },
  // 选中高亮：白色加粗（实例 Accent 色加深的 demo 等效物）
  dockTabActive: { color: '#ffffff', fontWeight: '700' },
  controlCard: { borderRadius: radii.lg, backgroundColor: '#1a2027', opacity: 0.94, padding: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  // 不设 flex:1（行内滑块组件自身 flex:1 占据中段）；switchRow 内由 space-between 撑开
  rowLabel: { fontSize: 13, color: '#e6ebf2', marginRight: 8 },
  rowValue: { width: 52, fontSize: 13, color: '#8fd3ff', textAlign: 'right' },
  backButton: {
    marginTop: 18, marginBottom: 40, height: 48, borderRadius: radii.md,
    backgroundColor: '#2a323c', alignItems: 'center', justifyContent: 'center',
  },
  backButtonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
