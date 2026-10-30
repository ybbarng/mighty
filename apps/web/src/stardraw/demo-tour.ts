import { realClock } from "@mighty/fair-play";
import {
  type EntrantSigner,
  generateSigner,
  makeRegistration,
  makeTicket,
  type Rank,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";

import { type CheckBatch, Checker, memoryCheckStore } from "./checks";
import { LocalConfirmRelay, type RelayStore } from "./confirm-relay";
import { demoPick } from "./demo-pick";
import { LocalLedger } from "./local-ledger";
import type { Services } from "./services";
import { createDemoWallet, type MyTicket, sitePolicy } from "./wallet";

/**
 * 데모 "화면 둘러보기"의 가짜 상태(docs/36 11-3). 장부·확인 기록은 메모리에만 두고, 지갑은 따로 이름공간을 쓴다.
 * 1회차: 내 응모권(1등)과 다른 참가자 2~5등·낙첨 응모권을 내고 추첨한다. 2회차: 내 응모권 하나(추첨 전).
 * 1회 1등 당첨자 확인 요청을 하나 열어 둔다(당첨자 폰·확인하는 사람 화면).
 */
export const TOUR_NS = "stardraw-tour";

/** 화면 둘러보기의 드문 사진 등록증(공개 열쇠 모양 값, 해시에서 그 사진이 나오도록 찾아 둔 것) */
export const TOUR_EGG_PUBS = {
  laika:
    "BL3UWS4OYjmKBKyAKxL6XjXj_XbfcqTyLtoGCclVMJhetYpciRRBzyNx37IzXClOLAUCSK8nicUg78X9qiZI4Hs",
  prince:
    "BC3leY9-NqapJKb2EHG1zpSAI9aBU-Pyn0BQq3JTZyxotAl_ESlBuaP7Y800sh5p0Im6zCzYz2feXm3QiTOvgT0",
  rabbit:
    "BJLkECD-zokJb7FxUXWny0vzNc8NfkzI-qbqoXL7jSUmJjzayGftd7ynu_AhMRHODE01HxAGJAo3EvAJTfCfipE",
} as const;

export interface TourState {
  services: Services;
  /** 내 1회 응모권(1등, 추첨 끝)과 2회 응모권(추첨 전) */
  drawn: MyTicket;
  pending: MyTicket;
  /** 1회 등수별 응모권(낙첨은 null) */
  byRank: Map<Rank | null, Ticket>;
  /** 확인을 마친 묶음, 별을 세 번 틀려 닫힌 묶음 */
  confirmed: CheckBatch;
  failed: CheckBatch;
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
          "raw",
          new Uint8Array(),
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
      await generateSigner(),
      demoPick(draw, rank),
    );
    byRank.set(rank, ticket);
  }
  await ledger.skipToNextDraw();
  const pending = await enter(me, demoPick(ledger.peekDraw(2), null));
  wallet.addTicket(pending);

  // 당첨자 폰·확인하는 사람 화면에 보일 열린 요청
  const open = await checker.start(1, 1, [drawn.ticket], "Brice");
  const id = toHex(ticketId(drawn.ticket));
  const now = clock.now();
  const base = open.tickets[0];
  if (!base) throw new Error("둘러보기 확인 요청을 만들지 못했습니다");
  const confirmed: CheckBatch = {
    ...open,
    key: `${open.key}-ok`,
    tickets: [{ ...base, ticketId: id, status: "confirmed", confirmedAt: now }],
    closed: true,
  };
  const failed: CheckBatch = {
    ...open,
    key: `${open.key}-fail`,
    tickets: [
      {
        ...base,
        status: "failed",
        reasons: ["별 세 개가 세 번 맞지 않아 요청을 닫았습니다"],
      },
    ],
    wrongTries: 3,
    closed: true,
  };
  return { services, drawn, pending, byRank, confirmed, failed };
}
