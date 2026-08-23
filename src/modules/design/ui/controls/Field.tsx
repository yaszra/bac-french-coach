"use client";

import { createContext, forwardRef, useContext, useId, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../display/cx";
import shared from "../display/shared.module.css";
import styles from "./Field.module.css";

/** Everything a control needs to be correctly wired to its label and messages. */
export type FieldControlProps = {
  readonly id: string;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": true | undefined;
  readonly required: boolean | undefined;
};

const FieldContext = createContext<FieldControlProps | null>(null);

/**
 * Read by Input, Textarea and Select so that nesting them in a Field is enough.
 * Returns null outside a Field — a bare control is legal, just unlabelled by us.
 */
export function useFieldControl(): FieldControlProps | null {
  return useContext(FieldContext);
}

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly label: string;
  readonly description?: string | undefined;
  /** Present means invalid: it sets aria-invalid and is announced politely. */
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  /** Keeps the label in the accessibility tree while hiding it visually. */
  readonly hideLabel?: boolean | undefined;
  /** Overrides the generated control id. */
  readonly controlId?: string | undefined;
  readonly children: ReactNode | ((control: FieldControlProps) => ReactNode);
};

/**
 * The label / description / error wrapper. It owns the ids so no screen has to
 * invent them, and it is the only correct way to put a control on a page.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, description, error, required, hideLabel = false, controlId, className, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = controlId ?? `${generatedId}-control`;
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;

  const describedBy =
    [description === undefined ? null : descriptionId, error === undefined ? null : errorId]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined;

  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error === undefined ? undefined : true,
    required: required === true ? true : undefined,
  };

  return (
    <div ref={ref} className={cx(styles.root, className)} {...rest}>
      <label className={cx(styles.label, hideLabel && shared.visuallyHidden)} htmlFor={id}>
        {label}
        {required === true ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {description === undefined ? null : (
        <p className={styles.description} id={descriptionId}>
          {description}
        </p>
      )}
      <FieldContext.Provider value={control}>
        {typeof children === "function" ? children(control) : children}
      </FieldContext.Provider>
      <div className={styles.errorSlot} aria-live="polite">
        {error === undefined ? null : (
          <p className={styles.error} id={errorId}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
});
