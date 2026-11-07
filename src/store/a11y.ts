// a11y 开关 store（P0 第 6 项「src/store/ 仅新增 a11y 开关」）
// 依据：02-apple-liquid-glass-spec.md §5.1 可访问性降级矩阵（Reduce Transparency /
// Increase Contrast / Reduce Motion / Dim Flashing Lights / Bold Text / Assistive Access）；
//       03 §8.1 四条降级矩阵 / §9 P0；04 §2.4 契约缺口③（引擎无 reduceTransparency /
//       reduceMotion / DynamicType 分支）→ 由本 store + glass.ts 的 degrade() 统一补上。
//
// 写法规齐 src/store/danmakuSettings.ts：zustand create + persist + createJSONStorage + AsyncStorage。
// 系统侧只用 RN 内置 AccessibilityInfo，不引入 react-native-safe-area-context 或任何新依赖。

import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDegrade, degrade } from '../theme/glass';

/** App 内开关（02 §5.1：系统能力不可用时提供兜底开关） */
export interface A11yFlags {
  /** 减少透明效果：关 blur / lensing / 折射高光 → 实色 ≥0.9 */
  reduceTransparency: boolean;
  /** 增强对比度：切 4 套色 token 的 inc 变体 */
  increaseContrast: boolean;
  /** 减少动态效果：关 morph / lift / z 轴 / 高光流动 */
  reduceMotion: boolean;
  /** 降低闪光：直播礼物特效 / 闪光 / 弹幕高亮可降级关闭 */
  dimFlashingLights: boolean;
  /** 精简模式（【建议值】）：隐藏弹幕与礼物特效，只留播放 + 聊天 + 返回 */
  assistiveAccess: boolean;
}

/** 系统能力读取结果（不持久化，随系统设置变化） */
export interface A11ySystemFlags {
  systemReduceTransparency: boolean;
  systemReduceMotion: boolean;
  systemBoldText: boolean;
  systemGrayscale: boolean;
}

export interface A11yState extends A11yFlags, A11ySystemFlags {
  setFlag: (key: keyof A11yFlags, value: boolean) => void;
  setSystemFlag: (key: keyof A11ySystemFlags, value: boolean) => void;
  reset: () => void;
}

export const A11Y_STORAGE_KEY = 'yaya_a11y_settings_v1';

export const DEFAULT_A11Y_FLAGS: A11yFlags = {
  reduceTransparency: false,
  increaseContrast: false,
  reduceMotion: false,
  dimFlashingLights: false,
  assistiveAccess: false,
};

export const DEFAULT_A11Y_SYSTEM_FLAGS: A11ySystemFlags = {
  systemReduceTransparency: false,
  systemReduceMotion: false,
  systemBoldText: false,
  systemGrayscale: false,
};

export const useA11yStore = create<A11yState>()(
  persist(
    (set) => ({
      ...DEFAULT_A11Y_FLAGS,
      ...DEFAULT_A11Y_SYSTEM_FLAGS,
      setFlag: (key, value) => {
        switch (key) {
          case 'reduceTransparency':
            set({ reduceTransparency: value });
            return;
          case 'increaseContrast':
            set({ increaseContrast: value });
            return;
          case 'reduceMotion':
            set({ reduceMotion: value });
            return;
          case 'dimFlashingLights':
            set({ dimFlashingLights: value });
            return;
          case 'assistiveAccess':
            set({ assistiveAccess: value });
            return;
        }
      },
      setSystemFlag: (key, value) => {
        switch (key) {
          case 'systemReduceTransparency':
            set({ systemReduceTransparency: value });
            return;
          case 'systemReduceMotion':
            set({ systemReduceMotion: value });
            return;
          case 'systemBoldText':
            set({ systemBoldText: value });
            return;
          case 'systemGrayscale':
            set({ systemGrayscale: value });
            return;
        }
      },
      /** 只重置 App 内开关，系统能力读数由系统决定 */
      reset: () => set({ ...DEFAULT_A11Y_FLAGS }),
    }),
    {
      name: A11Y_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      /** 只持久化用户开关；系统读数不落盘 */
      partialize: (state) => ({
        reduceTransparency: state.reduceTransparency,
        increaseContrast: state.increaseContrast,
        reduceMotion: state.reduceMotion,
        dimFlashingLights: state.dimFlashingLights,
        assistiveAccess: state.assistiveAccess,
      }),
    },
  ),
);

/**
 * 把 a11y 状态映射到 glass.ts 的 degrade() 单一路径。
 * 04 §2.4 契约缺口②：四倍率互不连带、引擎无「关闭玻璃」总开关，
 * 因此 Reduce Transparency 不能只把某个倍率调 0，必须走 degrade('reduceTransparency')。
 */
export function applyA11yGlassPolicy(state: A11yState): void {
  const reduceTransparency = state.reduceTransparency || state.systemReduceTransparency;
  const reduceMotion = state.reduceMotion || state.systemReduceMotion;

  if (reduceTransparency) degrade('reduceTransparency');
  else clearDegrade('reduceTransparency');

  if (reduceMotion) degrade('reduceMotion');
  else clearDegrade('reduceMotion');

  // Increase Contrast 的「玻璃切 regular / 提高不透明度」属 P1 视觉接线；
  // P0 已交付 4 套色 token + 开关 + colors.ts 订阅（02 §5.1）。
  // Dim Flashing Lights / Assistive Access 由业务组件读取开关降级特效，不改玻璃参数。
}

/** 全量策略应用（可供 P1 的启动流程显式调用） */
export function syncA11yGlassPolicy(): void {
  applyA11yGlassPolicy(useA11yStore.getState());
}

// 任一开关变化 → 重新应用降级策略（不产生视图树重建）。
useA11yStore.subscribe((state, previous) => {
  if (
    state.reduceTransparency === previous.reduceTransparency &&
    state.increaseContrast === previous.increaseContrast &&
    state.reduceMotion === previous.reduceMotion &&
    state.systemReduceTransparency === previous.systemReduceTransparency &&
    state.systemReduceMotion === previous.systemReduceMotion
  ) {
    return;
  }
  applyA11yGlassPolicy(state);
});

/**
 * RN 0.81.5 的 AccessibilityInfo 未暴露「Increase Contrast / Dim Flashing Lights」专有 API：
 * - isBoldTextEnabled / isGrayscaleEnabled 作为高对比需求的启发式读数登记；
 * - 真正的 4 套色切换由 App 内 increaseContrast 开关驱动（colors.ts 订阅）。
 * 下列窄接口用于兼容不同 RN 小版本（能力缺失时静默跳过，不抛错）。
 */
interface AccessibilityInfoLike {
  isReduceMotionEnabled?: () => Promise<boolean>;
  isReduceTransparencyEnabled?: () => Promise<boolean>;
  isBoldTextEnabled?: () => Promise<boolean>;
  isGrayscaleEnabled?: () => Promise<boolean>;
  addEventListener?: (event: string, handler: (value: boolean) => void) => unknown;
}

const a11yInfo = AccessibilityInfo as unknown as AccessibilityInfoLike;

function setSystemFlagSafe(key: keyof A11ySystemFlags, value: boolean): void {
  useA11yStore.getState().setSystemFlag(key, value);
}

function readSystemFlagSafe(
  key: keyof A11ySystemFlags,
  read: () => Promise<boolean> | undefined,
): void {
  try {
    const pending = read();
    if (!pending || typeof pending.then !== 'function') return;
    pending
      .then((value) => setSystemFlagSafe(key, Boolean(value)))
      .catch(() => {
        // 能力不可用：保持默认 false，由 App 内开关兜底
      });
  } catch {
    // 当前 RN 版本无此 API：忽略
  }
}

function bindSystemEvent(event: string, key: keyof A11ySystemFlags): void {
  if (typeof a11yInfo.addEventListener !== 'function') return;
  try {
    a11yInfo.addEventListener(event, (value: boolean) => setSystemFlagSafe(key, Boolean(value)));
  } catch {
    // 该事件名在当前版本不存在：忽略，仍保留首次读取结果
  }
}

/**
 * 模块加载即注册系统能力同步（对齐 src/store/index.ts 中 announcement store 的模块级初始化写法）。
 * App.tsx 在 P0 冻结不改，故不用 useEffect 挂载；P1 可另外调用 syncA11yGlassPolicy() 显式刷新。
 */
function initA11ySystemSync(): void {
  readSystemFlagSafe('systemReduceMotion', () => a11yInfo.isReduceMotionEnabled?.());
  readSystemFlagSafe('systemReduceTransparency', () => a11yInfo.isReduceTransparencyEnabled?.());
  readSystemFlagSafe('systemBoldText', () => a11yInfo.isBoldTextEnabled?.());
  readSystemFlagSafe('systemGrayscale', () => a11yInfo.isGrayscaleEnabled?.());

  bindSystemEvent('reduceMotionChanged', 'systemReduceMotion');
  bindSystemEvent('reduceTransparencyChanged', 'systemReduceTransparency');
  bindSystemEvent('boldTextChanged', 'systemBoldText');
  bindSystemEvent('grayscaleChanged', 'systemGrayscale');

  applyA11yGlassPolicy(useA11yStore.getState());
}

initA11ySystemSync();
