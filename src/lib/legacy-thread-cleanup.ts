import { db } from "@/lib/db";

let cleanupPromise: Promise<void> | null = null;

export async function discardLegacyThreads(): Promise<void> {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      const deleted = await db.conversationThread.deleteMany({
        where: { userId: null },
      });

      if (deleted.count > 0) {
        console.info(`[legacy-thread-cleanup] discarded ${deleted.count} unowned thread(s).`);
      }
    })().catch((error) => {
      cleanupPromise = null;
      throw error;
    });
  }

  await cleanupPromise;
}

export function resetLegacyThreadCleanupForTests() {
  cleanupPromise = null;
}
