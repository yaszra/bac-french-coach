"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once the component is running in the browser.
 *
 * Overlays render into <body>, which does not exist while the page is being
 * rendered on the server. This is the hydration-safe way to ask — no state, no
 * effect, no cascading render.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
