"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toast, type ToastInput, type ToastRecord } from "./Toast";
import styles from "./Toast.module.css";

/** Three at a time. A fourth notice means the interface is talking too much. */
export const MAX_TOASTS = 3;

export type ToastApi = {
  readonly toasts: readonly ToastRecord[];
  readonly push: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
  readonly clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The polite live region every toast is announced through.
 *
 * The region itself is always in the document, empty, so a notice added later
 * is actually spoken. Rendered in a portal at --z-toast, above the app but
 * below nothing sacred: the muṣḥaf page never uses it.
 */
export function ToastRegion({ children }: { readonly children?: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(0);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setToasts((current) => [...current, { ...toast, id }].slice(-MAX_TOASTS));
    return id;
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  const api = useMemo<ToastApi>(
    () => ({ toasts, push, dismiss, clear }),
    [toasts, push, dismiss, clear],
  );

  const region = (
    <ol className={styles.region} aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <li key={toast.id} className={styles.item}>
          <Toast {...toast} onDismiss={dismiss} />
        </li>
      ))}
    </ol>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted ? createPortal(region, document.body) : null}
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToasts must be used inside <ToastRegion>");
  return context;
}
