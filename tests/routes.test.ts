/**
 * The route map — docs/02.
 *
 * Every route the information architecture promises has a page. A route
 * map that drifts from the filesystem is a design document nobody is
 * following.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Exactly the routes listed in docs/02-ia-routes.md. */
const ROUTES = {
  public: [
    "/",
    "/how-it-works",
    "/for-academies",
    "/trust",
    "/privacy",
    "/terms",
    "/login",
    "/forgot-password",
    "/accept-invite",
  ],
  learner: [
    "/learn/today",
    "/learn/session/[assignmentId]",
    "/learn/review",
    "/learn/memory-map",
    "/learn/reading",
  ],
  teacher: [
    "/teach/today",
    "/teach/learners",
    "/teach/learners/[learnerId]",
    "/teach/assign",
    "/teach/verify",
    "/teach/verify/[requestId]",
    "/teach/reports",
  ],
  parent: [
    "/family/today",
    "/family/children/[childId]",
    "/family/tasks",
    "/family/permissions",
  ],
  admin: [
    "/admin/people",
    "/admin/classes",
    "/admin/content",
    "/admin/content/approvals",
    "/admin/governance",
    "/admin/audit",
    "/admin/settings",
  ],
} as const;

const pagePath = (route: string) =>
  join("app", route === "/" ? "" : route.slice(1), "page.tsx");

describe("every documented route has a page", () => {
  for (const [group, routes] of Object.entries(ROUTES))
    it.each(routes as readonly string[])(`${group}: %s`, (route) => {
      expect(existsSync(pagePath(route)), `missing ${pagePath(route)}`).toBe(true);
    });
});

describe("the route map in the docs matches the filesystem", () => {
  it("lists every route that exists", () => {
    const doc = readFileSync("docs/02-ia-routes.md", "utf8");
    const all = Object.values(ROUTES).flat();
    const missing = all.filter((route) => !doc.includes(route));
    expect(missing, "routes not documented in docs/02").toEqual([]);
  });
});

describe("routes that touch learner data are dynamic, never statically cached", () => {
  const dataRoutes = [
    "/learn/today",
    "/learn/session/[assignmentId]",
    "/learn/review",
    "/learn/memory-map",
    "/teach/today",
    "/teach/learners",
    "/teach/learners/[learnerId]",
    "/teach/assign",
    "/teach/verify",
    "/teach/verify/[requestId]",
    "/family/today",
    "/family/children/[childId]",
    "/family/permissions",
    "/admin/audit",
    "/admin/governance",
    "/admin/content/approvals",
  ];

  it.each(dataRoutes)("%s opts out of static rendering", (route) => {
    const source = readFileSync(pagePath(route), "utf8");
    // A cached page could serve one tenant's data to another.
    expect(source, `${route} is missing "force-dynamic"`).toContain(
      'export const dynamic = "force-dynamic"',
    );
  });

  it.each(dataRoutes)("%s resolves the actor before rendering", (route) => {
    const source = readFileSync(pagePath(route), "utf8");
    expect(source, `${route} does not call requireActor`).toContain("requireActor");
  });
});

describe("public routes carry no learner data", () => {
  const publicRoutes = ROUTES.public.filter((r) => r !== "/login");

  it.each(publicRoutes)("%s makes no database or actor call", (route) => {
    const source = readFileSync(pagePath(route), "utf8");
    expect(source).not.toContain("requireActor");
    expect(source).not.toContain("getPool");
    expect(source).not.toContain("getDatabase");
  });
});

describe("no route embeds Qur'anic text", () => {
  it("holds across every page in the app directory", async () => {
    const { scanForArabicScript } = await import("../src/content/tripwire.js");
    const hits = scanForArabicScript(process.cwd(), "app");
    expect(hits).toEqual([]);
  });
});
