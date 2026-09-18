/** Policy-only execution, with no workflow engine or web lifecycle dependency. */
export interface PolicyQueueRun {
  id: string;
  input: Record<string, unknown> | null;
}

export interface PolicyWorkerDependencies {
  claim(): Promise<PolicyQueueRun | null>;
  execute(run: PolicyQueueRun): Promise<void>;
  renew(run: PolicyQueueRun): Promise<boolean>;
  clear(run: PolicyQueueRun): Promise<void>;
  recover(run: PolicyQueueRun): Promise<void>;
  sweep(): Promise<unknown>;
  log(message: string): void;
}

export function createPolicyWorker(
  deps: PolicyWorkerDependencies,
  { pollMs = 1000, renewMs = 20_000, sweepMs = 30_000 } = {},
) {
  let stopping = false;
  let running = false;
  let active = false;
  let task: Promise<void> | undefined;
  let lastHealthyAt = 0;
  let completed = 0;

  async function loop() {
    let sweptAt = 0;
    while (!stopping) {
      try {
        if (Date.now() - sweptAt >= sweepMs) {
          await deps.sweep();
          sweptAt = Date.now();
        }
        const run = await deps.claim();
        lastHealthyAt = Date.now();
        if (!run) {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          continue;
        }
        active = true;
        let renewing = false;
        const heartbeat = setInterval(() => {
          if (renewing) return;
          renewing = true;
          void deps.renew(run).then((owned) => {
            if (owned) lastHealthyAt = Date.now();
          }).catch(() => deps.log('lease renewal failed')).finally(() => { renewing = false; });
        }, renewMs);
        try {
          await deps.execute(run);
          completed++;
        } catch {
          // Only the still-owned running envelope may be returned to pending.
          // Cancellation or a newer worker's claim must never be overwritten.
          deps.log('execution interrupted; returning the owned envelope for recovery');
          await deps.recover(run);
        } finally {
          clearInterval(heartbeat);
          active = false;
          await deps.clear(run);
        }
      } catch {
        deps.log('queue unavailable; retrying');
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    }
    running = false;
  }

  return {
    start() {
      if (running) return;
      stopping = false;
      running = true;
      task = loop();
    },
    async stop() {
      stopping = true;
      // Continue renewing the current lease while its stage drains.
      await task;
    },
    status() {
      return { running, stopping, active, completed, lastHealthyAt };
    },
  };
}
