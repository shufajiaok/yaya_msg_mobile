/**
 * GlassSlider —— 零依赖滑块（GlassTestScreen 四倍率调节专用，替代 ±0.1 步进按钮）。
 *
 * 实现：PanResponder + onLayout 量轨道宽度；按下 / 拖动 / 松开都以
 * gestureState.locationX → 0–1 分数线性映射到 [min, max]，实时 onChange
 * （move 与 release 都触发，拖动过程即所见即所得）。不依赖
 * @react-native-community/slider 或任何第三方库。
 *
 * 结构：触摸容器（高 28，放大热区）内含 6dp 轨道 + 已填充段 + 24dp 圆点 thumb
 * （带 shadow / elevation 与 1px 描边保证深浅背景下的对比度）。
 *
 * 守卫合规：无内联 rgba 背景（实色 + 无透明叠加）、圆角全走 radii token、
 * 无 BlurView、无玻璃 API（useGlassStore 等由调用方接线，本组件纯展示）。
 */
import { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radii } from '../theme/radii';

export interface GlassSliderProps {
  /** 当前值（调用方已按 SCALE_RANGES 钳制）。 */
  value: number;
  /** 区间下限（含）。 */
  min: number;
  /** 区间上限（含）。 */
  max: number;
  /** 拖动 / 点击时的实时回调（按下、移动、松开都会触发）。 */
  onChange: (next: number) => void;
  /** 外部容器样式（默认 flex: 1，适配「label 左 / 滑块中 / 数值右」行布局）。 */
  style?: StyleProp<ViewStyle>;
}

/** 触摸容器高度（dp）：热区高度，视觉轨道居中其中。 */
const CONTAINER_HEIGHT = 28;
/** 轨道视觉高度（dp）。 */
const TRACK_HEIGHT = 6;
/** thumb 直径（dp）。 */
const THUMB_SIZE = 24;

export default function GlassSlider(props: GlassSliderProps) {
  const { value, min, max, onChange, style } = props;

  // onLayout 量的轨道宽度：state 驱动渲染 + ref 供 PanResponder 回调同步读取
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  // PanResponder 闭包持有的是创建时的引用，用 ref 转发最新 props，避免陈旧闭包
  const latestRef = useRef({ value, min, max, onChange });
  latestRef.current = { value, min, max, onChange };

  /** 由容器内 x 坐标换算 0–1 分数并回调（夹取在 [0,1]，NaN/异常坐标忽略）。 */
  const emitFromX = (x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0 || !Number.isFinite(x)) return;
    const fraction = Math.min(1, Math.max(0, x / width));
    const latest = latestRef.current;
    latest.onChange(latest.min + fraction * (latest.max - latest.min));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => emitFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => emitFromX(evt.nativeEvent.locationX),
      onPanResponderRelease: (evt) => emitFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  // 值 → 几何：分母防 0；thumb 用「可用行程」定位，保证两端不出轨
  const span = Math.max(1e-6, max - min);
  const fraction = Math.min(1, Math.max(0, (value - min) / span));
  const travel = Math.max(0, trackWidth - THUMB_SIZE);
  const fillWidth = fraction * trackWidth;
  const thumbLeft = fraction * travel;

  return (
    <View
      style={[styles.container, style]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: fillWidth }]} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: CONTAINER_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radii.xs,
    backgroundColor: '#2a323c',
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: radii.xs,
    backgroundColor: '#8fd3ff',
  },
  thumb: {
    position: 'absolute',
    top: (CONTAINER_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.pill,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#101418',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
});
