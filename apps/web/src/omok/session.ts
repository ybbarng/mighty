import type {
  Action,
  GameEvent,
  OmokRules,
  OmokState,
  OmokView,
} from "@mighty/omok-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type OmokHostRoom = HostRoom<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined
>;
export type OmokGuestRoom = GuestRoom<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 오목 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const omokSession: {
  host: OmokHostRoom | null;
  guest: OmokGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endOmokSession(): void {
  clearHostingRoom();
  if (omokSession.host) {
    omokSession.host.finish();
    const host = omokSession.host;
    setTimeout(() => host.close(), 500);
  }
  omokSession.guest?.leave();
  omokSession.host = null;
  omokSession.guest = null;
  useChat.getState().reset();
}
