"use client";

/* The locale provider holds React context, which only exists on the
 * client. Components that consume it are client components by extension —
 * they are presentational, so that is where they belong. */

/**
 * Locale context.
 *
 * Direction is derived from the locale, never set by hand at a call site,
 * so a new screen cannot forget to mirror.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  directionOf,
  translate,
  type Locale,
  type MessageKey,
} from "./messages.js";

interface LocaleValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;
}

const LocaleContext = createContext<LocaleValue>({
  locale: "en",
  dir: "ltr",
  t: (key, values) => translate("en", key, values),
});

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value: LocaleValue = {
    locale,
    dir: directionOf(locale),
    t: (key, values) => translate(locale, key, values),
  };
  return (
    <LocaleContext.Provider value={value}>
      <div dir={value.dir} lang={locale} data-locale={locale}>
        {children}
      </div>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}
