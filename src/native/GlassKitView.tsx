/**
 * GlassKitView —— Liquid Glass 玻璃面板（引擎重写清单 §一 / §二 / §三 #8）。
 *
 * 契约（与原生 GlassKitManager @ReactProp 一一对应）：
 * - blurDp        基准模糊半径 dp（原生最终半径 = blurDp × blurScale × density）
 * - tintAlpha     tint 基准 alpha（原生最终 alpha = min(tintAlpha × tintScale, 0.12)，
 *                 0.12 为 glass.ts H1 硬约束上界，原生侧 clamp）
 * - tintColor     tint 颜色（旧架构 Paper：传原始色值字符串如 '#DCE6FF'，由桥接
 *                 做唯一一次 processColor；禁止调用方预 processColor——Paper 渲染器
 *                 对 customType="Color" prop 会自动再执行一次 processColor
 *                 （getNativeComponentAttributes case 'Color'），预处理的数字会被
 *                 二次转换 normalizeColor(负数)=null 导致 prop 整帧丢弃、原生
 *                 tintColor 恒为 0。真机 logcat + 像素取证实证，2026-11-07）
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
import { forwardRef, useEffect, useState, type Component, type Ref } from 'react';
import {
  AccessibilityInfo,
  NativeMethods,
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
  /** tint 颜色。
   *  旧架构 Android（Paper / requireNativeComponent）：必须传**原始色值字符串**
   *  （如 '#DCE6FF'）——桥接层会自动做唯一一次 processColor（customType="Color"
   *  的 validAttributes 钩子），调用方预 processColor 的数字会被二次转换丢弃
   *  （normalizeColor(负 ColorInt) → null → prop 不下发，原生 tintColor 恒 0）。
   *  新架构 Fabric / iOS（若接入）：桥接不自动转换，届时需按平台契约传
   *  processColor 后的数字（见 glass.ts / 04 §6.2 S7，接入时再收口）。
   *  类型放宽为 string | number 以同时容纳两种平台口径，禁止再预处理。 */
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

/** 原生宿主组件实例类型（requireNativeComponent ref 的真实类型）。 */
type NativeViewInstance = Component<GlassKitViewProps> & NativeMethods;

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
