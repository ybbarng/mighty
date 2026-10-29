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

/** 동시 실행 수와 기다리는 줄 상한. 줄이 꽉 차면 곧바로 거절한다(서버가 계산하다 쓰러지지 않게) */
export class Gate {
  private running = 0;
  private waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly queue: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      if (this.waiting.length >= this.queue) throw new BusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}

export class BusyError extends Error {
  constructor() {
    super("지금 응모가 몰려 있습니다. 잠시 뒤 다시 내 주세요");
  }
}
