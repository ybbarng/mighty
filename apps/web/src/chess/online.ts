import { chessBotFor } from "@mighty/chess-ai";
import type {
  Action,
  ChessRules,
  ChessState,
  ChessView,
  GameEvent,
} from "@mighty/chess-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";

import { chessKit } from "./kit";
import { chessSession } from "./session";
import { useChess } from "./store";

const WINS_LABEL: Record<number, string> = {
  1: "한 판",
  2: "3판 2승",
  3: "5판 3승",
};

/** 친구와 체스(`BoardOnlineScreen`)에서 체스만 다른 것 */
export const chessOnline: BoardOnlineGame<
  ChessRules,
  ChessState,
  ChessView,
  Action,
  GameEvent
> = {
  kit: chessKit,
  name: "체스",
  shareTitle: "체스 한 판 두자",
  session: chessSession,
  useStore: useChess,
  botFor: chessBotFor,
  rulesSummary(rules) {
    const wins =
      WINS_LABEL[rules.winsToFinish] ?? `${rules.winsToFinish}승 먼저`;
    return `${wins}. 첫 판 백(먼저 둠)은 무작위, 판마다 백·흑을 바꿉니다.`;
  },
};
