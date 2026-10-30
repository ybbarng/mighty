import { realClock } from "@mighty/fair-play";
import {
  type EntrantSigner,
  generateSasKey,
  generateSigner,
  makeRegistration,
  makeTicket,
  type Rank,
  softCredentialId,
  softPasskeySigner,
  type Ticket,
} from "@mighty/stardraw-core";

import { Checker, type CheckSession, memoryCheckStore } from "./checks";
import { LocalConfirmRelay, type RelayStore } from "./confirm-relay";
import { demoPick } from "./demo-pick";
import { createInvite } from "./invites";
import { LocalLedger } from "./local-ledger";
import type { Services } from "./services";
import { createDemoWallet, type MyTicket, sitePolicy } from "./wallet";

/**
 * 데모 "화면 둘러보기"의 가짜 상태(docs/36 11-3). 장부·확인 기록은 메모리에만 두고, 지갑은 따로 이름공간을 쓴다.
 * 1회차: 내 응모권(1등)과 다른 참가자 2~5등·낙첨 응모권을 내고 추첨한다. 2회차: 내 응모권 하나(추첨 전).
 * 1회 1등 응모권으로 확인 링크 셋을 만든다: 확인 중인 링크(당첨자 폰에 요청이 와 있다), 다른 기기가 쓴 링크,
 * 아직 안 연 링크(당첨 안내에 보이는 최근 링크).
 */
export const TOUR_NS = "stardraw-tour";

/** 화면 둘러보기의 드문 사진 등록증(공개 열쇠 모양 값, 등록증 v2 계산에서 그 사진이 나오도록 찾아 둔 것) */
export const TOUR_EGG_PUBS = {
  laika:
    "BNrCcijjEZC4OvsxAnJtSVm1AAlJD7lxWQqLpYxFme10hX-ueXiLZN0N4Hx82Q_tBvh-5XVtcyrNy74HokjNcBU",
  prince:
    "BFeUz7XaAUYLwglDWxKftQ0BEwv-YdHnylFK09DBMSJjlTwCfNEJmXNVFy_roU2GkwQmB6STIvLd_BL5W_5ybOw",
  rabbit:
    "BKvETKGV-q5fqfPRMMiO3d7E-s06JSIUK6OanREJZAMBNICgITGMUAqH1tHFKVSYMofisWE-xv8or65zYoUNlpc",
} as const;

/** 화면 둘러보기의 지구 대륙 등록증(지구 › 남극이 나오도록 찾아 둔 공개 열쇠 모양 값) */
export const TOUR_EARTH_PUB =
  "BPuokmtzXiMOlhq_CUkfYmQ2WQBYc4bVpwz6_AVORQdqPKoZDuRMJoiisWHqKjhOk9x7KSJ1Tcjhf3l4FHP4vO4";

export interface TourState {
  services: Services;
  /** 내 1회 응모권(1등, 추첨 끝)과 2회 응모권(추첨 전) */
  drawn: MyTicket;
  pending: MyTicket;
  /** 1회 등수별 응모권(낙첨은 null) */
  byRank: Map<Rank | null, Ticket>;
  /** 확인 링크: 확인 중(이 기기에서 시작), 이미 사용됨(다른 기기가 시작), 아직 안 엶 */
  links: { waiting: string; used: string; fresh: string };
  /** 확인을 마친 기록, 별을 세 번 틀려 닫힌 기록 */
  confirmed: CheckSession;
  failed: CheckSession;
}

function memoryRelayStore(): RelayStore {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

export async function buildTour(): Promise<TourState> {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(`${TOUR_NS}-`)) localStorage.removeItem(key);
  } catch {
    // 지우지 못해도 새 장부라 섞이지 않는다
  }
  const clock = realClock;
  const ledger = new LocalLedger({ clock, policy: sitePolicy(), bots: 6 });
  const wallet = createDemoWallet(
    TOUR_NS,
    async () => true,
    () => ledger.id(),
    () => clock.now(),
  );
  const relay = new LocalConfirmRelay(
    clock,
    memoryRelayStore(),
    `${TOUR_NS}-confirm:`,
  );
  const checker = new Checker(relay, memoryCheckStore(), clock, sitePolicy());
  const services: Services = {
    ns: TOUR_NS,
    ledger,
    practice: ledger,
    wallet,
    relay,
    checker,
    clock,
  };

  const key = await wallet.createPasskey();
  const me = await wallet.signerFor(key);
  const enter = async (signer: EntrantSigner, numbers: number[]) => {
    const { round, times } = ledger.status();
    const challenge = ledger.head();
    const registration = (await ledger.isRegistered(signer.publicKey))
      ? undefined
      : await makeRegistration(
          { publicKey: signer.publicKey },
          // 데모 지갑과 둘러보기 참가자는 모두 흉내 패스키라 패스키 번호가 공개 열쇠에서 정해진다
          softCredentialId(signer.publicKey),
          challenge,
          times.entry.registerPowTarget,
          { params: ledger.powParams },
        );
    const ticket = await makeTicket(
      signer,
      round,
      numbers,
      challenge,
      times.entry.powTarget,
      { params: ledger.powParams },
    );
    if (!ticket || registration === null)
      throw new Error("둘러보기 응모권을 만들지 못했습니다");
    const { receivedAt } = await ledger.submit(ticket, registration);
    return { ticket, receivedAt };
  };

  const draw = ledger.peekDraw(1);
  const byRank = new Map<Rank | null, Ticket>();
  const drawn = await enter(me, demoPick(draw, 1));
  wallet.addTicket(drawn);
  byRank.set(1, drawn.ticket);
  for (const rank of [2, 3, 4, 5, null] as const) {
    const { ticket } = await enter(
      softPasskeySigner(await generateSigner(), { policy: sitePolicy() }),
      demoPick(draw, rank),
    );
    byRank.set(rank, ticket);
  }
  await ledger.skipToNextDraw();
  const pending = await enter(me, demoPick(ledger.peekDraw(2), null));
  wallet.addTicket(pending);

  // 당첨자 폰·확인하는 사람 화면에 보일 확인 링크와 요청
  const waiting = (await createInvite(services, drawn.ticket)).token;
  const open = await checker.start(waiting, 1);
  const used = (await createInvite(services, drawn.ticket)).token;
  await relay.start(used, (await generateSasKey()).publicKey);
  const fresh = (await createInvite(services, drawn.ticket)).token;
  const now = clock.now();
  const confirmed: CheckSession = {
    ...open,
    key: `${open.key}-ok`,
    status: "confirmed",
    stars: [7, 1, 24],
    confirmedAt: now,
  };
  const failed: CheckSession = {
    ...open,
    key: `${open.key}-fail`,
    status: "failed",
    reasons: ["별 세 개가 세 번 맞지 않아 확인을 닫았습니다"],
    wrongTries: 3,
  };
  return {
    services,
    drawn,
    pending,
    byRank,
    links: { waiting, used, fresh },
    confirmed,
    failed,
  };
}
