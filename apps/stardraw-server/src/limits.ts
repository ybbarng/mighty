/**
 * 상한(docs/36 5절, 8-1 P1). IP는 메모리에서만 세고 저장하지 않는다(재시작하면 비운다).
 * 같은 공인 IP 앞부분(IPv4 /24, IPv6 /48)을 한곳으로 본다.
 */

/** IP 앞부분: IPv4는 앞 세 칸, IPv6는 앞 세 묶음(/48). IPv4가 섞인 IPv6(::ffff:1.2.3.4)는 IPv4로 */
export function ipPrefix(ip: string): string {
  const v4 = ip.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  const lower = ip.toLowerCase();
  if (!lower.includes(":")) return lower;
  // :: 를 펼쳐 여덟 묶음으로
  const [head = "", tail = ""] = lower.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = lower.includes("::")
    ? [...h, ...new Array<string>(8 - h.length - t.length).fill("0"), ...t]
    : h;
  return groups
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

/** (종류, 구간, IP 앞부분)마다 센다. 지난 구간은 새 구간이 시작될 때 지운다 */
export class Counters {
  private counts = new Map<string, number>();
  private windows = new Map<string, string>();

  count(kind: string, window: string, prefix: string): number {
    this.roll(kind, window);
    return this.counts.get(`${kind}|${window}|${prefix}`) ?? 0;
  }

  add(kind: string, window: string, prefix: string): void {
    this.roll(kind, window);
    const key = `${kind}|${window}|${prefix}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  private roll(kind: string, window: string): void {
    if (this.windows.get(kind) === window) return;
    this.windows.set(kind, window);
    for (const key of [...this.counts.keys()])
      if (key.startsWith(`${kind}|`)) this.counts.delete(key);
  }
}

interface Waiter {
  start: () => void;
  cancelTimer: () => void;
}

/**
 * 동시 실행 수와 기다리는 줄 상한. 줄이 꽉 차거나 줄에서 `maxWaitMs`를 넘게 기다리면 거절한다
 * (서버가 계산하다 쓰러지지 않게, 화면은 503을 받으면 잠시 뒤 다시 낸다, D2).
 * 줄은 둘이다: 소속 증서가 붙은 응모처럼 앞에 세울 일(`priority`)과 나머지. 앞줄을 먼저 꺼내고 줄마다 상한을 따로 둔다.
 * 그래서 익명 응모가 몰려도 상품 대상 응모는 밀리지 않는다
 */
export class Gate {
  private running = 0;
  private readonly waiting: { high: Waiter[]; normal: Waiter[] } = {
    high: [],
    normal: [],
  };

  constructor(
    private readonly concurrency: number,
    private readonly queue: number,
    private readonly timer?: {
      after: (ms: number, fn: () => void) => () => void;
      maxWaitMs: number;
    },
  ) {}

  async run<T>(
    fn: () => Promise<T>,
    options: { priority?: boolean } = {},
  ): Promise<T> {
    if (this.running >= this.concurrency) {
      const line = options.priority ? this.waiting.high : this.waiting.normal;
      if (line.length >= this.queue) throw new BusyError();
      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = { start: resolve, cancelTimer: () => {} };
        if (this.timer)
          waiter.cancelTimer = this.timer.after(this.timer.maxWaitMs, () => {
            const at = line.indexOf(waiter);
            if (at >= 0) line.splice(at, 1);
            reject(new BusyError());
          });
        line.push(waiter);
      });
    } else {
      this.running++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.high.shift() ?? this.waiting.normal.shift();
      if (next) {
        next.cancelTimer();
        next.start();
      } else this.running--;
    }
  }
}

/**
 * 작업 증명에서 떨어진 응모·등록을 회차 동안 기억한다(D2). Argon2는 서버에서 가장 비싼 계산인데, 실패를 기억하지 않으면
 * 공격자가 같은 본문을 공짜로 되풀이해 그때마다 계산을 시킬 수 있었다. 같은 본문은 계산 없이 거절하고,
 * 같은 열쇠는 `maxPerKey`번 떨어지면 그 회차 동안 더 계산하지 않는다. 정상 사용자는 한 번에 맞으므로 비용이 없다.
 * 메모리는 회차가 바뀌면 비우고, 한 회차에 `cap`개까지만 둔다(넘치면 가장 오래된 것부터 잊는다)
 */
export class PowFailures {
  private window = "";
  private readonly bodies = new Set<string>();
  private readonly keys = new Map<string, number>();

  constructor(
    private readonly maxPerKey = 3,
    private readonly cap = 50_000,
  ) {}

  private roll(window: string): void {
    if (this.window === window) return;
    this.window = window;
    this.bodies.clear();
    this.keys.clear();
  }

  /** 계산하지 않고 거절할 까닭(없으면 null) */
  blocked(window: string, body: string, key: string): string | null {
    this.roll(window);
    if (this.bodies.has(body)) return "이미 계산이 맞지 않은 응모입니다";
    if ((this.keys.get(key) ?? 0) >= this.maxPerKey)
      return "이 열쇠의 계산이 여러 번 맞지 않아 이번 회차에는 더 받지 않습니다";
    return null;
  }

  failed(window: string, body: string, key: string): void {
    this.roll(window);
    if (this.bodies.size >= this.cap) {
      const oldest = this.bodies.values().next().value;
      if (oldest !== undefined) this.bodies.delete(oldest);
    }
    this.bodies.add(body);
    if (this.keys.size < this.cap || this.keys.has(key))
      this.keys.set(key, (this.keys.get(key) ?? 0) + 1);
  }
}

export class BusyError extends Error {
  constructor() {
    super("지금 응모가 몰려 있습니다. 잠시 뒤 다시 내 주세요");
  }
}
