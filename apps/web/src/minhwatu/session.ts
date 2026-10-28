import type { PresetDeal } from "@mighty/hwatu";
import type {
  Action,
  GameEvent,
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
} from "@mighty/minhwatu-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type MinhwatuHostRoom = HostRoom<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  PresetDeal
>;
export type MinhwatuGuestRoom = GuestRoom<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  PresetDeal
>;

/** 지금 들어가 있는 민화투 온라인 방. 화면이 바뀌어도(대기실 → 게임) 연결은 이어진다 */
export const minhwatuSession: {
  host: MinhwatuHostRoom | null;
  guest: MinhwatuGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endMinhwatuSession(): void {
  clearHostingRoom();
  if (minhwatuSession.host) {
    minhwatuSession.host.finish();
    const host = minhwatuSession.host;
    setTimeout(() => host.close(), 500);
  }
  minhwatuSession.guest?.leave();
  minhwatuSession.host = null;
  minhwatuSession.guest = null;
  useChat.getState().reset();
}
