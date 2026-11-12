import { startAIWorker } from "@/lib/ai/jobs";
import { startWhatsAppWorker } from "@/lib/messaging/worker";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

async function main() {
  await getRedis().connect().catch(() => undefined);
  startAIWorker();
  startWhatsAppWorker();
  logger.info("worker.started", { queues: ["ai-jobs", "whatsapp-jobs"] });
}

main().catch((err) => {
  logger.error("worker.boot_failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
