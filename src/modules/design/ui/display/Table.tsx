"use client";

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from "react";
import { cx } from "./cx";
import styles from "./Table.module.css";
import shared from "./shared.module.css";

export type SortDirection = "ascending" | "descending" | "none";

export type TableProps = Omit<TableHTMLAttributes<HTMLTableElement>, "children"> & {
  /** Required: a table without a caption is unusable by screen reader users. */
  readonly caption: string;
  /** Keeps the caption in the accessibility tree while hiding it visually. */
  readonly captionHidden?: boolean | undefined;
  /** A CSS length. Set it to make the sticky header actually stick. */
  readonly maxHeight?: string | undefined;
  readonly children: ReactNode;
};

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { caption, captionHidden = false, maxHeight, className, children, ...rest },
  ref,
) {
  return (
    <div
      className={styles.scroller}
      {...(maxHeight === undefined ? {} : { style: { maxBlockSize: maxHeight } })}
    >
      <table ref={ref} className={cx(styles.table, className)} {...rest}>
        <caption className={captionHidden ? shared.visuallyHidden : styles.caption}>{caption}</caption>
        {children}
      </table>
    </div>
  );
});

export type TableSectionProps = HTMLAttributes<HTMLTableSectionElement>;

export const TableHead = forwardRef<HTMLTableSectionElement, TableSectionProps>(function TableHead(
  { className, ...rest },
  ref,
) {
  return <thead ref={ref} className={cx(styles.head, className)} {...rest} />;
});

export const TableBody = forwardRef<HTMLTableSectionElement, TableSectionProps>(function TableBody(
  { className, ...rest },
  ref,
) {
  return <tbody ref={ref} className={className} {...rest} />;
});

export type TableRowProps = HTMLAttributes<HTMLTableRowElement>;

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { className, ...rest },
  ref,
) {
  return <tr ref={ref} className={cx(styles.row, className)} {...rest} />;
});

export type TableHeaderCellProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "onClick"> & {
  readonly numeric?: boolean | undefined;
  readonly sortable?: boolean | undefined;
  /** The current sort of THIS column. Every other column must be "none". */
  readonly sortDirection?: SortDirection | undefined;
  readonly onSort?: ((next: Exclude<SortDirection, "none">) => void) | undefined;
  readonly children: ReactNode;
};

export const TableHeaderCell = forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  function TableHeaderCell(
    { numeric = false, sortable = false, sortDirection = "none", onSort, className, children, ...rest },
    ref,
  ) {
    const content = (
      <span className={styles.headerContent}>
        {children}
        {sortable ? <SortMark direction={sortDirection} /> : null}
      </span>
    );

    return (
      <th
        ref={ref}
        scope="col"
        className={cx(styles.headerCell, numeric && styles.numeric, className)}
        {...(sortable ? { "aria-sort": sortDirection } : {})}
        {...rest}
      >
        {sortable ? (
          <button
            type="button"
            className={styles.sortButton}
            onClick={() => onSort?.(sortDirection === "ascending" ? "descending" : "ascending")}
          >
            {content}
          </button>
        ) : (
          content
        )}
      </th>
    );
  },
);

function SortMark({ direction }: { readonly direction: SortDirection }) {
  const active = direction !== "none";
  return (
    <svg
      className={cx(styles.sortMark, active && styles.sortMarkActive)}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      {direction === "descending" ? null : <polyline points="2.5,5 6,1.5 9.5,5" />}
      {direction === "ascending" ? null : <polyline points="2.5,7 6,10.5 9.5,7" />}
    </svg>
  );
}

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  readonly numeric?: boolean | undefined;
};

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { numeric = false, className, ...rest },
  ref,
) {
  return <td ref={ref} className={cx(styles.cell, numeric && styles.numeric, className)} {...rest} />;
});

export type TableEmptyProps = Omit<TdHTMLAttributes<HTMLTableCellElement>, "colSpan"> & {
  /** Must match the column count, or the empty state will not span the table. */
  readonly colSpan: number;
  readonly children: ReactNode;
};

/** The empty slot: drop an <EmptyState> in here rather than an empty <tbody>. */
export const TableEmpty = forwardRef<HTMLTableCellElement, TableEmptyProps>(function TableEmpty(
  { colSpan, className, children, ...rest },
  ref,
) {
  return (
    <tr>
      <td ref={ref} colSpan={colSpan} className={cx(styles.emptyCell, className)} {...rest}>
        {children}
      </td>
    </tr>
  );
});
