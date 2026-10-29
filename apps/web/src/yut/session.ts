import type {
  Action,
  GameEvent,
  YutRules,
  YutState,
  YutView,
} from "@mighty/yut-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type YutHostRoom = HostRoom<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent,
  undefined
>;
export type YutGuestRoom = GuestRoom<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 윷놀이 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const yutSession: {
  host: YutHostRoom | null;
  guest: YutGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endYutSession(): void {
  clearHostingRoom();
  if (yutSession.host) {
    yutSession.host.finish();
    const host = yutSession.host;
    setTimeout(() => host.close(), 500);
  }
  yutSession.guest?.leave();
  yutSession.host = null;
  yutSession.guest = null;
  useChat.getState().reset();
}
