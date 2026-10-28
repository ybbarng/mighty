import { janggiBotFor } from "@mighty/janggi-ai";
import type {
  Action,
  GameEvent,
  JanggiRules,
  JanggiState,
  JanggiView,
} from "@mighty/janggi-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";

import { janggiKit } from "./kit";
import { janggiSession } from "./session";
import { BIKJANG_INFO } from "./settings";
import { useJanggi } from "./store";

/** 친구와 장기(`BoardOnlineScreen`)에서 장기만 다른 것 */
export const janggiOnline: BoardOnlineGame<
  JanggiRules,
  JanggiState,
  JanggiView,
  Action,
  GameEvent
> = {
  kit: janggiKit,
  name: "장기",
  shareTitle: "장기 한 판 두자",
  session: janggiSession,
  useStore: useJanggi,
  botFor: janggiBotFor,
  rulesSummary(rules) {
    const bikjang = BIKJANG_INFO.find((v) => v.value === rules.bikjang);
    return `${bikjang?.label ?? ""} · ${bikjang?.description ?? ""}. 첫 판 초(먼저 둠)는 무작위, 판마다 초·한을 바꿉니다.`;
  },
};
