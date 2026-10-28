import { badukBotFor } from "@mighty/baduk-ai";
import type {
  Action,
  BadukRules,
  BadukState,
  BadukView,
  GameEvent,
} from "@mighty/baduk-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";

import { badukKit } from "./kit";
import { badukSession } from "./session";
import { useBaduk } from "./store";

/** 친구와 바둑(`BoardOnlineScreen`)에서 바둑만 다른 것 */
export const badukOnline: BoardOnlineGame<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent
> = {
  kit: badukKit,
  name: "바둑",
  shareTitle: "바둑 한 판 두자",
  session: badukSession,
  useStore: useBaduk,
  botFor: badukBotFor,
  rulesSummary: (rules) =>
    `${rules.size}줄 · 덤 ${rules.komi}. 첫 판 흑(먼저 둠)은 무작위, 판마다 흑백을 바꿉니다.`,
};
