/** 멘탈 포커 기기 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
declare function setTimeout(callback: () => void, ms: number): unknown;

import { deckFor, presetRules } from "@mighty/engine";

import { ManualClock } from "./clock";
import { FairDevice, type FairWire, prepareGroup } from "./device";

// 실제 방과 같은 타원곡선 군(r255)으로 시험한다.
await prepareGroup("r255");

/**
 * 기기 시험 덱: 마이티 덱 앞 8장. 섞기·가리기·열기·증명 규칙은 덱 크기와 상관없어 작게 본다
 * (53장 실제 판은 방 시험이 돌린다). 자리 0~3은 0번 기기(방장과 컴퓨터), 4·5는 1번, 6·7은 2번.
 */
export const TEST_DECK = deckFor(presetRules("standard5")).slice(0, 8);
export const TEST_OWNERS: ReadonlyMap<number, number> = new Map([
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 1],
  [5, 1],
  [6, 2],
  [7, 2],
]);

export interface TestNetwork {
  devices: FairDevice[];
  /** 제한 시간은 시험이 이 시계를 옮길 때만 지난다 */
  clock: ManualClock;
  /** 가는 중인 메시지가 없고 모든 기기가 할 일(섞기 증명 계산까지)을 마칠 때까지 기다린다 */
  settle(): Promise<void>;
}

/** 기기들을 메모리로 잇는다(메시지는 비동기로, 보낸 기기 번호와 함께) */
export function network(
  ids: number[],
  options: {
    /** 보내지 않을 메시지(고친 프로그램이 일부러 빼먹는 것) */
    drop?: (message: FairWire, from: number) => boolean;
  } = {},
): TestNetwork {
  const clock = new ManualClock();
  const devices: FairDevice[] = [];
  let inFlight = 0;
  for (const id of ids)
    devices.push(
      new FairDevice({
        id,
        group: "r255",
        clock,
        send: (m: FairWire) => {
          if (options.drop?.(m, id)) return;
          for (const d of devices)
            if (d.id !== id) {
              inFlight++;
              setTimeout(() => {
                inFlight--;
                d.receive(m, id);
              }, 0);
            }
        },
      }),
    );
  const settle = async () => {
    // 기기가 일을 마치며 새 메시지를 보낼 수 있어, 메시지와 일이 함께 비는 때까지 되풀이한다.
    for (;;) {
      await new Promise<void>((r) => setTimeout(() => r(), 0));
      await Promise.all(devices.map((d) => d.idle()));
      if (inFlight === 0) return;
    }
  };
  return { devices, clock, settle };
}
