/**
 * GlassKitBackdrop —— Liquid Glass 背景容器（引擎重写清单 §一 / §三 #8）。
 *
 * 契约：
 * - 内容层角色：包住背景图 / 渐变等「被玻璃采集」的内容；自身是空 FrameLayout，
 *   无任何渲染行为，仅作为原生采集注册表的 key（GlassKitBackdropManager 在
 *   onAfterUpdateTransaction 时以 view.getId() 为 tag 注册进 GlassCaptureEngine）。
 * - 玻璃面板（GlassKitView）通过 backdropTag = findNodeHandle(backdropRef) 关联。
 * - 非 Android 平台不渲染（原生实现仅 Android；其他平台走既有 GlassSurface 体系）。
 *
 * ⚠️ 本组件属「control 层挂载能力」，P1 起才由页面接线；本批零接线（清单 §四）。
 */
import { forwardRef, type Ref } from 'react';
import { HostComponent, Platform, requireNativeComponent, type ViewProps } from 'react-native';

export interface GlassKitBackdropProps extends ViewProps {
  /** 被采集的背景内容（背景图 / 渐变层）。 */
  children?: ViewProps['children'];
}

const NATIVE_BACKDROP_NAME = 'GlassKitBackdrop';

/** 原生宿主组件实例类型（findNodeHandle(ref.current) 的输入）。 */
type NativeBackdropInstance = HostComponent<GlassKitBackdropProps>;

const NativeGlassKitBackdrop =
  Platform.OS === 'android'
    ? requireNativeComponent<GlassKitBackdropProps>(NATIVE_BACKDROP_NAME)
    : null;

/**
 * 背景容器：forwardRef 透传 ref（页面用 findNodeHandle(ref.current) 取原生 tag），
 * children / style / 其余 ViewProps 全部透传给原生 FrameLayout。
 */
export const GlassKitBackdrop = forwardRef<NativeBackdropInstance, GlassKitBackdropProps>(
  function GlassKitBackdrop(props, ref) {
    if (!NativeGlassKitBackdrop) {
      // 非 Android：静默不渲染（能力批次未上线平台，页面侧兜底样式自理）
      return null;
    }
    return <NativeGlassKitBackdrop {...props} ref={ref as Ref<NativeBackdropInstance>} />;
  },
);

export default GlassKitBackdrop;
