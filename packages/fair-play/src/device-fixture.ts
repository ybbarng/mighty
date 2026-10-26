/** 멘탈 포커 기기 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
declare function setTimeout(callback: () => void, ms: number): unknown;

import { FairDevice, type FairWire } from "./device";

/** 기기 셋을 메모리로 잇는다(메시지는 비동기로, 보낸 기기 번호와 함께) */
export function network(
  ids: number[],
  proofTimeoutMs?: number,
  /** 보내지 않을 메시지(고친 프로그램이 일부러 빼먹는 것) */
  drop?: (message: FairWire, from: number) => boolean,
) {
  const devices: FairDevice[] = [];
  for (const id of ids)
    devices.push(
      new FairDevice({
        id,
        group: "1024",
        ...(proofTimeoutMs ? { proofTimeoutMs } : {}),
        send: (m: FairWire) => {
          if (drop?.(m, id)) return;
          for (const d of devices)
            if (d.id !== id) setTimeout(() => d.receive(m, id), 0);
        },
      }),
    );
  return devices;
}

export async function settle(devices: FairDevice[]) {
  for (let i = 0; i < 50; i++) {
    await new Promise<void>((r) => setTimeout(() => r(), 5));
    await Promise.all(devices.map((d) => d.idle()));
  }
}
