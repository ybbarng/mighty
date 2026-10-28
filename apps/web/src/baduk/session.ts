import type {
  Action,
  BadukRules,
  BadukState,
  BadukView,
  GameEvent,
} from "@mighty/baduk-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type BadukHostRoom = HostRoom<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent,
  undefined
>;
export type BadukGuestRoom = GuestRoom<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 바둑 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const badukSession: {
  host: BadukHostRoom | null;
  guest: BadukGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endBadukSession(): void {
  clearHostingRoom();
  if (badukSession.host) {
    badukSession.host.finish();
    const host = badukSession.host;
    setTimeout(() => host.close(), 500);
  }
  badukSession.guest?.leave();
  badukSession.host = null;
  badukSession.guest = null;
  useChat.getState().reset();
}
