import type { MathResult } from "@/lib/math-solver";
import type { IntegralJob } from "@/workers/integral.worker";

export const INTEGRAL_TIMEOUT_MS = 7000;

type Job = DistributiveOmit<IntegralJob, "id">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

let worker: Worker | null = null;
const cancels = new Set<() => void>();
let nextId = 1;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("../workers/integral.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

function dropWorker() {
  worker?.terminate();
  worker = null;
}

/** Settings contain functions (setters) that can't be cloned — keep plain data only.
 *  (Only used for the settings object; numbers like Infinity must not go through JSON.) */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Runs an integral solver off the main thread with a hard time limit.
 * If it takes longer than `timeoutMs`, the worker is killed and a friendly
 * "too complex" result is returned, so the page never freezes.
 * A newer call cancels any older one still running.
 */
export function runIntegral(job: Job, input: string, timeoutMs = INTEGRAL_TIMEOUT_MS): Promise<MathResult> {
  cancels.forEach((c) => c()); // older in-flight request is superseded
  dropWorker();
  const id = nextId++;
  const w = getWorker();
  return new Promise<MathResult>((resolve) => {
    let done = false;
    const finish = (r: MathResult) => {
      if (done) return;
      done = true;
      cancels.delete(cancel);
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      resolve(r);
    };
    const cancel = () => finish({ input, result: "", steps: [], error: "__cancelled__" });
    cancels.add(cancel);
    const timer = setTimeout(() => {
      if (worker === w) dropWorker();
      finish({
        input,
        result: "",
        steps: [],
        error: `This integral is too complex to solve in ${timeoutMs / 1000} seconds. Try a simpler form, split it into parts, or use Definite Integration for a numeric answer.`,
      });
    }, timeoutMs);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      if (e.data.failure) finish({ input, result: "", steps: [], error: "Could not solve this integral." });
      else finish(e.data.result as MathResult);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", () => finish({ input, result: "", steps: [], error: "Could not solve this integral." }), { once: true });
    w.postMessage({ id, ...job } as IntegralJob);
  });
}

export const CANCELLED = "__cancelled__";
