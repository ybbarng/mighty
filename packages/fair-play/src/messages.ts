import type { Card } from "@mighty/engine";

import type { FairLogged } from "./audit";

/** 방장이 참가자에게 묻는 것 */
export type FairQuery =
  /** 6·7마: 주공이 이 카드를 불렀다. 가진 사람은 증명한다 */
  | { kind: "kill"; deal: number; card: Card }
  /** 이 턴을 딴 `seat`가 숨은 프렌드인가. `slot`은 턴을 끝낸 카드의 자리(열쇠가 이미 공개됨) */
  | { kind: "friend"; deal: number; seat: number; slot: number };

/** 방장 ↔ 참가자 멘탈 포커 제어 메시지(device.ts의 FairWire와 함께 오간다) */
export type FairControl =
  | { t: "fp"; k: "query"; id: string; query: FairQuery }
  | {
      t: "fp";
      k: "answer";
      id: string;
      from: number;
      have: boolean;
      slot?: number;
    }
  /** 마지막 턴: 판 전체를 다시 계산하도록 행동 기록을 보낸다 */
  | { t: "fp"; k: "log"; deal: number; log: FairLogged[] };
