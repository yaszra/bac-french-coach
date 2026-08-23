"use client";

/* Takes a filter callback from the route. */

/**
 * The memory map.
 *
 * A calm grid of the whole muṣḥaf. Colour is an accent on top of the
 * glyph, never the carrier of meaning — the map has to be readable in
 * greyscale, in print, and by a teacher who cannot distinguish sage from
 * copper.
 */
import type { MemoryMap as Map, PageCell } from "../../core/memory-map.js";
import { useLocale } from "../i18n/context.js";

export interface MemoryMapProps {
  map: Map;
  onSelectPage?: (pageNumber: number) => void;
}

function Cell({
  cell,
  onSelect,
}: {
  cell: PageCell;
  onSelect?: (pageNumber: number) => void;
}) {
  const label = `Page ${cell.pageNumber}. ${cell.summary}`;
  return (
    <li className="athar-map__cell" data-status={cell.status}>
      <button
        type="button"
        className="athar-map__page"
        // The full summary is the accessible name: a screen-reader user
        // gets the same information a sighted user gets from the tooltip.
        aria-label={label}
        title={label}
        onClick={onSelect ? () => onSelect(cell.pageNumber) : undefined}
        disabled={!onSelect}
      >
        <span className="athar-map__glyph" aria-hidden="true">
          {cell.glyph.trim() || " "}
        </span>
        <span className="athar-map__number" aria-hidden="true">
          {cell.pageNumber}
        </span>
      </button>
    </li>
  );
}

export function MemoryMap({ map, onSelectPage }: MemoryMapProps) {
  const { t } = useLocale();
  return (
    <section className="athar-map" aria-labelledby="athar-map-heading">
      <h2 id="athar-map-heading">{t("nav.progress")}</h2>

      {/* The denominator is always present. */}
      <p className="athar-map__coverage">
        {t("evidence.ofTotal", { count: map.startedPages, total: map.totalPages })}
      </p>

      <ul className="athar-map__legend" aria-label="Legend">
        {map.legend.map((entry) => (
          <li key={entry.status} data-status={entry.status}>
            <span className="athar-map__glyph" aria-hidden="true">
              {entry.glyph.trim() || " "}
            </span>
            <span>{entry.meaning}</span>
          </li>
        ))}
      </ul>

      <ol className="athar-map__grid">
        {map.cells.map((cell) => (
          <Cell
            key={cell.pageNumber}
            cell={cell}
            {...(onSelectPage ? { onSelect: onSelectPage } : {})}
          />
        ))}
      </ol>

      <section aria-labelledby="athar-map-load">
        <h3 id="athar-map-load">Expected review load</h3>
        <ul className="athar-map__load">
          {map.reviewLoadNextWeek.map((day) => (
            <li key={day.dayOffset}>
              {day.dayOffset === 0 ? "Today" : `In ${day.dayOffset} days`}:{" "}
              {day.due === 0 ? "nothing due" : `${day.due} due`}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
