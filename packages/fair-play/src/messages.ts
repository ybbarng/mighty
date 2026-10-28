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
  | { t: "fp"; k: "log"; deal: number; log: FairLogged[] }
  /**
   * 화투: 더미 다음 자리를 연다(방장이 엔진을 한 걸음 미리 돌려 본 결과). `to`가 −1이면 모두에게(뒤집기),
   * 기기 번호면 그 기기에게만(나이롱뽕 가져오기). 판 끝에 진짜 카드로 다시 계산해 맞았는지 본다
   */
  | { t: "fp"; k: "deck"; deal: number; slot: number; to: number }
  /** 화투: 판이 끝나기 전에 모든 열쇠를 공개한다(나이롱뽕: 손패 합이 점수다) */
  | { t: "fp"; k: "all"; deal: number }
  /** 화투: 내 패를 다 열었다(고스톱 총통이면 그 넉 장을 먼저 공개했다). 방장은 모두 준비되면 판을 시작한다 */
  | { t: "fp"; k: "ready"; deal: number; from: number };
