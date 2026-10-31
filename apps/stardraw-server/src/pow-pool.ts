import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";
import { checkPow, type PowParams } from "@mighty/stardraw-core";

/**
 * 작업 증명 확인(Argon2id 16MB)을 어디서 돌릴지. 시험과 개발은 같은 스레드에서(`inlinePowChecker`),
 * 운영은 작업 스레드에서(`WorkerPowChecker`) 돌린다(D2). Argon2(hash-wasm)는 계산하는 동안 그 스레드를 붙잡아,
 * 같은 스레드에서 돌리면 엉터리 응모 홍수 동안 정상 응모·봉인·추첨까지 줄을 섰다(가짜 1000건 뒤 정상 응모 9.8초).
 * 작업 스레드로 옮기면 이벤트 루프는 싼 확인과 봉인을 계속 돌리고, 줄이 차면 Gate가 곧바로 503을 낸다
 */
export interface PowJob {
  challenge: Uint8Array;
  content: Uint8Array;
  nonce: number;
  target: number;
  params: PowParams;
}

export interface PowChecker {
  check(job: PowJob): Promise<boolean>;
  close?(): void;
}

export const inlinePowChecker: PowChecker = {
  check: (j) => checkPow(j.challenge, j.content, j.nonce, j.target, j.params),
};

const ROLE = "stardraw-pow";

/** 작업 스레드 하나에 일 하나씩. 스레드가 죽으면 새로 띄우고 맡았던 일은 실패로 돌린다 */
export class WorkerPowChecker implements PowChecker {
  private readonly idle: Worker[] = [];
  private readonly waiting: ((w: Worker) => void)[] = [];
  private readonly all = new Set<Worker>();
  private closed = false;

  constructor(
    private readonly entry: URL,
    size: number,
  ) {
    for (let i = 0; i < Math.max(1, size); i++) this.spawn();
  }

  private spawn(): void {
    if (this.closed) return;
    const w = new Worker(this.entry, { workerData: { role: ROLE } });
    w.unref();
    this.all.add(w);
    w.on("error", () => {});
    w.on("exit", () => {
      this.all.delete(w);
      const at = this.idle.indexOf(w);
      if (at >= 0) this.idle.splice(at, 1);
      this.spawn();
    });
    this.release(w);
  }

  private release(w: Worker): void {
    const next = this.waiting.shift();
    if (next) next(w);
    else this.idle.push(w);
  }

  private take(): Promise<Worker> {
    const w = this.idle.shift();
    if (w) return Promise.resolve(w);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  async check(job: PowJob): Promise<boolean> {
    const w = await this.take();
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const onMessage = (ok: unknown) => {
          cleanup();
          resolve(ok === true);
        };
        const onExit = () => {
          cleanup();
          reject(new Error("작업 증명 스레드가 멈췄습니다"));
        };
        const cleanup = () => {
          w.off("message", onMessage);
          w.off("exit", onExit);
        };
        w.on("message", onMessage);
        w.on("exit", onExit);
        w.postMessage(job);
      });
    } finally {
      if (this.all.has(w)) this.release(w);
    }
  }

  close(): void {
    this.closed = true;
    for (const w of this.all) void w.terminate();
  }
}

/** 이 파일이 작업 스레드로 불렸으면 일을 받는다(서버 번들 하나가 본 스레드와 작업 스레드를 함께 맡는다) */
export function isPowWorker(): boolean {
  return !isMainThread && (workerData as { role?: string })?.role === ROLE;
}

export function runPowWorker(): void {
  parentPort?.on("message", (job: PowJob) => {
    void inlinePowChecker.check(job).then(
      (ok) => parentPort?.postMessage(ok),
      () => parentPort?.postMessage(false),
    );
  });
}
