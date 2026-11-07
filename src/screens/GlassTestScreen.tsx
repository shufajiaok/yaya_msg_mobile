/**
 * GlassTestScreen —— GlassKit 原生引擎验证页（玻璃迭代 it.6）。
 *
 * it.5：胶囊圆角修复（引擎侧 cornerRadiusPx 钳到 min(w,h)/2，radii.pill=999 不再
 * 令 SDF 全形外输出透明）+ 四倍率默认值固化（blur 0.10 / tint 1.00 / lens 2.00 /
 * glow 1.75，persist v0→v1 迁移一次性覆盖旧散存值），状态行 it.5。
 *
 * it.4：透镜输入真模糊化（原生侧固定 1/4 降采样 + BlurMaskFilter 软件高斯，
 * 废弃 it.3「降采样+双线性放大」近似——该近似产出锯齿而非高斯），状态行 it.4。
 *
 * it.3 行为归一（历史）：四块玻璃面板统一传 refractionPx/dispersionPx（透镜全开），
 * 配合引擎侧「模糊与透镜协同」，四面板对 blur/lens/tint/glow 四根滑块全部
 * 有可见响应——消除 it.2「hero 与其他控件两种行为模式」的问题。
 *
 * 用途：
 * - 验证 GlassKitBackdrop（采集源）+ GlassKitView（玻璃面板）链路是否真实出效果；
 * - 验证 glass.ts 四倍率（blur/tint/lens/glow）实时调参 → 原生渲染联动
 *  （glowScale 自本轮迭代起进引擎，作用于边缘高光宽/alpha）；
 * - 真机调参工作台（用户指令「开始迭代」）：
 *   · 四块玻璃面板全部**可拖动**（PanResponder，拖到色球/文字上便于观察模糊与折射）；
 *   · 圆角倍率 / 面板大小倍率实时滑块；
 *   · 模糊路径开关（真机默认 RenderEffect 真高斯；模拟器 GPU 缺陷时开「强制降采样」）；
 *   · 版本号显示（expo-constants 读 app.json version，随迭代 bump）。
 *
 * 结构：
 * - GlassKitBackdrop（absoluteFill）：彩色渐变 + 色块（被玻璃采集的内容层）；
 * - 前景层：标题/状态行、4 块可拖动玻璃面板（hero / chip / toolbar / clear+压暗）、
 *   控制卡（总开关 + 路径开关 + 六行滑块）、返回主界面按钮。
 *
 * ⚠️ 本页为临时验证页：路由经 GLASS_TEST_FIRST 临时首屏开关进入（navigation/index.tsx），
 * 验证完成后改回 false 即恢复原首屏，本页路由保留可随时再进。
 *
 * 守卫合规：无内联 rgba 背景（用实色 + opacity）、圆角全走 radii token、字号 ≥11、
 * 无 BlurView、无玻璃 API 在内容层组件内直接调用（面板仅作为功能层叶子挂载）。
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  findNodeHandle,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
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
 */
function DraggableGlass(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const gestureRef = useRef({ baseX: 0, baseY: 0, originX: 0, originY: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        gestureRef.current = {
          baseX: offsetRef.current.x,
          baseY: offsetRef.current.y,
          originX: evt.nativeEvent.pageX,
          originY: evt.nativeEvent.pageY,
        };
      },
      onPanResponderMove: (evt) => {
        const g = gestureRef.current;
        const next = {
          x: g.baseX + (evt.nativeEvent.pageX - g.originX),
          y: g.baseY + (evt.nativeEvent.pageY - g.originY),
        };
        offsetRef.current = next;
        setOffset(next);
      },
    }),
  ).current;
  return (
    <View
      style={[
        props.style,
        { transform: [{ translateX: offset.x }, { translateY: offset.y }] },
      ]}
      {...panResponder.panHandlers}
    >
      {props.children}
    </View>
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
  const [sizeScale, setSizeScale] = useState(1);
  // it.6 柔光细化四参数（本地调参态，不进持久化 store——与圆角/大小倍率同模式）
  const [glowAlpha, setGlowAlpha] = useState(1);
  const [glowWidth, setGlowWidth] = useState(1);
  const [glowTop, setGlowTop] = useState(1);
  const [glowBottom, setGlowBottom] = useState(1);

  const blurScale = useGlassStore((state) => state.blurScale);
  const tintScale = useGlassStore((state) => state.tintScale);
  const lensScale = useGlassStore((state) => state.lensScale);
  const glowScale = useGlassStore((state) => state.glowScale);

  const onBackdropLayout = useCallback(() => {
    const handle = findNodeHandle(backdropRef.current);
    if (handle != null) setBackdropTag(handle);
  }, []);

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
          {`${APP_VERSION}-it.6 · API ${apiLevel} · canBlur=${canBlur()} · canLens=${canLens()} · blur=${blurOn}`}
        </Text>
        <Text style={styles.statusLine}>
          {`采样路径：${forceDown ? '强制降采样（模拟器用）' : 'RenderEffect 真高斯'} · 面板可拖动`}
        </Text>

        <DraggableGlass style={[styles.panelHero, { height: Math.round(120 * sizeScale) }]}>
          <GlassPanel
            title="Hero 大面板"
            subtitle="blurDp 14 · 折射+色散 · 可拖动"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={14}
            cornerRadiusDp={Math.round(radii.hero * radiusScale)}
            refractionPx={10}
            dispersionPx={6}
            glowAlphaScale={glowAlpha}
            glowWidthScale={glowWidth}
            glowTopScale={glowTop}
            glowBottomScale={glowBottom}
            blurEnabled={blurOn}
            forceDownsample={forceDown}
          />
        </DraggableGlass>
        <View style={styles.panelRow}>
          <DraggableGlass style={[styles.panelChip, { height: Math.round(72 * sizeScale) }]}>
            <GlassPanel
              title="Chip 胶囊"
              subtitle="blurDp 8 · 折射+色散 · 可拖动"
              style={styles.panelFill}
              backdropTag={backdropTag}
              blurDp={8}
              cornerRadiusDp={Math.round(radii.pill * radiusScale)}
              refractionPx={10}
              dispersionPx={6}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
          </DraggableGlass>
          <DraggableGlass style={[styles.panelToolbar, { height: Math.round(72 * sizeScale) }]}>
            <GlassPanel
              title="工具条"
              subtitle="blurDp 12 · 折射+色散 · 可拖动"
              style={styles.panelFill}
              backdropTag={backdropTag}
              blurDp={12}
              cornerRadiusDp={Math.round(22 * radiusScale)}
              refractionPx={10}
              dispersionPx={6}
              blurEnabled={blurOn}
              forceDownsample={forceDown}
            />
          </DraggableGlass>
        </View>
        <DraggableGlass style={[styles.panelClear, { height: Math.round(88 * sizeScale) }]}>
          <GlassPanel
            title="clear + 压暗"
            subtitle="blurDp 10 · dimming 0.35 · 折射+色散"
            style={styles.panelFill}
            backdropTag={backdropTag}
            blurDp={10}
            cornerRadiusDp={Math.round(radii.xl * radiusScale)}
            refractionPx={10}
            dispersionPx={6}
            dimmingAlpha={0.35}
            glowAlphaScale={glowAlpha}
            glowWidthScale={glowWidth}
            glowTopScale={glowTop}
            glowBottomScale={glowBottom}
            blurEnabled={blurOn}
            forceDownsample={forceDown}
          />
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
            label="面板大小（0.5–2）"
            value={sizeScale}
            min={0.5}
            max={2}
            onChange={(next) => setSizeScale(clampRange(next, 0.5, 2))}
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
  panelFill: { flex: 1 },
  panelTextWrap: { alignItems: 'flex-start' },
  panelTitle: { fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  panelSubtitle: { fontSize: 11, color: '#e6ebf2' },
  panelHero: { marginBottom: 16 },
  panelRow: { flexDirection: 'row', marginBottom: 16 },
  panelChip: { flex: 1, marginRight: 8 },
  panelToolbar: { flex: 1.4 },
  panelClear: { marginBottom: 18 },
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
