import type { GameEntry } from "@/games/registry";

import type { StatsMode } from "./records";

/**
 * 사이트 통계 이벤트(umami, docs/33 2-2절). 이름과 값은 여기서만 정한다 — 통계 화면(stats.byb.kr)에서 이 이름으로 찾는다.
 * 값은 정해 둔 것(게임 id, 단계, 코드에 적힌 단원 id)만 받는다. 방 코드·이름·채팅·패·시드·점수는 보내지 않는다.
 * 페이지 보기는 umami가 스스로 센다(`Analytics`).
 */
export type GameId = GameEntry["id"];

export interface TrackEvents {
  /** 판을 시작했다. 혼자 하기는 컴퓨터 단계, 온라인은 방장·참가자 */
  "game-start":
    | { game: GameId; mode: "solo"; level?: number }
    | { game: GameId; mode: "online"; role: "host" | "guest" };
  /** 게임을 끝까지 했다(내 기록에 남을 때) */
  "game-finish": { game: GameId; mode: StatsMode };
  /** 배우기 단원을 마쳤다(first: 처음 마쳤나) */
  "lesson-finish": { game: GameId; lesson: string; first: boolean };
  /** 배우기 단원 목록을 열었다(주소가 바뀌지 않아 페이지 보기로는 안 잡힌다) */
  "learn-open": { game: GameId };
}

interface Umami {
  track(name: string, data?: object): void;
}

/** 통계 스크립트가 없거나(개발·시험 빌드, 광고 차단기) 실패해도 화면은 그대로 둔다 */
export function track<K extends keyof TrackEvents>(
  name: K,
  data: TrackEvents[K],
): void {
  try {
    (globalThis as { umami?: Umami }).umami?.track(name, data);
  } catch {
    // 통계는 못 남겨도 된다
  }
}
