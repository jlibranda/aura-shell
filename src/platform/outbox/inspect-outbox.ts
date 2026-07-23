import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaOutboxRepository } from "@/platform/outbox/prisma-outbox-repository";

/** Server-only operational snapshot. It intentionally exposes no payloads, leases, or error text. */
export async function inspectOutbox(): Promise<Readonly<Record<string, number>>> {
  const rows = await new PrismaOutboxRepository(getPrismaClient()).inspect();
  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.state] = (summary[row.state] ?? 0) + 1;
    return summary;
  }, {});
}
