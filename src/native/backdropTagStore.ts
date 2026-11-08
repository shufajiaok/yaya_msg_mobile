/**
 * backdropTagStore —— it.7 POC 模块级单例：GlassKitBackdrop 原生 tag 全局广播。
 *
 * App.tsx 内容层挂 GlassKitBackdrop 后把 findNodeHandle 的 tag 写进来；
 * AppTabBar 等拿不到 props 链的深层组件用 useBackdropTag() 订阅读取。
 * 最小实现（useSyncExternalStore，React 内置），不引额外依赖。
 */
import { useSyncExternalStore } from 'react';

let backdropTag: number | undefined;
const listeners = new Set<() => void>();

/** App.tsx 侧写入（tag 变化即广播；undefined = backdrop 已卸载）。 */
export function setGlobalBackdropTag(next: number | undefined) {
  if (backdropTag === next) return;
  backdropTag = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return backdropTag;
}

/** 订阅读取（AppTabBar 玻璃层用）。 */
export function useBackdropTag(): number | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
