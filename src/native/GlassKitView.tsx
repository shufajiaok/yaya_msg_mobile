/**
 * GlassKitView —— Liquid Glass 玻璃面板（引擎重写清单 §一 / §二 / §三 #8）。
 *
 * 契约（与原生 GlassKitManager @ReactProp 一一对应）：
 * - blurDp        基准模糊半径 dp（原生最终半径 = blurDp × blurScale × density）
 * - tintAlpha     tint 基准 alpha（原生最终 alpha = min(tintAlpha × tintScale, 0.12)，
 *                 0.12 为 glass.ts H1 硬约束上界，原生侧 clamp）
 * - tintColor     tint 颜色（必须传数字：processColor 后的 Int；不接受色值字符串）
 * - refractionPx  折射位移基准 px（API 33+ 透镜，乘 lensScale）
 * - dispersionPx  色散位移基准 px（API 33+ 透镜，乘 lensScale）
 * - cornerRadiusDp 圆角半径 dp
 * - dimmingAlpha  压暗层 alpha（#000，独立于 tint）
 * - backdropTag   背景容器 tag（findNodeHandle(GlassKitBackdrop ref)）
 * - blurScale / tintScale / lensScale  三倍率（glowScale 仅 JS 侧柔光，不进引擎）
 * - blurEnabled   模糊总开关（原生采集+模糊链路闸门）
 *
 * H2 双档门控（glass.ts canBlur / canLens，非 Android 视作全支持）：
 * - canBlur() false  → blurDp 传 0（原生跳过模糊，只剩 tint/压暗/描边）；
 * - canLens() false  → refractionPx / dispersionPx 传 0（跳过 AGSL 透镜）；
 * - AccessibilityInfo.isReduceTransparencyEnabled → blurEnabled = false（整链兜底）。
 *
 * 四倍率：从 src/theme/glass.ts 的 useGlassStore 订阅（blurScale/tintScale/lensScale）
 * 传下去；显式 props 值优先（便于调试覆盖），未传时用 store 值。glowScale 不进引擎。
 *
 * ⚠️ 功能层叶子视图：无子节点（清单 §一 架构图）；页面零接线，P1 起使用。
 */
import { forwardRef, useEffect, useState, type Ref } from 'react';
import {
  AccessibilityInfo,
  HostComponent,
  Platform,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';
import { canBlur, canLens, useGlassStore } from '../theme/glass';

export interface GlassKitViewProps extends ViewProps {
  /** 基准模糊半径（dp），四档语义见 glass.ts BLUR_DP_BY_KIND。 */
  blurDp?: number;
  /** tint 基准 alpha（原生按 H1 钳到 ≤0.12）。 */
  tintAlpha?: number;
  /** tint 颜色（必须传数字：processColor(色值) 后的 Int；原生按 Int 收口，
   *  不要传色值字符串——桥接层虽会转换，但契约不做该兜底承诺）。 */
  tintColor?: string | number;
  /** 折射位移基准（px，仅 API 33+ 生效）。 */
  refractionPx?: number;
  /** 色散位移基准（px，仅 API 33+ 生效）。 */
  dispersionPx?: number;
  /** 圆角半径（dp）。 */
  cornerRadiusDp?: number;
  /** 压暗层 alpha（#000 @0.35 语义见 glass.ts GLASS_DIMMING）。 */
  dimmingAlpha?: number;
  /** 背景容器原生 tag（findNodeHandle(GlassKitBackdrop ref)）。 */
  backdropTag?: number;
  /** 模糊倍率覆盖（未传时取 glass.ts store 的 blurScale）。 */
  blurScale?: number;
  /** tint 倍率覆盖（未传时取 store 的 tintScale）。 */
  tintScale?: number;
  /** 透镜倍率覆盖（未传时取 store 的 lensScale；0 = 关透镜）。 */
  lensScale?: number;
  /** 模糊总开关（reduceTransparency 时本组件强制传 false）。 */
  blurEnabled?: boolean;
}

const NATIVE_VIEW_NAME = 'GlassKitView';

/** 原生宿主组件实例类型（findNodeHandle / measure 的输入）。 */
type NativeViewInstance = HostComponent<GlassKitViewProps>;

const NativeGlassKitView =
  Platform.OS === 'android'
    ? requireNativeComponent<GlassKitViewProps>(NATIVE_VIEW_NAME)
    : null;

/** 订阅 reduceTransparency 系统设置（02 §5.1：关 blur/lensing → 实色）。 */
function useReduceTransparency(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (mounted) setReduceTransparency(enabled);
      })
      .catch(() => {
        // 查询失败保持 false：不因辅助功能接口异常放大降级
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduceTransparency(enabled),
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceTransparency;
}

/**
 * 玻璃面板（默认导出）。门控只在 JS→原生传参处收口：
 * canBlur false ⇒ blurDp=0；canLens false ⇒ refraction/dispersion=0；
 * reduceTransparency ⇒ blurEnabled=false（原生整链兜底）。
 * 功能层叶子视图：无子节点，透传 style / backdropTag 等其余 props。
 */
export const GlassKitView = forwardRef<NativeViewInstance, GlassKitViewProps>(
  function GlassKitView(props, ref) {
    const blurScale = useGlassStore((state) => state.blurScale);
    const tintScale = useGlassStore((state) => state.tintScale);
    const lensScale = useGlassStore((state) => state.lensScale);
    const reduceTransparency = useReduceTransparency();

    const blurOn = canBlur() && props.blurEnabled !== false && !reduceTransparency;
    const lensOn = canLens();

    if (!NativeGlassKitView) {
      // 非 Android：静默不渲染（与 GlassKitBackdrop 同策略）
      return null;
    }

    return (
      <NativeGlassKitView
        {...props}
        blurDp={blurOn ? (props.blurDp ?? 0) : 0}
        blurEnabled={blurOn}
        refractionPx={lensOn ? (props.refractionPx ?? 0) : 0}
        dispersionPx={lensOn ? (props.dispersionPx ?? 0) : 0}
        blurScale={props.blurScale ?? blurScale}
        tintScale={props.tintScale ?? tintScale}
        lensScale={props.lensScale ?? lensScale}
        ref={ref as Ref<NativeViewInstance>}
      />
    );
  },
);

export default GlassKitView;
