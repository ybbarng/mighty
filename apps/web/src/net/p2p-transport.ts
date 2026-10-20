import { defaultRelayUrls, joinRoom, selfId } from "trystero/nostr";

import type { Transport } from "./transport";

/** 같은 앱끼리만 서로를 찾도록 쓰는 이름 */
const APP_ID = "mighty-card-game-v1";

/**
 * 직접 운영하는 Nostr 릴레이(빌드할 때 `NEXT_PUBLIC_RELAY_URLS`, 쉼표로 여럿).
 * 있으면 그것과 공개 릴레이 두 곳을 예비로 쓴다. 없으면 공개 릴레이만 쓴다.
 */
const OWN_RELAYS = (process.env.NEXT_PUBLIC_RELAY_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

/**
 * 기기끼리 바로 이어지지 않는 네트워크(회사·학교 방화벽, 일부 모바일망)를 위한 TURN 중계 서버.
 * 빌드할 때 `NEXT_PUBLIC_TURN_URLS`(쉼표로 여럿)·`_USERNAME`·`_CREDENTIAL`로 받는다.
 * 정적 사이트라 계정이 번들에 들어가므로, 서버 쪽에서 사용량을 제한한다(deploy/turnserver.conf).
 */
const TURN_URLS = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const TURN_CONFIG =
  TURN_URLS.length > 0
    ? [
        {
          urls: TURN_URLS,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? "",
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "",
        },
      ]
    : null;

/**
 * 인터넷 대전: WebRTC로 기기끼리 바로 잇는다. 서로를 찾는 단계(시그널링)만 Nostr 릴레이를 거친다. 방 코드를 비밀번호로도 써서 릴레이를 지나는 연결 정보를 암호화한다.
 */
export function joinP2P(roomId: string): Transport {
  const room = joinRoom(
    {
      appId: APP_ID,
      password: roomId,
      ...(TURN_CONFIG ? { turnConfig: TURN_CONFIG } : {}),
      ...(OWN_RELAYS.length > 0
        ? {
            // urls를 주면 목록 전부에 붙는다. 같은 빌드끼리는 목록이 같아 늘 같은 릴레이에서 만난다.
            relayConfig: {
              urls: [...OWN_RELAYS, ...defaultRelayUrls.slice(0, 2)],
            },
          }
        : {}),
    },
    roomId,
  );
  const channel = room.makeAction<string>("m");
  const messageHandlers: ((message: unknown, from: string) => void)[] = [];
  const joinHandlers: ((peerId: string) => void)[] = [];
  const leaveHandlers: ((peerId: string) => void)[] = [];

  channel.onMessage = (data, { peerId }) => {
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    for (const h of messageHandlers) h(message, peerId);
  };
  room.onPeerJoin = (peerId) => {
    for (const h of joinHandlers) h(peerId);
  };
  room.onPeerLeave = (peerId) => {
    for (const h of leaveHandlers) h(peerId);
  };

  return {
    selfId,
    send: (message, to) => {
      void channel.send(
        JSON.stringify(message),
        to ? { target: to } : undefined,
      );
    },
    onMessage: (h) => messageHandlers.push(h),
    onPeerJoin: (h) => joinHandlers.push(h),
    onPeerLeave: (h) => leaveHandlers.push(h),
    leave: () => {
      void room.leave();
    },
  };
}
