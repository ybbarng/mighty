import { baseballBotFor } from "@mighty/baseball-ai";
import type {
  Action,
  BaseballRules,
  BaseballState,
  BaseballView,
  GameEvent,
} from "@mighty/baseball-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";

import { baseballKit } from "./kit";
import { baseballSession } from "./session";
import { useBaseball } from "./store";

/**
 * 친구와 숫자야구(`BoardOnlineScreen`)에서 숫자야구만 다른 것.
 * 판 게임 공통 화면을 그대로 쓴다: 비밀은 방 화면이 아니라 저장소(`store.ts`)가 이 기기에만 두고,
 * 답하기·공개는 저장소가 화면을 받을 때 자동으로 낸다. 방·초대·검증·재연결은 오목과 같다
 */
export const baseballOnline: BoardOnlineGame<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent
> = {
  kit: baseballKit,
  name: "숫자야구",
  shareTitle: "숫자야구 한 판 하자",
  session: baseballSession,
  useStore: useBaseball,
  botFor: baseballBotFor,
  rulesSummary(rules) {
    return `${rules.digits}자리 · ${rules.zero ? "0~9" : "1~9"} · ${rules.fair ? "후공에게 한 번 더(공정 규칙)" : "먼저 맞히면 승"}. 첫 판 선은 무작위, 판마다 바꿉니다. 비밀 수는 각자 기기에만 있고 방장도 모릅니다.`;
  },
};
