declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

/**
 * 제한 시간을 재는 시계. 제품은 진짜 시계(`realClock`)를 쓴다.
 * 시험은 `ManualClock`을 넣어, 시험이 시간을 옮길 때만 제한 시간이 지나게 한다.
 * 그러면 기기가 느려도 "늦어서 생기는 일"이 저절로 일어나지 않는다(flaky 시험 막기).
 */
export interface Clock {
  /** 지금 시각(ms) */
  now(): number;
  /** `ms` 뒤에 `fn`을 부른다. 끄는 함수를 돌려준다 */
  after(ms: number, fn: () => void): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

/** 시험용 시계: `advance`로 옮길 때만 흐른다 */
export class ManualClock implements Clock {
  private time = 0;
  private nextId = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  after(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return () => this.timers.delete(id);
  }

  /** 시간을 옮기며 그 사이에 닿은 일을 시각 순서대로 부른다(부른 일이 새로 건 일도) */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let due: [number, { at: number; fn: () => void }] | null = null;
      for (const entry of this.timers)
        if (entry[1].at <= end && (!due || entry[1].at < due[1].at))
          due = entry;
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = Math.max(this.time, due[1].at);
      due[1].fn();
    }
    this.time = end;
  }

  /** 걸려 있는 일의 수 */
  pending(): number {
    return this.timers.size;
  }
}
