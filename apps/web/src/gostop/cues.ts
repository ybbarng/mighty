import type { GameEvent } from "@mighty/gostop-engine";

import type { Cue } from "@/game/sound";

/**
 * 고스톱 사건에 맞는 소리(있는 소리를 다시 쓴다, docs/28 4절).
 * 카드 내기·뒤집기, 먹기, 뻑·쪽 같은 특별한 일, 피 뺏김, 고·스톱, 판 끝
 */
export function gostopCues(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  const add = (cue: Cue) => {
    if (!out.includes(cue)) out.push(cue);
  };
  for (const e of events) {
    switch (e.type) {
      case "roundStarted":
        add("deal");
        break;
      case "played":
      case "bombed":
      case "flipOnly":
        add("card");
        break;
      case "flipped":
        add("pickCard");
        break;
      case "captured":
        add("capture");
        break;
      case "special":
        if (e.kind === "ppeok") add("dealMiss");
        else if (e.kind === "shake" || e.kind === "bomb") add("announce");
        else add("scored");
        break;
      case "stolen":
        if (e.from === me) add("penalty");
        break;
      case "go":
        add("bid");
        break;
      case "stopped":
        add("announce");
        break;
      case "roundEnded": {
        const w = e.settlement.winner;
        add(w === null ? "roundEnd" : w === me ? "win" : "lose");
        break;
      }
      default:
        break;
    }
  }
  return out;
}
