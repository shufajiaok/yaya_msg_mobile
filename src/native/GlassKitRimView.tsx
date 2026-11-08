/**
 * GlassKitRimView —— it.19 P0-1 轮廓光（Rim Highlight）覆盖层。
 *
 * ## 为什么是独立组件
 * 原版 `HighlightNode` 在内容**之后**画轮廓；而 `GlassKitView` 是 RN 树里的背景层，
 * 图标 / 文字绘制在它之上 ⇒ 在 GlassKitView 内部画 rim 会被内容盖住。
 * 本组件是一个**透明 View**，由调用方绝对定位铺在内容之上，默认
 * `pointerEvents="none"`（不吃触摸）。
 *
 * ## 视觉参数（默认值 = 原版 `Highlight.Default` + `HighlightStyle.Default`）
 * | prop | 默认 | 含义 / 出处 |
 * |---|---|---|
 * | `cornerRadiusDp` | 0 | 必须与同位置 `GlassKitView.cornerRadiusDp` **完全一致**（否则出现双线） |
 * | `rimWidthDp` | 0.5 | 视觉描边宽度 dp（原版 Highlight.width） |
 * | `rimBlurDp` | -1 | -1 = 取 `rimWidthDp / 2`（原版 0.25dp） |
 * | `rimAlpha` | 0.5 | **降级路径**（API<33 / AGSL 失败）的描边 alpha；AGSL 路径按原版忽略 |  
 * | `rimAngleDeg` | 45 | 方向角（原版 45°） |
 * | `rimFalloff` | 1.0 | `pow(|grad·normal|, falloff)` 的指数 |
 * | `rimColor` | '#FFFFFF' | 只取 RGB，alpha 走 `rimAlpha` |
 * | `capsuleContinuous` | false | 真胶囊（dock bar / 指示器 / 顶栏）传 true，走精确 Kyant0 Path |
 * | `rimEnabled` | true | 总开关 |
 *
 * ## 叠加
 * 原生侧固定 `PorterDuff.Mode.ADD`（= 原版 `BlendMode.Plus`），不需要 JS 传。
 *
 * ## 降级
 * API < 33 或 AGSL 编译失败 ⇒ 原生自动退化为**纯白 @0.5 描边**（无方向性调制），
 * 与原版在无 RuntimeShader 设备上的行为一致；JS 侧无需分支。
 */
import { forwardRef, type Component, type Ref } from 'react';
import {
  NativeMethods,
  Platform,
  StyleSheet,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';

export interface GlassKitRimViewProps extends ViewProps {
  /** 圆角半径（dp）——必须与同位置的 GlassKitView.cornerRadiusDp 相同。 */
  cornerRadiusDp?: number;
  /** 视觉描边宽度（dp，默认 0.5）。 */
  rimWidthDp?: number;
  /** 描边模糊半径（dp，默认 -1 = 宽度的一半）。 */
  rimBlurDp?: number;
  /** 降级路径的描边 alpha（默认 0.5）；AGSL 路径按原版固定 1.0，此值不生效。 */
  rimAlpha?: number;
  /** 方向角（度，默认 45）。 */
  rimAngleDeg?: number;
  /** 方向性衰减指数（默认 1.0）。 */
  rimFalloff?: number;
  /** 颜色（默认 '#FFFFFF'；只取 RGB，alpha 走 rimAlpha）。 */
  rimColor?: string;
  /** true ⇒ clipPath 走 it.14 精确 Kyant0 胶囊（dock bar / 指示器 / 顶栏）。 */
  capsuleContinuous?: boolean;
  /** 总开关（默认 true）。 */
  rimEnabled?: boolean;
}

const NATIVE_RIM_NAME = 'GlassKitRimView';

/** 原生宿主组件实例类型（requireNativeComponent ref 的真实类型）。 */
type NativeRimInstance = Component<GlassKitRimViewProps> & NativeMethods;

const NativeGlassKitRimView =
  Platform.OS === 'android'
    ? requireNativeComponent<GlassKitRimViewProps>(NATIVE_RIM_NAME)
    : null;

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

/**
 * 轮廓光覆盖层。最省用法：`<GlassKitRimView cornerRadiusDp={24} />`
 * ⚠️ 必须作为**最后一个子节点**渲染（RN 同层后绘者在上）—— 原版轮廓光画在内容
 * **之后**，要盖住图标 / 文字，这也是它独立成组件的原因。
 */
const GlassKitRimView = forwardRef<NativeRimInstance, GlassKitRimViewProps>(
  function GlassKitRimView(props, ref) {
    if (!NativeGlassKitRimView) {
      // 非 Android：静默不渲染（与 GlassKitBackdrop / GlassKitView 同策略）
      return null;
    }
    const {
      cornerRadiusDp = 0,
      rimWidthDp = 0.5,
      rimBlurDp = -1,
      rimAlpha = 0.5,
      rimAngleDeg = 45,
      rimFalloff = 1,
      rimColor = '#FFFFFF',
      capsuleContinuous = false,
      rimEnabled = true,
      style,
      ...rest
    } = props;

    return (
      <NativeGlassKitRimView
        {...rest}
        pointerEvents="none"
        cornerRadiusDp={cornerRadiusDp}
        rimWidthDp={rimWidthDp}
        rimBlurDp={rimBlurDp}
        rimAlpha={rimAlpha}
        rimAngleDeg={rimAngleDeg}
        rimFalloff={rimFalloff}
        rimColor={rimColor}
        capsuleContinuous={capsuleContinuous}
        rimEnabled={rimEnabled}
        style={[styles.fill, style]}
        ref={ref as Ref<NativeRimInstance>}
      />
    );
  },
);

export default GlassKitRimView;
