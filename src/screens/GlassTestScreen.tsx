/**
 * GlassTestScreen —— GlassKit 原生引擎验证页（用户指令：先开一个玻璃测试页保证能用）。
 *
 * 用途：
 * - 验证 GlassKitBackdrop（采集源）+ GlassKitView（玻璃面板）链路是否真实出效果；
 * - 验证 glass.ts 四倍率（blur/tint/lens/glow）实时调参 → 原生渲染联动；
 * - 展示 H2 双档降级现状（canBlur/canLens + Platform.Version）。
 *
 * 结构：
 * - GlassKitBackdrop（absoluteFill）：彩色渐变 + 色块（被玻璃采集的内容层）；
 * - 前景层：标题、4 块不同参数玻璃面板（hero / chip / toolbar / clear+压暗）、
 *   四倍率步进控制（±0.1，按 SCALE_RANGES 夹取）、返回主界面按钮。
 *
 * ⚠️ 本页为临时验证页：路由经 GLASS_TEST_FIRST 临时首屏开关进入（navigation/index.tsx），
 * 验证完成后改回 false 即恢复原首屏，本页路由保留可随时再进。
 *
 * 守卫合规：无内联 rgba 背景（用实色 + opacity）、圆角全走 radii token、字号 ≥11、
 * 无 BlurView、无玻璃 API 在内容层组件内直接调用（面板仅作为功能层叶子挂载）。
 */
import { useCallback, useRef, useState } from 'react';
import {
  findNodeHandle,
  Platform,
  Pressable,
  processColor,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassKitBackdrop from '../native/GlassKitBackdrop';
import GlassKitView from '../native/GlassKitView';
import { canBlur, canLens, SCALE_RANGES, useGlassStore } from '../theme/glass';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';

/** 临时首屏开关 companion：见 src/navigation/index.tsx 顶部同名常量（同一布尔口径）。 */
export const GLASS_TEST_ROUTE = 'GlassTest';

const STEP = 0.1;

/** tint 色值：契约要求 processColor 后的 Int（GlassKitView.tsx :8/:42）。 */
const PANEL_TINT = processColor('#DCE6FF') ?? 0;

function clampScale(key: keyof typeof SCALE_RANGES, next: number): number {
  const range = SCALE_RANGES[key];
  return Math.min(range.max, Math.max(range.min, Number(next.toFixed(2))));
}

/** 单行步进控制：label + 当前值 + [-]/[+]（±0.1，SCALE_RANGES 夹取）。 */
function ScaleRow(props: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text style={styles.rowValue}>{props.value.toFixed(2)}</Text>
      <Pressable
        style={styles.stepButton}
        onPress={() => props.onChange(props.value - STEP)}
      >
        <Text style={styles.stepButtonText}>−</Text>
      </Pressable>
      <Pressable
        style={styles.stepButton}
        onPress={() => props.onChange(props.value + STEP)}
      >
        <Text style={styles.stepButtonText}>＋</Text>
      </Pressable>
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
  blurEnabled: boolean;
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
        blurEnabled={props.blurEnabled}
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

      {/* 前景层：标题 + 玻璃面板 + 调参 + 返回 */}
      <ScrollView contentContainerStyle={styles.foreground}>
        <Text style={styles.hero}>玻璃引擎测试</Text>
        <Text style={styles.statusLine}>
          {`API ${apiLevel} · canBlur=${canBlur()} · canLens=${canLens()} · blurEnabled=${blurOn}`}
        </Text>

        <GlassPanel
          title="Hero 大面板"
          subtitle="blurDp 14 · 圆角 32 · 折射+色散"
          style={styles.panelHero}
          backdropTag={backdropTag}
          blurDp={14}
          cornerRadiusDp={radii.hero}
          refractionPx={10}
          dispersionPx={6}
          blurEnabled={blurOn}
        />
        <View style={styles.panelRow}>
          <GlassPanel
            title="Chip 胶囊"
            subtitle="blurDp 8 · 圆角 pill"
            style={styles.panelChip}
            backdropTag={backdropTag}
            blurDp={8}
            cornerRadiusDp={radii.pill}
            blurEnabled={blurOn}
          />
          <GlassPanel
            title="工具条"
            subtitle="blurDp 12 · 圆角 22"
            style={styles.panelToolbar}
            backdropTag={backdropTag}
            blurDp={12}
            cornerRadiusDp={22}
            blurEnabled={blurOn}
          />
        </View>
        <GlassPanel
          title="clear + 压暗"
          subtitle="blurDp 10 · dimming 0.35"
          style={styles.panelClear}
          backdropTag={backdropTag}
          blurDp={10}
          cornerRadiusDp={radii.xl}
          dimmingAlpha={0.35}
          blurEnabled={blurOn}
        />

        <View style={styles.controlCard}>
          <View style={styles.switchRow}>
            <Text style={styles.rowLabel}>模糊总开关</Text>
            <Switch value={blurOn} onValueChange={setBlurOn} />
          </View>
          <ScaleRow
            label="blurScale（模糊倍率）"
            value={blurScale}
            onChange={(next) => useGlassStore.setState({ blurScale: clampScale('blurScale', next) })}
          />
          <ScaleRow
            label="tintScale（着色倍率）"
            value={tintScale}
            onChange={(next) => useGlassStore.setState({ tintScale: clampScale('tintScale', next) })}
          />
          <ScaleRow
            label="lensScale（透镜倍率）"
            value={lensScale}
            onChange={(next) => useGlassStore.setState({ lensScale: clampScale('lensScale', next) })}
          />
          <ScaleRow
            label="glowScale（柔光倍率）"
            value={glowScale}
            onChange={(next) => useGlassStore.setState({ glowScale: clampScale('glowScale', next) })}
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
  statusLine: { fontSize: 12, color: '#d7dde6', marginBottom: 18 },
  panel: { justifyContent: 'center', padding: 16 },
  panelTextWrap: { alignItems: 'flex-start' },
  panelTitle: { fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  panelSubtitle: { fontSize: 11, color: '#e6ebf2' },
  panelHero: { height: 120, marginBottom: 16 },
  panelRow: { flexDirection: 'row', marginBottom: 16 },
  panelChip: { flex: 1, height: 72, marginRight: 8 },
  panelToolbar: { flex: 1.4, height: 72, borderRadius: radii.toolbar },
  panelClear: { height: 88, marginBottom: 18, borderRadius: radii.xl },
  controlCard: { borderRadius: radii.lg, backgroundColor: '#1a2027', opacity: 0.94, padding: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  rowLabel: { flex: 1, fontSize: 13, color: '#e6ebf2' },
  rowValue: { width: 52, fontSize: 13, color: '#8fd3ff', textAlign: 'right' },
  stepButton: {
    width: 40, height: 32, marginLeft: 8, borderRadius: radii.sm,
    backgroundColor: '#2a323c', alignItems: 'center', justifyContent: 'center',
  },
  stepButtonText: { fontSize: 16, color: '#ffffff' },
  backButton: {
    marginTop: 18, marginBottom: 40, height: 48, borderRadius: radii.md,
    backgroundColor: '#2a323c', alignItems: 'center', justifyContent: 'center',
  },
  backButtonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
