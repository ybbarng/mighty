import type {
  Action,
  GameEvent,
  GostopRules,
  GostopState,
  GostopView,
} from "@mighty/gostop-engine";
import type { PresetDeal } from "@mighty/hwatu";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

export type GostopHostRoom = HostRoom<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
>;
export type GostopGuestRoom = GuestRoom<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
>;

/** 지금 들어가 있는 고스톱 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const gostopSession: {
  host: GostopHostRoom | null;
  guest: GostopGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endGostopSession(): void {
  clearHostingRoom();
  if (gostopSession.host) {
    gostopSession.host.finish();
    const host = gostopSession.host;
    setTimeout(() => host.close(), 500);
  }
  gostopSession.guest?.leave();
  gostopSession.host = null;
  gostopSession.guest = null;
  useChat.getState().reset();
}
