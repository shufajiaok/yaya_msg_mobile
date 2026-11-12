/**
 * GlassKitView —— Liquid Glass 玻璃面板（引擎重写清单 §一 / §二 / §三 #8）。
 *
 * 契约（与原生 GlassKitManager @ReactProp 一一对应）：
 * - blurDp        基准模糊半径 dp（原生最终半径 = blurDp × blurScale × density）
 * - tintAlpha     tint 基准 alpha（原生最终 alpha = min(tintAlpha × tintScale, 0.24)，
 *                 0.24 为 glass.ts H1 硬约束上界（it.19 P0-5 由 0.12 提到原版
 *                 GlassSurfaceKt.java:317 同值），原生侧 clamp）
 * - tintColor     tint 颜色（旧架构 Paper：传原始色值字符串如 '#DCE6FF'，由桥接
 *                 做唯一一次 processColor；禁止调用方预 processColor——Paper 渲染器
 *                 对 customType="Color" prop 会自动再执行一次 processColor
 *                 （getNativeComponentAttributes case 'Color'），预处理的数字会被
 *                 二次转换 normalizeColor(负数)=null 导致 prop 整帧丢弃、原生
 *                 tintColor 恒为 0。真机 logcat + 像素取证实证，2026-11-07）
 * - refractionPx  折射位移基准 px（API 33+ 透镜，乘 lensScale）
 * - dispersionPx  色散位移基准 px（API 33+ 透镜，乘 lensScale）
 * - lensBandPx    it.19 折射带高 px（circleMap 剖面；与 refractionPx 独立）
 * - cornerRadiusDp 圆角半径 dp（it.13：引擎按连续曲率超椭圆生成 clip 与 SDF）
 * - dimmingAlpha  压暗层 alpha（#000，独立于 tint）
 * - backdropTag   背景容器 tag（findNodeHandle(GlassKitBackdrop ref)）
 * - blurBackdropTag / iconBackdropTag  it.25 双纹理分流：纯背景源 / 透明底图标源
 *   （两者都有效时 native 才走「背景一次高斯 + SRC_OVER 图标 + blur=0 的 lens」；
 *    任一无效原样回退单纹理路径，其它玻璃面板零回归）
 * - blurScale / tintScale / lensScale / glowScale  四倍率（glowScale 作用于边缘
 *   高光宽/alpha，本轮迭代起进引擎；forceDownsample 切模糊路径，见下）
 * - forceDownsample 强制降采样模糊路径（模拟器 GPU 对 RenderEffect 支持缺陷时
 *   开启；真机默认 false 走 RenderEffect 真高斯）
 * - blurEnabled   模糊总开关（原生采集+模糊链路闸门）
 * - membraneAlpha 白色膜层 alpha（it.13 默认 0：「膜层」滑块改绑 tintScale）
 * - highlightScale 顶缘高光倍率（0–1，默认 0.2；18dp 竖向渐变）
 * - chromaticEnabled 色散开关（默认 true；关闭时引擎把 dispersion 置 0）
 * - depthEffect   景深开关（默认 true；引擎下发 uDepthEffect=1/0）
 * - vibrancyEnabled 鲜活度开关（默认 true；saturation=1.5，默认走风险最低的
 *   GlassLensShader 末矩阵，仅 API33+ 硬件透镜帧生效；GPU RenderEffect
 *   ColorFilter 路径保留为引擎侧编译期开关 VIBRANCY_SHADER_FALLBACK=false）
 * - capsuleContinuous it.14 胶囊连续曲率开关（默认 false；仅 dock bar / dock
 *   指示器 / 顶栏演示件开启，真胶囊 r=min(w,h)/2 不变、角部改走 n=3 超椭圆）
 * - indicatorBoostAlpha it.14 指示器专属 White 提亮 alpha（默认 0；仅指示器
 *   硬编码 0.05，Kotlin GlassKitKt.java:1434-1435,1451 无对应滑块）
 *
 * H2 双档门控（glass.ts canBlur / canLens，非 Android 视作全支持）：
 * - canBlur() false  → blurDp 传 0（原生跳过模糊，只剩 tint/压暗/描边）；
 * - canLens() false  → refractionPx / dispersionPx 传 0（跳过 AGSL 透镜）；
 * - AccessibilityInfo.isReduceTransparencyEnabled → blurEnabled = false（整链兜底）。
 *
 * 四倍率：从 src/theme/glass.ts 的 useGlassStore 订阅（blurScale/tintScale/
 * lensScale/glowScale）传下去；显式 props 值优先（便于调试覆盖），未传时用 store 值。
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
  /** tint 基准 alpha（原生按 H1 钳到 ≤0.24；基准值走 glass.ts TINT_ALPHA_BASE=0.10）。 */
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
  /**
   * it.19 折射带高（px，仅 API 33+ 生效；circleMap 剖面的归一化尺度）。
   * 与 refractionPx（带内最大位移）是两个独立参数，对应原版
   * `GlassLevel.refractionHeightDp` / `refractionAmountDp`。
   * 调用方按 `dp × PixelRatio.get()` 传 px，native 与本组件一样只再乘 lensScale 一次。
   */
  lensBandPx?: number;
  /** 圆角半径（dp）。it.13：引擎按连续曲率超椭圆（n 由尺寸/半径自动计算）裁剪。 */
  cornerRadiusDp?: number;
  /**
   * it.14 胶囊连续曲率开关（默认 false）。仅 dock bar / dock 指示器 / 顶栏演示件
   * 显式开启：真胶囊 r=min(w,h)/2 一字不动，角部由圆弧 n=2 改为 n=3 超椭圆，
   * clipPath 与 AGSL uCornerExponent 同 n；hero/chip/工具条/clear 不开启（零回归）。
   */
  capsuleContinuous?: boolean;
  /**
   * it.19 P0-2 外扩内缩量（dp，默认 0 = 零回归）。
   *
   * 语义：本组件的 View 尺寸 = 玻璃本体 + `2 × glassInsetDp`，本体画在中心矩形，
   * 四周的环带只用来放外投影（View 只能在自己 bounds 内绘制，24dp 模糊的投影
   * 放不进本体）。**外扩由调用方负责**：容器 `W+2×inset`，本组件 absoluteFill，
   * 内容层反向位移 `inset`，视觉几何一点不变。
   */
  glassInsetDp?: number;
  /** it.19 P0-2 外投影 alpha（默认 0.1 = 原版 Black@0.1；仅 glassInsetDp > 0 生效）。 */
  shadowAlpha?: number;
  /** 压暗层 alpha（#000 @0.35 语义见 glass.ts GLASS_DIMMING）。 */
  dimmingAlpha?: number;
  /** 背景容器原生 tag（findNodeHandle(GlassKitBackdrop ref)）。 */
  backdropTag?: number;
  /**
   * it.25 双纹理分流：纯背景采集源 tag（bar 玻璃叶子，capturable + liveBackdrop）。
   * native 只对这一张纹理做唯一一次 GPU 高斯；与 iconBackdropTag 同时有效时
   * 才走「双源合成 → lens」新路径，任一无效则原样回退到单纹理路径（零回归）。
   * 与 backdropTag 同量纲（findNodeHandle 拿到的原生 view id）；不传 = -1（NO_ID）。
   */
  blurBackdropTag?: number;
  /**
   * it.25 双纹理分流：透明底图标采集源 tag（只含图标/文字、背景 transparent）。
   * native 以 SRC_OVER 把清晰图标覆盖到「已模糊背景」之上，图标不进卷积；
   * 合成纹理再喂 lens（lens 输入 blur=0），放大/折射效果保留而图标不糊。
   * 不传 = -1（NO_ID）。
   */
  iconBackdropTag?: number;
  /** 模糊倍率覆盖（未传时取 glass.ts store 的 blurScale）。 */
  blurScale?: number;
  /** tint / 膜层倍率覆盖（未传时取 store 的 tintScale）。 */
  tintScale?: number;
  /** 透镜 / 折射倍率覆盖（未传时取 store 的 lensScale；0 = 关透镜）。 */
  lensScale?: number;
  /** 柔光倍率覆盖（未传时取 store 的 glowScale；作用于边缘高光宽/alpha）。 */
  glowScale?: number;
  /** it.6 描边亮度倍率（基准 alpha = 0.14 × glowScale × 本值）。 */
  glowAlphaScale?: number;
  /** it.6 描边宽度倍率（宽 = 1dp × glowScale × 本值，clamp 0.5–8dp）。 */
  glowWidthScale?: number;
  /** it.6 顶缘高光加强倍率（glow 双带；it.13 起降为扩展调试项）。 */
  glowTopScale?: number;
  /** it.6 底缘高光加强倍率（glow 双带；it.13 起降为扩展调试项）。 */
  glowBottomScale?: number;
  /** 强制降采样模糊路径（模拟器调试开关；真机默认 false 走 RenderEffect 真高斯）。 */
  forceDownsample?: boolean;
  /** it.8 玻璃叠玻璃：true 时本视图注册为采集源（GlassCaptureEngine 注册表，
   *  detach 自动注销），其他玻璃的 backdropTag 指向本视图 handle（findNodeHandle）
   *  即可采集本视图的合成帧——内层再叠一层透镜 = 双重透镜。默认 false。 */
  capturable?: boolean;
  /**
   * it.18 实时背景透射（默认 false）。
   *
   * 仅用于「位置固定、背景内容在其下方持续滚动」的玻璃（dock bar）。引擎按需重绘
   * 语义依赖「背景源 drawGeneration 变化」，而 App 级 backdrop 在滚动时未必产生
   * traversal ⇒ 玻璃会永久停在首次捕获的静止帧。开启后每帧节流重绘，始终采当前背景。
   */
  liveBackdrop?: boolean;
  /**
   * it.13 膜层：白色覆盖层 alpha（0–1，默认 **0**）。
   * 「膜层」滑块语义改绑 tintScale（SettingsScreenKt.java:1946-1961），
   * 白膜层引擎代码保留但默认不画；显式传值仍可做 A/B。绘制顺序在 tint 之后、
   * 压暗之前，原生侧绘制，不产生 JS 内联 rgba。
   */
  membraneAlpha?: number;
  /**
   * it.14 指示器专属 White@0.05 提亮 alpha（默认 0，上界复用 H1 的 0.24）。
   * 出处 Kotlin GlassKitKt.java:1434-1435,1451 → GlassSurfaceKt.java:704-708
   * 的第二笔 drawRect($tint)；SettingsScreenKt.java:1898-2128 无对应滑块，
   * 故为硬编码常量，仅 dock 指示器传 0.05，不加滑块 / 开关。
   */
  indicatorBoostAlpha?: number;
  /**
   * it.13 顶缘高光倍率（0–1，默认 0.2）。
   * 对齐 GlassTuning.java:30 / GlassSurfaceKt.java:710-713：highlightScale>0.01
   * 时在顶缘画 18dp 竖向渐变 White@(0.22×scale) → Transparent，底缘不画。
   */
  highlightScale?: number;
  /** it.13 色散（整层画三遍）开关，默认 true；关闭时引擎把 dispersion 置 0。 */
  chromaticEnabled?: boolean;
  /** it.13 景深开关，默认 true；引擎下发 uDepthEffect（法线叠加径向分量）。 */
  depthEffect?: boolean;
  /**
   * it.13 鲜活度开关，默认 true；saturation=1.5 ColorMatrix
   * （ColorFilterKt.java:16 / 75-85）。本轮跳过真机取证，默认选风险最低的
   * GlassLensShader 末矩阵（uVibrancy，仅硬件透镜帧，不改 GPU 模糊链）；
   * GPU 模糊链 RenderEffect.createColorFilterEffect（API31+）保留为引擎侧
   * 编译期开关供 A/B。置 false = 运行时可关闭开关，完全关闭鲜活度。
   */
  vibrancyEnabled?: boolean;
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
    const glowScale = useGlassStore((state) => state.glowScale);
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
        lensBandPx={lensOn ? (props.lensBandPx ?? 0) : 0}
        dispersionPx={lensOn ? (props.dispersionPx ?? 0) : 0}
        blurScale={props.blurScale ?? blurScale}
        tintScale={props.tintScale ?? tintScale}
        lensScale={props.lensScale ?? lensScale}
        glowScale={props.glowScale ?? glowScale}
        glowAlphaScale={props.glowAlphaScale ?? 1}
        glowWidthScale={props.glowWidthScale ?? 1}
        glowTopScale={props.glowTopScale ?? 1}
        glowBottomScale={props.glowBottomScale ?? 1}
        forceDownsample={props.forceDownsample ?? false}
        capturable={props.capturable ?? false}
        liveBackdrop={props.liveBackdrop ?? false}
        // it.25 双源 tag：未传时下发 -1（View.NO_ID）⇒ native 回退单纹理路径
        blurBackdropTag={props.blurBackdropTag ?? -1}
        iconBackdropTag={props.iconBackdropTag ?? -1}
        membraneAlpha={props.membraneAlpha ?? 0}
        capsuleContinuous={props.capsuleContinuous ?? false}
        glassInsetDp={props.glassInsetDp ?? 0}
        shadowAlpha={props.shadowAlpha ?? 0.1}
        indicatorBoostAlpha={props.indicatorBoostAlpha ?? 0}
        highlightScale={props.highlightScale ?? 0.2}
        chromaticEnabled={props.chromaticEnabled ?? true}
        depthEffect={props.depthEffect ?? true}
        vibrancyEnabled={props.vibrancyEnabled ?? true}
        ref={ref as Ref<NativeViewInstance>}
      />
    );
  },
);

export default GlassKitView;
