/** 멘탈 포커 기기 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
declare function setTimeout(callback: () => void, ms: number): unknown;

import { ManualClock } from "./clock";
import { FairDevice, type FairWire, prepareGroup } from "./device";

// 실제 방과 같은 타원곡선 군(r255)으로 시험한다.
await prepareGroup("r255");

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
