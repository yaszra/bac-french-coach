import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process. In development Next.js reloads modules, so the
 * client is stashed on globalThis to avoid exhausting connections.
 *
 * This client connects as the RUNTIME role (`itqan_app`), which has no
 * BYPASSRLS. Every tenant-owned query must go through `withTenant()`; a query
 * issued without tenant context returns zero rows by policy, not by accident.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Db = PrismaClient;
