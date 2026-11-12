import { Queue, Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { processAbandonedCartNudges } from "./cart-nudges";

const QUEUE = "whatsapp-jobs";

export function getWhatsAppQueue() {
  return new Queue(QUEUE, { connection: getRedis() });
}

export function startWhatsAppWorker() {
  const worker = new Worker(
    QUEUE,
    async (job) => {
      if (job.name === "abandoned_cart_nudges") {
        return processAbandonedCartNudges({
          storeId: job.data?.storeId,
          idleMs: job.data?.idleMs,
        });
      }
      throw new Error(`Unknown whatsapp job: ${job.name}`);
    },
    { connection: getRedis() },
  );

  worker.on("failed", (job, err) => {
    logger.error("whatsapp.job_failed", {
      jobId: job?.id,
      name: job?.name,
      error: err.message,
    });
  });

  return worker;
}

/** Enqueue periodic-style nudge scan (call from cron or manually). */
export async function enqueueAbandonedCartScan(data?: {
  storeId?: string;
  idleMs?: number;
}) {
  const queue = getWhatsAppQueue();
  return queue.add("abandoned_cart_nudges", data || {}, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
