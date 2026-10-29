import type {
  Action,
  BaseballRules,
  BaseballState,
  BaseballView,
  GameEvent,
} from "@mighty/baseball-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type BaseballHostRoom = HostRoom<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined
>;
export type BaseballGuestRoom = GuestRoom<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 숫자야구 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const baseballSession: {
  host: BaseballHostRoom | null;
  guest: BaseballGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endBaseballSession(): void {
  clearHostingRoom();
  if (baseballSession.host) {
    baseballSession.host.finish();
    const host = baseballSession.host;
    setTimeout(() => host.close(), 500);
  }
  baseballSession.guest?.leave();
  baseballSession.host = null;
  baseballSession.guest = null;
  useChat.getState().reset();
}
