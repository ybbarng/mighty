import type { GameEvent } from "@mighty/minhwatu-engine";

import type { Cue } from "@/game/sound";

/** 낼 소리 하나와 걸음 처음부터 기다릴 시간(초) */
export interface MinhwatuCue {
  cue: Cue;
  delay: number;
}

/** 뒤집기 소리는 낸 패 소리 조금 뒤에 */
const FLIP_DELAY = 0.35;

/**
 * 한 걸음의 사건에서 낼 소리. 공통 소리를 빌려 쓴다(docs/29 6절).
 * 패를 내면 "카드 내기", 바닥 패를 먹으면 "잡기"(탁-딱), 더미를 뒤집으면 "카드 정리",
 * 내가 약을 이루면 "공지", 남이 이루면 "벌점", 판 끝은 "판 끝", 게임 끝은 이김·짐
 */
export function minhwatuCues(
  events: readonly GameEvent[],
  me: number,
): MinhwatuCue[] {
  const out: MinhwatuCue[] = [];
  let at = 0;
  for (const e of events) {
    switch (e.type) {
      case "roundStarted":
        out.push({ cue: "shuffle", delay: 0 }, { cue: "deal", delay: 0.3 });
        break;
      case "played":
        out.push({ cue: e.took.length > 0 ? "capture" : "card", delay: 0 });
        at = FLIP_DELAY;
        break;
      case "flipped":
        out.push({ cue: e.took.length > 0 ? "capture" : "cardSet", delay: at });
        break;
      case "picked":
        out.push({ cue: "capture", delay: 0 });
        break;
      case "yak":
        out.push({
          cue: e.seat === me ? "announce" : "penalty",
          delay: at + 0.3,
        });
        break;
      case "roundEnded":
        if (!events.some((x) => x.type === "gameEnded"))
          out.push({ cue: "roundEnd", delay: at + 0.4 });
        break;
      case "gameEnded":
        if (!e.retired)
          out.push({
            cue: e.winners.includes(me) ? "win" : "lose",
            delay: at + 0.4,
          });
        break;
    }
  }
  return out;
}
