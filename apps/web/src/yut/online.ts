import { yutBotFor } from "@mighty/yut-ai";
import type {
  Action,
  GameEvent,
  YutRules,
  YutState,
  YutView,
} from "@mighty/yut-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";

import { yutKit } from "./kit";
import { yutSession } from "./session";
import { useYut } from "./store";

/** 방을 만들 때 보이는 규칙 요약 */
export function yutRulesSummary(rules: YutRules): string {
  const lineup =
    rules.mode === "team"
      ? "2:2 편 놀이"
      : rules.players === 2
        ? "1:1"
        : `${rules.players}인 각자`;
  return [
    lineup,
    `말 ${rules.pieces}개`,
    rules.backDo ? "빽도 있음" : "빽도 없음",
    rules.landOnHome ? "참먹이에 서면 남" : "참먹이를 지나야 남",
    rules.flatPercent === 60 ? "실제 윷 확률" : "고른 확률",
  ].join(" · ");
}

/**
 * 친구와 윷놀이(`BoardOnlineScreen`)에서 윷놀이만 다른 것.
 * 판 게임 공통 화면을 그대로 쓴다: 던지기 사슬 씨앗은 방 화면이 아니라 저장소(`store.ts`)가 이 기기에만 두고,
 * 약속·공개는 저장소가 화면을 받을 때 자동으로 낸다. 빈자리는 컴퓨터가 맡는다
 */
export const yutOnline: BoardOnlineGame<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent
> = {
  kit: yutKit,
  name: "윷놀이",
  shareTitle: "윷놀이 한 판 하자",
  session: yutSession,
  useStore: useYut,
  botFor: yutBotFor,
  rulesSummary(rules) {
    return `${yutRulesSummary(rules)}. 첫 차례는 무작위. 던지기 결과는 모두의 기기가 함께 정해 방장도 고를 수 없습니다.`;
  },
};
