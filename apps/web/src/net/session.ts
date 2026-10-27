import { prepareGroup } from "@mighty/fair-play";
import { useChat } from "./chat";
import type { DiagContext } from "./diag";
import type { FairSaved, GuestRoom } from "./guest-room";
import type { HostRoom } from "./host-room";
import { clearHostingRoom } from "./host-store";
import { joinBroadcast, type Transport } from "./transport";

/** 지금 들어가 있는 온라인 방. 화면이 바뀌어도(대기실 → 게임) 연결은 이어진다 */
export const onlineSession: { host: HostRoom | null; guest: GuestRoom | null } =
  {
    host: null,
    guest: null,
  };

/** 주소에 `?net=local`이 있으면 같은 브라우저 탭끼리(인터넷 없이), 아니면 WebRTC로 잇는다 */
/** 초대 링크에 들어 있는 방장 열쇠 지문 */
export function hostFingerprintFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get("k") ?? undefined;
}

export function isLocalNet(): boolean {
  return new URLSearchParams(window.location.search).get("net") === "local";
}

/** 화면 시험용: 같은 브라우저 탭끼리 할 때(`?net=local`)만 끝내기 투표를 여는 시간을 `?voteDelay=`(ms)로 줄인다 */
export function testVoteDelayMs():
  | { voteDelayMs: number }
  | Record<string, never> {
  if (!isLocalNet()) return {};
  const value = Number(
    new URLSearchParams(window.location.search).get("voteDelay"),
  );
  return value > 0 ? { voteDelayMs: value } : {};
}

export async function openTransport(
  roomCode: string,
  context: DiagContext,
): Promise<Transport> {
  // 멘탈 포커 잠그기 군(타원곡선)을 미리 불러 둔다. 방장이 고른 군은 대기실에서 알게 된다.
  await prepareGroup("r255");
  if (isLocalNet()) return joinBroadcast(roomCode);
  // WebRTC 라이브러리는 친구와 할 때만 받는다.
  const { joinP2P } = await import("./p2p-transport");
  return joinP2P(roomCode, context);
}

/**
 * 초대 링크. `k`는 방장 공개 열쇠의 지문이다. 참가자는 이 열쇠로 서명한 연결만 방장으로 믿는다(identity.ts).
 */
export function inviteUrl(roomCode: string, fingerprint?: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", roomCode);
  if (fingerprint) url.searchParams.set("k", fingerprint);
  if (isLocalNet()) url.searchParams.set("net", "local");
  return url.toString();
}

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endOnlineSession(): void {
  clearHostingRoom();
  if (onlineSession.host) {
    onlineSession.host.finish();
    // 기록이 전달될 시간을 조금 준다.
    const host = onlineSession.host;
    setTimeout(() => host.close(), 500);
  }
  onlineSession.guest?.leave();
  onlineSession.host = null;
  onlineSession.guest = null;
  useChat.getState().reset();
}

const tokenKey = (room: string) => `mighty-room-${room}`;

/** 새로고침해도 같은 자리로 돌아오도록 방별 토큰과 비밀 값을 탭에 남긴다 */
export function loadSeatToken(
  room: string,
): { token: string; secret: string } | null {
  try {
    const raw = sessionStorage.getItem(tokenKey(room));
    return raw ? (JSON.parse(raw) as { token: string; secret: string }) : null;
  } catch {
    return null;
  }
}

export function saveSeatToken(
  room: string,
  value: { token: string; secret: string },
): void {
  try {
    sessionStorage.setItem(tokenKey(room), JSON.stringify(value));
  } catch {
    // 저장하지 못하면 새로고침 때 새 손님으로 들어간다.
  }
}

/** 멘탈 포커 열쇠와 보낸 행동을 방별로 탭에 남긴다(새로고침해도 내 카드를 다시 연다) */
export function fairStoreFor(room: string): {
  load(): FairSaved | null;
  save(saved: FairSaved): void;
} {
  const key = `mighty-fair-${room}`;
  return {
    load() {
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as FairSaved) : null;
      } catch {
        return null;
      }
    },
    save(saved) {
      try {
        sessionStorage.setItem(key, JSON.stringify(saved));
      } catch {
        // 저장하지 못하면 새로고침 뒤 이 판을 이어 가지 못한다.
      }
    },
  };
}
