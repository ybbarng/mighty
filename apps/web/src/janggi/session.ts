import type {
  Action,
  GameEvent,
  JanggiRules,
  JanggiState,
  JanggiView,
} from "@mighty/janggi-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type JanggiHostRoom = HostRoom<
  JanggiRules,
  JanggiState,
  JanggiView,
  Action,
  GameEvent,
  undefined
>;
export type JanggiGuestRoom = GuestRoom<
  JanggiRules,
  JanggiState,
  JanggiView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 장기 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const janggiSession: {
  host: JanggiHostRoom | null;
  guest: JanggiGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endJanggiSession(): void {
  clearHostingRoom();
  if (janggiSession.host) {
    janggiSession.host.finish();
    const host = janggiSession.host;
    setTimeout(() => host.close(), 500);
  }
  janggiSession.guest?.leave();
  janggiSession.host = null;
  janggiSession.guest = null;
  useChat.getState().reset();
}
