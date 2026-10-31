import {
  encodeInvite,
  equalBytes,
  newInviteToken,
  signInvite,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";

import type { Services } from "./services";

/**
 * 당첨자가 만든 확인 링크(docs/36 11-2). 토큰은 이 기기에만 둔다(서버는 해시만 안다).
 * 다시 공유하거나 복사할 수 있게 응모권마다 최근 링크를 남긴다.
 */
export interface MyInvite {
  token: string;
  round: number;
  /** 응모권 id(hex) */
  ticketId: string;
  createdAt: number;
  expiresAt: number;
}

const MAX_KEPT = 30;

export function loadInvites(ns: string): MyInvite[] {
  try {
    return JSON.parse(
      localStorage.getItem(`${ns}-invites`) ?? "[]",
    ) as MyInvite[];
  } catch {
    return [];
  }
}

function saveInvites(ns: string, list: MyInvite[]): void {
  try {
    localStorage.setItem(
      `${ns}-invites`,
      JSON.stringify(list.slice(-MAX_KEPT)),
    );
  } catch {
    // 저장하지 못하면 이번 방문 동안만 링크를 다시 볼 수 있다
  }
}

/** 확인 링크 주소. 토큰은 `#` 뒤라 서버 로그·Referer에 남지 않는다 */
export function checkLinkUrl(token: string, origin: string): string {
  return `${origin}/stardraw/check#${token}`;
}

/** 당첨자: 응모권 열쇠로 서명해 확인 링크를 만든다(등록증 확인 한 번) */
export async function createInvite(
  services: Services,
  ticket: Ticket,
): Promise<MyInvite> {
  const key = services.wallet.loadKey();
  if (!key || !equalBytes(key.pub, ticket.pub))
    throw new Error(
      "이 응모권을 낸 등록증이 이 기기에 없어 링크를 만들 수 없습니다",
    );
  const token = newInviteToken();
  const signed = await signInvite(
    await services.wallet.signerFor(key),
    ticket,
    token,
  );
  const { expiresAt } = await services.relay.invite(encodeInvite(signed));
  const invite: MyInvite = {
    token,
    round: ticket.round,
    ticketId: toHex(ticketId(ticket)),
    createdAt: services.clock.now(),
    expiresAt,
  };
  saveInvites(services.ns, [...loadInvites(services.ns), invite]);
  return invite;
}

/** 이 응모권의 아직 기한이 남은 링크(최근 것부터) */
export function invitesOf(ns: string, ticket: Ticket, now: number): MyInvite[] {
  const hex = toHex(ticketId(ticket));
  return loadInvites(ns)
    .filter((i) => i.ticketId === hex && i.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 쓰였거나 없어진 링크를 기기에서 지운다(2026-10-31 보안 검토 B9). 쓰인 링크의 토큰이 기기에 평문으로 남아
 * 화면 공유나 남의 손에서 다시 보일 이유가 없다. 기한이 지난 링크도 지운다
 */
export async function pruneInvites(services: Services): Promise<void> {
  const now = services.clock.now();
  const kept: MyInvite[] = [];
  for (const i of loadInvites(services.ns)) {
    if (i.expiresAt <= now) continue;
    try {
      const peek = await services.relay.peek(i.token);
      if (peek.state !== "open") continue;
    } catch {
      // 닿지 않으면 그대로 둔다
    }
    kept.push(i);
  }
  saveInvites(services.ns, kept);
}
