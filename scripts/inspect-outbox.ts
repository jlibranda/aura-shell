import { inspectOutbox } from "@/platform/outbox/inspect-outbox";

async function run(): Promise<void> { console.log(JSON.stringify({ outbox: await inspectOutbox() })); }
void run().catch(() => { console.error("Outbox inspection failed."); process.exitCode = 1; });
