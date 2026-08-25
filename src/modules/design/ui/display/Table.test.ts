// @vitest-environment jsdom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { h, renderSurface } from "./testing";
import { EmptyState } from "./EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
  type SortDirection,
} from "./Table";
import styles from "./Table.module.css";

afterEach(cleanup);

function build(sort: SortDirection, onSort?: (next: Exclude<SortDirection, "none">) => void): ReactElement {
  return h(
    Table,
    { caption: "Students needing review" },
    h(
      TableHead,
      null,
      h(
        TableRow,
        null,
        h(TableHeaderCell, { sortable: true, sortDirection: sort, ...(onSort ? { onSort } : {}) }, "Student"),
        h(TableHeaderCell, { numeric: true }, "Due"),
      ),
    ),
    h(
      TableBody,
      null,
      h(TableRow, null, h(TableCell, null, "Maryam"), h(TableCell, { numeric: true }, "12")),
    ),
  );
}

describe("Table", () => {
  it("requires and renders a caption", () => {
    renderSurface(build("none"));
    expect(screen.getByRole("table", { name: "Students needing review" })).toBeDefined();
  });

  it("sets aria-sort on the sorted column only", () => {
    renderSurface(build("ascending"));
    const [sorted, plain] = screen.getAllByRole("columnheader");
    expect(sorted?.getAttribute("aria-sort")).toBe("ascending");
    expect(plain?.getAttribute("aria-sort")).toBeNull();
  });

  it("marks an unsorted sortable column as none", () => {
    renderSurface(build("none"));
    expect(screen.getAllByRole("columnheader")[0]?.getAttribute("aria-sort")).toBe("none");
  });

  it("puts a keyboard-operable button in the sortable header", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    renderSurface(build("ascending", onSort));

    const button = screen.getByRole("button", { name: "Student" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onSort).toHaveBeenCalledWith("descending");

    await user.click(button);
    expect(onSort).toHaveBeenCalledTimes(2);
  });

  it("aligns numeric columns to the end edge with tabular figures", () => {
    renderSurface(build("none"));
    const numericHeader = screen.getAllByRole("columnheader")[1];
    expect(numericHeader?.className).toContain(styles.numeric);
    expect(screen.getByText("12").className).toContain(styles.numeric);
  });

  it("offers an empty slot that spans the table", () => {
    renderSurface(
      h(
        Table,
        { caption: "Students needing review" },
        h(
          TableHead,
          null,
          h(TableRow, null, h(TableHeaderCell, null, "Student"), h(TableHeaderCell, null, "Due")),
        ),
        h(TableBody, null, h(TableEmpty, { colSpan: 2 }, h(EmptyState, { variant: "not-yet-recorded" }))),
      ),
    );
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("2");
  });
});
