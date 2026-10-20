import { joinRoom, selfId } from "trystero/nostr";

import type { Transport } from "./transport";

/** 같은 앱끼리만 서로를 찾도록 쓰는 이름 */
const APP_ID = "mighty-card-game-v1";

/**
 * 인터넷 대전: WebRTC로 기기끼리 바로 잇는다. 서로를 찾는 단계(시그널링)는 공개 Nostr 릴레이를 거치므로
 * 우리가 운영하는 서버가 없다. 방 코드를 비밀번호로도 써서 릴레이를 지나는 연결 정보를 암호화한다.
 */
export function joinP2P(roomId: string): Transport {
  const room = joinRoom({ appId: APP_ID, password: roomId }, roomId);
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
