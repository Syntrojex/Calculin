/// <reference lib="webworker" />
import { solveDefiniteIntegral, solveIndefiniteIntegral, solveDoubleIntegral } from "@/lib/math-solver";

export type IntegralJob =
  | { id: number; kind: "indefinite"; args: Parameters<typeof solveIndefiniteIntegral> }
  | { id: number; kind: "definite"; args: Parameters<typeof solveDefiniteIntegral> }
  | { id: number; kind: "double"; args: Parameters<typeof solveDoubleIntegral> };

self.onmessage = (e: MessageEvent<IntegralJob>) => {
  const job = e.data;
  try {
    let result;
    if (job.kind === "indefinite") result = solveIndefiniteIntegral(...job.args);
    else if (job.kind === "definite") result = solveDefiniteIntegral(...job.args);
    else result = solveDoubleIntegral(...job.args);
    (self as unknown as Worker).postMessage({ id: job.id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: job.id, failure: String(err) });
  }
};
