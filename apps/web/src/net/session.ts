import { useChat } from "./chat";
import type { GuestRoom } from "./guest-room";
import type { HostRoom } from "./host-room";
import { joinBroadcast, type Transport } from "./transport";

/** 지금 들어가 있는 온라인 방. 화면이 바뀌어도(대기실 → 게임) 연결은 이어진다 */
export const onlineSession: { host: HostRoom | null; guest: GuestRoom | null } =
  {
    host: null,
    guest: null,
  };

/** 주소에 `?net=local`이 있으면 같은 브라우저 탭끼리(인터넷 없이), 아니면 WebRTC로 잇는다 */
export function isLocalNet(): boolean {
  return new URLSearchParams(window.location.search).get("net") === "local";
}

export async function openTransport(roomCode: string): Promise<Transport> {
  if (isLocalNet()) return joinBroadcast(roomCode);
  // WebRTC 라이브러리는 친구와 할 때만 받는다.
  const { joinP2P } = await import("./p2p-transport");
  return joinP2P(roomCode);
}

export function inviteUrl(roomCode: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", roomCode);
  if (isLocalNet()) url.searchParams.set("net", "local");
  return url.toString();
}

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endOnlineSession(): void {
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
