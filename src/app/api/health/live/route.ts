export const dynamic = "force-dynamic";

/**
 * Liveness only proves the process is up and answering HTTP. Deliberately no
 * database, repository, or Prisma dependency — a healthy-but-unready database
 * must never make the orchestrator restart the process.
 */
export async function GET(): Promise<Response> {
  return Response.json({ status: "live", timestamp: new Date().toISOString() }, { status: 200 });
}
