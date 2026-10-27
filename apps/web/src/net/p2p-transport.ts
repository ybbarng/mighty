import { defaultRelayUrls, joinRoom, selfId } from "trystero/nostr";

import { type DiagContext, diag, startDiag } from "./diag";
import { trackedPeerConnections } from "./rtc-diag";
import { sdpFingerprint, type Transport } from "./transport";
import { turnConfig } from "./turn";

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
 * 인터넷 대전: WebRTC로 기기끼리 바로 잇는다. 서로를 찾는 단계(시그널링)만 Nostr 릴레이를 거친다. 방 코드를 비밀번호로도 써서 릴레이를 지나는 연결 정보를 암호화한다.
 */
export async function joinP2P(
  roomId: string,
  context: DiagContext,
): Promise<Transport> {
  await startDiag(roomId, context);
  const turnStarted = performance.now();
  const turn = await turnConfig();
  diag("turn", {
    ok: turn !== null,
    ms: Math.round(performance.now() - turnStarted),
  });
  const tracking = trackedPeerConnections();
  const room = joinRoom(
    {
      appId: APP_ID,
      password: roomId,
      rtcPolyfill: tracking.Tracked,
      ...(turn ? { turnConfig: turn } : {}),
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
  let peers = 0;
  // 참가자는 방장과 이어지기 전, 방장은 첫 참가자가 오기 전까지 연결 시도 상황을 보낸다.
  const stopWatching = tracking.watchWaiting(() => peers > 0);
  room.onPeerJoin = (peerId) => {
    peers++;
    diag("peer", { peers });
    for (const h of joinHandlers) h(peerId);
  };
  room.onPeerLeave = (peerId) => {
    peers--;
    diag("peerLeave", { peers });
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
      stopWatching();
      diag("leave");
      void room.leave();
    },
    // 연결 정보(SDP)의 인증서 지문. 브라우저는 상대 SDP의 지문과 실제 DTLS 인증서가 같은지 확인한 뒤에야
    // 데이터를 주고받으므로, 메시지가 오가는 연결이면 이 값이 그 연결의 실제 인증서다.
    fingerprints: async (peerId) => {
      const pc = room.getPeers()[peerId];
      const local = sdpFingerprint(pc?.localDescription?.sdp);
      const remote = sdpFingerprint(pc?.remoteDescription?.sdp);
      return local && remote ? { local, remote } : null;
    },
  };
}
