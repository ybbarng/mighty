import type {
  Action,
  ChessRules,
  ChessState,
  ChessView,
  GameEvent,
} from "@mighty/chess-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type ChessHostRoom = HostRoom<
  ChessRules,
  ChessState,
  ChessView,
  Action,
  GameEvent,
  undefined
>;
export type ChessGuestRoom = GuestRoom<
  ChessRules,
  ChessState,
  ChessView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 체스 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const chessSession: {
  host: ChessHostRoom | null;
  guest: ChessGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endChessSession(): void {
  clearHostingRoom();
  if (chessSession.host) {
    chessSession.host.finish();
    const host = chessSession.host;
    setTimeout(() => host.close(), 500);
  }
  chessSession.guest?.leave();
  chessSession.host = null;
  chessSession.guest = null;
  useChat.getState().reset();
}
