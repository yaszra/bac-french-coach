"use client";

import { forwardRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { useFieldControl } from "./Field";
import { resolveControlSize, type ControlSize } from "./size";
import styles from "./Textarea.module.css";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly size?: ControlSize | undefined;
  readonly invalid?: boolean | undefined;
  /** Shows a decorative "used / maxLength" counter. Needs `maxLength`. */
  readonly counter?: boolean | undefined;
  readonly fieldClassName?: string | undefined;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    size = "md",
    invalid,
    counter = false,
    className,
    fieldClassName,
    disabled,
    maxLength,
    value,
    defaultValue,
    onChange,
    ...rest
  },
  ref,
) {
  const { tier } = useSurface();
  const field = useFieldControl();
  const resolved = resolveControlSize(size, tier);
  const isInvalid = invalid ?? (field?.["aria-invalid"] === true);

  const [uncontrolledCount, setUncontrolledCount] = useState(() => String(defaultValue ?? "").length);
  const used = value === undefined ? uncontrolledCount : String(value).length;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    if (value === undefined) setUncontrolledCount(event.target.value.length);
    onChange?.(event);
  };

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
      <textarea
        ref={ref}
        disabled={disabled}
        className={cx(styles.field, fieldClassName)}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(value === undefined ? {} : { value })}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        onChange={handleChange}
        {...(field === null ? {} : field)}
        {...(isInvalid ? { "aria-invalid": true } : {})}
        {...rest}
      />
      {counter && maxLength !== undefined ? (
        <span className={cx(styles.counter, used > maxLength && styles.counterOver)} aria-hidden="true">
          {used} / {maxLength}
        </span>
      ) : null}
    </span>
  );
});
