import type { GroupName, HostTableSaved } from "@mighty/fair-play";

import type { ResumeState } from "@/game/local-match";

import type { Commitment, FairMessage } from "./protocol";

/**
 * 방장 새로고침 이어 가기. 방장 기기는 방(참가자 토큰·비밀 값·서명 열쇠)과 진행(엔진 상태·기록·컴퓨터 난수),
 * 멘탈 포커 열쇠와 자기가 보낸 메시지를 탭에 남긴다. 다른 기기가 보낸 멘탈 포커 메시지는 남기지 않는다
 * (크다). 방장이 돌아오면 참가자들이 자기가 보냈던 것을 다시 보내 준다(guest-room.ts).
 */
export interface HostSaved {
  v: 1;
  game: string;
  hostName: string;
  rules: unknown;
  ruleName: string | null;
  fair: { group: GroupName } | null;
  /** 방장 서명 열쇠(개인 열쇠 JWK). 초대 링크의 지문이 그대로 맞는다 */
  identity: JsonWebKey;
  hostSecret: string;
  guests: {
    seat: number;
    token: string;
    commit: string;
    secret: string | null;
    name: string;
  }[];
  kickedTokens: string[];
  commitments: Commitment[];
  match: {
    seed: number;
    resume: ResumeState<unknown, unknown>;
    audited: boolean;
    table: HostTableSaved<unknown> | null;
  } | null;
}

/** 되살릴 때 받는 것: 방 정보와 방장 기기가 보낸 멘탈 포커 메시지 */
export interface HostRestore {
  saved: HostSaved;
  own: FairMessage[];
}

export interface HostStore {
  load(): HostRestore | null;
  save(saved: HostSaved): void;
  /** 방장 기기가 보낸 멘탈 포커 메시지. 판별로 나눠 그 판 것만 다시 쓴다 */
  saveOwn(deal: number, messages: readonly FairMessage[]): void;
  clear(): void;
}

/** 탭에 남긴다(sessionStorage). 같은 탭에서 새로고침할 때만 이어진다 */
export function sessionHostStore(room: string): HostStore {
  const key = `mighty-host-${room}`;
  const ownKey = (deal: number) => `${key}-fp-${deal}`;
  const ownKeys = (): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(`${key}-fp-`)) keys.push(k);
    }
    return keys;
  };
  return {
    load() {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const saved = JSON.parse(raw) as HostSaved;
        if (saved.v !== 1) return null;
        const own = ownKeys()
          .map((k) => ({
            deal: Number(k.slice(`${key}-fp-`.length)),
            messages: JSON.parse(
              sessionStorage.getItem(k) ?? "[]",
            ) as FairMessage[],
          }))
          .sort((a, b) => a.deal - b.deal)
          .flatMap((d) => d.messages);
        return { saved, own };
      } catch {
        return null;
      }
    },
    save(saved) {
      try {
        sessionStorage.setItem(key, JSON.stringify(saved));
      } catch {
        // 저장하지 못하면 새로고침 뒤 이 방을 이어 가지 못한다.
      }
    },
    saveOwn(deal, messages) {
      try {
        sessionStorage.setItem(ownKey(deal), JSON.stringify(messages));
      } catch {
        // 위와 같다.
      }
    },
    clear() {
      try {
        for (const k of ownKeys()) sessionStorage.removeItem(k);
        sessionStorage.removeItem(key);
      } catch {
        // 저장소를 쓸 수 없으면 지울 것도 없다.
      }
    },
  };
}

/** 이 탭이 연 방(방장 새로고침 뒤 찾는다) */
const HOSTING_KEY = "mighty-hosting";

/** 새로고침 전에 이 탭이 연 그 게임의 방과 남긴 것. 없으면 null */
export function hostedRoom(
  game: string,
): { room: string; restore: HostRestore } | null {
  try {
    const raw = sessionStorage.getItem(HOSTING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { game: string; room: string };
    if (value.game !== game) return null;
    const restore = sessionHostStore(value.room).load();
    return restore ? { room: value.room, restore } : null;
  } catch {
    return null;
  }
}

export function setHostingRoom(game: string, room: string): void {
  try {
    sessionStorage.setItem(HOSTING_KEY, JSON.stringify({ game, room }));
  } catch {
    // 남기지 못하면 새로고침 뒤 처음 화면으로 간다.
  }
}

/** 방을 끝냈다(일부러 나갔다) */
export function clearHostingRoom(): void {
  try {
    sessionStorage.removeItem(HOSTING_KEY);
  } catch {
    // 위와 같다.
  }
}

/** 시험용: 메모리에 남긴다 */
export function memoryHostStore(): HostStore & {
  data: { saved: HostSaved | null; own: Map<number, FairMessage[]> };
} {
  const data = {
    saved: null as HostSaved | null,
    own: new Map<number, FairMessage[]>(),
  };
  return {
    data,
    load: () =>
      data.saved
        ? {
            saved: JSON.parse(JSON.stringify(data.saved)),
            own: [...data.own.entries()]
              .sort(([a], [b]) => a - b)
              .flatMap(([, m]) => JSON.parse(JSON.stringify(m))),
          }
        : null,
    save: (saved) => {
      data.saved = JSON.parse(JSON.stringify(saved));
    },
    saveOwn: (deal, messages) => {
      data.own.set(deal, [...messages]);
    },
    clear: () => {
      data.saved = null;
      data.own.clear();
    },
  };
}
