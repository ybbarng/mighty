"use client";

import { fromBase64Url, type Rank } from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useState } from "react";
import { astronautOf } from "../astronaut/identity";
import { AWARD_SPECIMENS } from "../awards";
import {
  buildTour,
  TOUR_EARTH_PUB,
  TOUR_EGG_PUBS,
  type TourState,
} from "../demo-tour";
import { myRecords } from "../my-records";
import { AstronautPanel } from "./AstronautPanel";
import { CheckLink } from "./CheckLink";
import { FX_ITEMS, FxScreen } from "./DemoTourFx";
import { DemoUnlockPrompt } from "./DemoUnlockSheet";
import { DrawView } from "./DrawView";
import { EnterView, KeySetup } from "./EnterView";
import { Inbox } from "./Inbox";
import { MyRecordsView } from "./MyRecords";
import { Receipt } from "./Receipt";
import { Home, MineView, RoundsView } from "./StardrawApp";
import { WinNotice } from "./WinNotice";

/** 로컬 빌드에서만 보이는 둘러보기 항목(견본) */
const SPECIMEN_ITEMS = [{ id: "records", label: "내 기록" }] as const;

/** 데모 "화면 둘러보기" 목록. 주소는 #tour-<id>라 뒤로가기로 목록에 돌아온다 */
export const TOUR_ITEMS = [
  { id: "enter", label: "응모" },
  { id: "receipt", label: "영수증" },
  { id: "draw", label: "추첨(룰렛)" },
  { id: "envelope", label: "결과 봉투" },
  { id: "rank-1", label: "1등" },
  { id: "rank-2", label: "2등" },
  { id: "rank-3", label: "3등" },
  { id: "rank-4", label: "4등" },
  { id: "rank-5", label: "5등" },
  { id: "lose", label: "낙첨" },
  { id: "mine", label: "내 응모" },
  { id: "rounds", label: "지난 회차" },
  { id: "win-notice", label: "당첨 안내·확인 링크" },
  { id: "link-open", label: "확인 링크 연 화면" },
  { id: "link-used", label: "이미 사용된 링크" },
  { id: "winner", label: "당첨자 폰: 승인" },
  { id: "checker", label: "확인하는 사람: 기다림" },
  { id: "check-ok", label: "확인 성공" },
  { id: "check-fail", label: "확인 실패" },
  { id: "register", label: "우주인 등록" },
  { id: "id-card", label: "등록증" },
  { id: "id-earth", label: "등록증: 지구 대륙" },
  { id: "id-laika", label: "등록증: 우주견" },
  { id: "id-prince", label: "등록증: 작은 별의 아이" },
  { id: "id-rabbit", label: "등록증: 달토끼" },
  { id: "sheet-create", label: "패스키 만들기 시트" },
  { id: "sheet-sign", label: "패스키 서명 시트" },
  { id: "sheet-check", label: "본인 확인 시트" },
  { id: "in-app", label: "앱 안 브라우저" },
  { id: "no-passkey", label: "패스키 미지원" },
  ...FX_ITEMS,
  // 내 기록(훈장·당첨증·기념 서류 견본)은 받기 전에는 무엇이 있는지 모르게 로컬 빌드에서만(AWARD_SPECIMENS, 사용자)
  ...(AWARD_SPECIMENS ? SPECIMEN_ITEMS : []),
] as const;

export type TourId = (typeof TOUR_ITEMS)[number]["id"];

export function tourIdOf(hash: string): TourId | null {
  const id = hash.replace(/^#tour-/, "");
  return hash.startsWith("#tour-") && TOUR_ITEMS.some((t) => t.id === id)
    ? (id as TourId)
    : null;
}

export function TourList() {
  return (
    <nav aria-label="화면 둘러보기" className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm text-white/70">화면 둘러보기</h2>
      <ul className="flex flex-wrap gap-1.5">
        {TOUR_ITEMS.map((t) => (
          <li key={t.id}>
            <a
              href={`#tour-${t.id}`}
              className="block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 가짜 상태는 한 번만 만든다(응모권 계산이 있어 조금 걸린다) */
let tour: Promise<TourState> | null = null;

const noop = () => {};

export function TourScreen({ id, onBack }: { id: TourId; onBack: () => void }) {
  const [state, setState] = useState<TourState | null>(null);
  useEffect(() => {
    tour ??= buildTour();
    let alive = true;
    void tour.then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const label = TOUR_ITEMS.find((t) => t.id === id)?.label ?? "";
  return (
    <section
      aria-label={`화면 둘러보기: ${label}`}
      data-tour-screen={id}
      data-tour-ready={state ? "" : undefined}
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-white/70 hover:text-white"
      >
        ← 화면 목록
      </button>
      {state ? (
        <Screen id={id} s={state} onBack={onBack} />
      ) : (
        <p className="py-20 text-center text-white/60">하늘을 펴고 있습니다</p>
      )}
    </section>
  );
}

function Screen({
  id,
  s,
  onBack,
}: {
  id: TourId;
  s: TourState;
  onBack: () => void;
}): ReactNode {
  const { services, drawn, pending } = s;
  const status = services.ledger.status();
  const mine = [drawn, pending];
  const record = services.ledger.record(1);
  if (!record) return null;
  const drawOf = (rank: Rank | null) => (
    <DrawView
      record={record}
      ticket={s.byRank.get(rank)}
      onClose={onBack}
      clock={services.clock}
      instant
    />
  );
  switch (id) {
    case "enter":
      return (
        <EnterView
          services={services}
          status={status}
          onBack={onBack}
          onDone={noop}
        />
      );
    case "receipt":
      return (
        <Receipt
          ticket={pending.ticket}
          receivedAt={pending.receivedAt}
          schedule={services.ledger.schedule}
        />
      );
    case "draw":
      return (
        <DrawView
          record={record}
          ticket={drawn.ticket}
          onClose={onBack}
          clock={services.clock}
        />
      );
    case "envelope":
      return (
        <Home
          services={services}
          status={status}
          mine={mine}
          opened={new Set()}
          onEnter={noop}
          onReceipt={noop}
          onDraw={noop}
          onMine={noop}
          onRounds={noop}
          onSkip={null}
        />
      );
    case "rank-1":
      return drawOf(1);
    case "rank-2":
      return drawOf(2);
    case "rank-3":
      return drawOf(3);
    case "rank-4":
      return drawOf(4);
    case "rank-5":
      return drawOf(5);
    case "lose":
      return drawOf(null);
    case "mine":
      return (
        <MineView
          services={services}
          mine={mine}
          onBack={onBack}
          onOpen={noop}
          onRecovered={noop}
        />
      );
    case "records": {
      if (!AWARD_SPECIMENS) return null;
      // 둘러보기만: 1회 1~5등 응모권을 모두 내 것으로 쳐 훈장·당첨증·별 도장·기념 서류가 몇 개씩 보이게
      const pubs = [...s.byRank.entries()]
        .filter(([rank]) => rank !== null)
        .map(([, t]) => t.pub);
      const key = services.wallet.loadKey();
      return (
        <MyRecordsView
          specimen
          records={myRecords({
            schedule: services.ledger.schedule,
            closed: services.ledger.closed(),
            myPubs: pubs,
            registeredRound: null,
            now: services.ledger.now(),
          })}
          schedule={services.ledger.schedule}
          recipient={key ? astronautOf(key.pub).name : null}
          onBack={onBack}
        />
      );
    }
    case "rounds":
      return (
        <RoundsView
          services={services}
          version={0}
          onBack={onBack}
          onOpen={noop}
        />
      );
    case "win-notice":
      return <WinNotice services={services} tickets={[drawn.ticket]} />;
    case "link-open":
      return (
        <CheckLink services={services} token={s.links.fresh} onClose={onBack} />
      );
    case "link-used":
      return (
        <CheckLink services={services} token={s.links.used} onClose={onBack} />
      );
    case "winner":
      return <Inbox services={services} tickets={[drawn.ticket]} />;
    case "checker":
      return (
        <CheckLink
          services={services}
          token={s.links.waiting}
          onClose={onBack}
        />
      );
    case "check-ok":
    case "check-fail":
      return (
        <CheckLink
          services={services}
          token={s.links.waiting}
          onClose={onBack}
          preset={id === "check-ok" ? s.confirmed : s.failed}
        />
      );
    case "register":
      return (
        <KeySetup
          demo
          env={null}
          working={null}
          note={null}
          error={null}
          onCreate={noop}
          onRecover={noop}
        />
      );
    case "id-card":
      return <AstronautPanel services={services} pub={drawn.ticket.pub} />;
    case "id-earth":
      return (
        <AstronautPanel
          services={services}
          pub={fromBase64Url(TOUR_EARTH_PUB)}
        />
      );
    case "id-laika":
    case "id-prince":
    case "id-rabbit":
      return (
        <AstronautPanel
          services={services}
          pub={fromBase64Url(
            TOUR_EGG_PUBS[id.slice(3) as keyof typeof TOUR_EGG_PUBS],
          )}
        />
      );
    case "sheet-create":
    case "sheet-sign":
    case "sheet-check":
      return (
        <DemoUnlockPrompt
          ask={{
            id: 0,
            purpose:
              id === "sheet-create"
                ? "create"
                : id === "sheet-sign"
                  ? "sign"
                  : "check",
            answer: onBack,
          }}
        />
      );
    case "fx-gate":
    case "fx-issue":
    case "fx-issue-earth":
    case "fx-issue-andromeda":
    case "fx-welcome":
    case "fx-submit":
    case "fx-print":
    case "fx-bounce":
    case "fx-error-busy":
    case "fx-error-offline":
    case "fx-card-open":
    case "fx-card-entered":
    case "fx-card-drawing":
    case "fx-card-closed-none":
      return <FxScreen id={id} s={s} />;
    case "in-app":
    case "no-passkey":
      return (
        <KeySetup
          demo={false}
          env={
            id === "in-app"
              ? { inApp: "카카오톡", api: true, platform: true, ua: "" }
              : { inApp: null, api: false, platform: false, ua: "" }
          }
          working={null}
          note={null}
          error={null}
          onCreate={noop}
          onRecover={noop}
        />
      );
  }
}
