import { KeyboardEvent } from "react";

/**
 * Keyboard-activation handler for non-native interactive elements (a `div` /
 * `Stack` carrying `role="button"`). Invokes `handler` on Enter or Space and
 * prevents Space's default page scroll, matching how a native button responds —
 * so click-only affordances stay operable for keyboard and screen-reader users.
 *
 * Usage: `onKeyDown={onEnterOrSpace(() => doThing())}`.
 */
export const onEnterOrSpace =
  (handler: () => void) =>
  (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
