"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { useFieldControl } from "./Field";
import { resolveControlSize, type ControlSize } from "./size";
import styles from "./Input.module.css";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  readonly size?: ControlSize | undefined;
  /** Overrides the Field's error state, e.g. for live validation. */
  readonly invalid?: boolean | undefined;
  readonly prefix?: ReactNode | undefined;
  readonly suffix?: ReactNode | undefined;
  /** Applied to the outer frame; `className` goes there too. */
  readonly fieldClassName?: string | undefined;
};

/**
 * One of the four places in the repo where a raw <input> may exist. Everywhere
 * else, reach for this inside a <Field>.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", invalid, prefix, suffix, className, fieldClassName, type = "text", disabled, ...rest },
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
      {prefix === undefined ? null : (
        <span className={styles.affix} aria-hidden="true">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        className={cx(styles.field, fieldClassName)}
        {...(field === null ? {} : field)}
        {...(isInvalid ? { "aria-invalid": true } : {})}
        {...rest}
      />
      {suffix === undefined ? null : (
        <span className={styles.affix} aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  );
});
