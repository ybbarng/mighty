import type { PresetDeal } from "@mighty/hwatu";
import type {
  Action,
  GameEvent,
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
} from "@mighty/nyrongppong-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type NyrongppongHostRoom = HostRoom<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  PresetDeal
>;
export type NyrongppongGuestRoom = GuestRoom<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  PresetDeal
>;

/** 지금 들어가 있는 나이롱뽕 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const nyrongppongSession: {
  host: NyrongppongHostRoom | null;
  guest: NyrongppongGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endNyrongppongSession(): void {
  clearHostingRoom();
  if (nyrongppongSession.host) {
    nyrongppongSession.host.finish();
    const host = nyrongppongSession.host;
    setTimeout(() => host.close(), 500);
  }
  nyrongppongSession.guest?.leave();
  nyrongppongSession.host = null;
  nyrongppongSession.guest = null;
  useChat.getState().reset();
}
