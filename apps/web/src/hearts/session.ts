import type {
  Action,
  GameEvent,
  HeartsRules,
  MatchState,
  PlayerView,
} from "@mighty/hearts-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";

export type HeartsHostRoom = HostRoom<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  undefined
>;
export type HeartsGuestRoom = GuestRoom<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 하트 온라인 방. 화면이 바뀌어도(대기실 → 게임) 연결은 이어진다 */
export const heartsSession: {
  host: HeartsHostRoom | null;
  guest: HeartsGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endHeartsSession(): void {
  if (heartsSession.host) {
    heartsSession.host.finish();
    const host = heartsSession.host;
    setTimeout(() => host.close(), 500);
  }
  heartsSession.guest?.leave();
  heartsSession.host = null;
  heartsSession.guest = null;
  useChat.getState().reset();
}
