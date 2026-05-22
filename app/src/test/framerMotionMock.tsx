import { createElement, forwardRef, type ReactNode } from "react";

/**
 * Test-only stub for framer-motion. Replaces every `motion.X` element with a
 * plain X, drops `layout`/`transition`/`animate`/`initial`/`exit`/`whileHover`
 * props, and makes `AnimatePresence` + `LayoutGroup` + `MotionConfig`
 * transparent. Without this, framer-motion's continuous `layout`
 * measurements + `repeat: Infinity` animations pin the test worker at 100%
 * CPU in jsdom (no requestAnimationFrame throttling).
 */

const MOTION_PROPS = new Set([
  "animate",
  "initial",
  "exit",
  "transition",
  "layout",
  "layoutId",
  "layoutDependency",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "viewport",
  "variants",
]);

function stripMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!MOTION_PROPS.has(k)) out[k] = v;
  }
  return out;
}

type MotionLikeProps = { children?: ReactNode } & Record<string, unknown>;

function makeComponent(tag: string) {
  const Component = forwardRef<HTMLElement, MotionLikeProps>(function MotionComponent(props, ref) {
    const { children, ...rest } = props;
    const safeProps = stripMotionProps(rest);
    return createElement(tag, { ...safeProps, ref }, children as ReactNode);
  });
  Component.displayName = `motion.${tag}`;
  return Component;
}

const motionCache = new Map<string, ReturnType<typeof makeComponent>>();
export const motion = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (!motionCache.has(prop)) motionCache.set(prop, makeComponent(prop));
      return motionCache.get(prop);
    },
  }
) as Record<string, ReturnType<typeof makeComponent>>;

export function AnimatePresence({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function LayoutGroup({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function MotionConfig({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function useReducedMotion(): boolean {
  return true;
}

export function useAnimation() {
  return {
    start: () => Promise.resolve(),
    stop: () => undefined,
    set: () => undefined,
  };
}

export function useMotionValue(value: unknown) {
  return {
    get: () => value,
    set: () => undefined,
    on: () => () => undefined,
  };
}
