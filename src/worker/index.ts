import { startAIWorker } from "@/lib/ai/jobs";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

async function main() {
  await getRedis().connect().catch(() => undefined);
  startAIWorker();
  logger.info("worker.started", { queues: ["ai-jobs"] });
}

main().catch((err) => {
  logger.error("worker.boot_failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
