"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { useFieldControl } from "./Field";
import { resolveControlSize, type ControlSize } from "./size";
import styles from "./Select.module.css";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  readonly size?: ControlSize | undefined;
  readonly invalid?: boolean | undefined;
  readonly fieldClassName?: string | undefined;
  readonly children: ReactNode;
};

/**
 * A native select — the platform's own list, which is why it works on a phone,
 * with a screen reader, and under a stylus. Only the chevron is ours.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid, className, fieldClassName, disabled, children, ...rest },
  ref,
) {
  const { tier } = useSurface();
  const field = useFieldControl();
  const resolved = resolveControlSize(size, tier);
  const isInvalid = invalid ?? (field?.["aria-invalid"] === true);

  return (
    <span
      className={cx(
        styles.shell,
        styles[resolved],
        isInvalid && styles.invalid,
        disabled === true && styles.disabled,
        className,
      )}
    >
      <select
        ref={ref}
        disabled={disabled}
        className={cx(styles.field, fieldClassName)}
        {...(field === null ? {} : field)}
        {...(isInvalid ? { "aria-invalid": true } : {})}
        {...rest}
      >
        {children}
      </select>
      <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <polyline points="2.5,4.5 6,8 9.5,4.5" />
      </svg>
    </span>
  );
});
