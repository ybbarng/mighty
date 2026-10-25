"use client";

import {
  type Action,
  type Card,
  type Decision,
  type PlayerView,
  SUITS,
  type Suit,
} from "@mighty/engine";
import { useState } from "react";
import { useCardTheme } from "@/game/settings";
import {
  cardLabel,
  goalLabel,
  isRedSuit,
  jokerCallLabel,
  jokerSuitLabel,
  SUIT_NAME,
  slangTerms,
} from "@/game/terms";
import { cn } from "@/lib/cn";

import { CardArt } from "../card-art/CardArt";
import { SuitMark, SuitText } from "../SuitText";

import { ActionButton, CardPicker, Panel } from "./common";

/** 6·7마: 죽일 카드 지목 */
export function KillPanel({
  decision,
  hand,
  onSubmit,
}: {
  decision: Extract<Decision, { kind: "kill" }>;
  hand: Card[];
  onSubmit: (action: Action) => void;
}) {
  const [card, setCard] = useState<Card | null>(null);
  const tried = new Set([...decision.failed, ...hand]);
  return (
    <Panel title="이번 판에서 뺄 사람을 카드로 지목하세요">
      <p className="panel-aside text-center text-xs opacity-70">
        고른 카드를 가진 사람이 이번 판에서 빠집니다. 내 손에 있거나 이미 고른
        카드는 헛다리입니다.
      </p>
      {decision.failed.length > 0 && (
        <p className="text-center text-xs">
          헛다리: <SuitText text={decision.failed.map(cardLabel).join(", ")} />
        </p>
      )}
      <CardPicker
        value={card}
        onChange={setCard}
        available={(c) => !tried.has(c)}
        allowJoker
      />
      <div className="flex justify-center">
        <ActionButton
          disabled={card === null}
          onClick={() => card && onSubmit({ type: "kill", card })}
        >
          <SuitText
            text={card ? `${cardLabel(card)} 지목` : "카드를 고르세요"}
          />
        </ActionButton>
      </div>
    </Panel>
  );
}

/** 2마: 보이는 카드와 안 보이는 카드 중 하나 고르기 */
export function PickPanel({
  faceUp,
  onSubmit,
}: {
  faceUp: Card;
  onSubmit: (action: Action) => void;
}) {
  const theme = useCardTheme();
  return (
    <Panel title="한 장을 고르세요">
      <p className="text-center text-xs opacity-70">
        고르지 않은 카드는 이번 판에서 빠집니다.
      </p>
      <div className="flex justify-center gap-4">
        {(
          [
            [0, faceUp, cardLabel(faceUp)],
            [1, null, "안 보이는 카드"],
          ] as const
        ).map(([index, card, label]) => (
          <button
            data-choice
            key={index}
            type="button"
            onClick={() => onSubmit({ type: "pick", index })}
            className="flex flex-col items-center gap-1"
          >
            <span className="block h-28 w-20 rounded-md shadow-lg transition hover:-translate-y-1">
              <CardArt card={card} theme={theme} />
            </span>
            <span className="text-xs">
              <SuitText text={label} />
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** 선으로 조커를 낼 때 무늬 고르기, 조커콜 카드를 낼 때 선언 여부 */
export function LeadChoicePanel({
  card,
  kind,
  kiruda,
  onChoose,
  onCancel,
}: {
  card: Card;
  kind: "jokerSuit" | "jokerCall";
  kiruda: Suit | "NT";
  onChoose: (choice: { jokerSuit?: Suit; jokerCall?: boolean }) => void;
  onCancel: () => void;
}) {
  return (
    <Panel
      title={
        kind === "jokerSuit" ? (
          "조커로 부를 무늬를 고르세요"
        ) : (
          <SuitText text={`${cardLabel(card)}로 조커콜을 할까요?`} />
        )
      }
    >
      {kind === "jokerSuit" ? (
        <div className="flex justify-center gap-2">
          {SUITS.map((s) => (
            <button
              data-choice
              key={s}
              type="button"
              title={SUIT_NAME[s]}
              onClick={() => onChoose({ jokerSuit: s })}
              className={cn(
                "h-12 w-12 rounded-xl border bg-white text-2xl",
                isRedSuit(s) ? "text-red-600" : "text-black",
                s === kiruda
                  ? "border-amber-400 ring-2 ring-amber-400"
                  : "border-transparent",
              )}
            >
              <SuitMark suit={s} />
              {slangTerms() && (
                <span className="block font-semibold text-[10px] leading-none">
                  {jokerSuitLabel(s)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex justify-center gap-2">
          <ActionButton onClick={() => onChoose({ jokerCall: true })}>
            {jokerCallLabel()}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => onChoose({ jokerCall: false })}
          >
            {slangTerms() ? "쪼콜 아님" : "그냥 내기"}
          </ActionButton>
        </div>
      )}
      <button
        type="button"
        className="text-xs underline opacity-70"
        onClick={onCancel}
      >
        취소
      </button>
    </Panel>
  );
}

const MULTIPLIER_LABEL = {
  run: "런",
  reverseRun: "백런",
  noKiruda: "노기루다",
  noFriend: "노프렌드",
} as const;

/** 여당(주공·프렌드)은 금색, 야당은 하늘색 표시 */
function SideTag({ ruling }: { ruling: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 font-semibold text-[10px]",
        ruling ? "bg-amber-400 text-amber-950" : "bg-sky-300/80 text-sky-950",
      )}
    >
      {ruling ? "여당" : "야당"}
    </span>
  );
}

export function RoundResultPanel({
  view,
  startMoney,
  seatName,
  onSubmit,
  onNewGame,
}: {
  view: PlayerView;
  startMoney: number[];
  seatName: (seat: number) => string;
  onSubmit: (action: Action) => void;
  onNewGame: () => void;
}) {
  const result = view.result;
  // 판 점수 없이 끝났다: 끊긴 사람을 더 기다리지 않고 중간에 끝냈다(멘탈 포커 온라인).
  if (view.phase === "gameOver" && (!result || !view.goal))
    return (
      <Panel title="게임을 중간에 끝냈습니다">
        <p className="text-center text-sm">
          이번 판은 점수를 매기지 않았습니다.
        </p>
        <ActionButton onClick={onNewGame}>처음으로</ActionButton>
      </Panel>
    );
  if (!result || !view.goal) return null;
  const bankrupt = view.order.some((s) => (view.money[s] ?? 0) <= 0);
  const ruling = view.seat === view.declarer || view.seat === view.friend;
  const won = ruling === result.rulingWon;
  const gameOver = view.phase === "gameOver";
  const isRuling = (seat: number) =>
    seat === view.declarer || seat === view.friend;
  // 우리 편 줄은 굵게, 배경을 살짝 밝게
  const teamRow = (seat: number) =>
    cn(isRuling(seat) === ruling && "bg-white/10 font-bold");
  return (
    <Panel title={won ? "승리!" : "패배"}>
      <p className="text-center text-sm">
        {seatName(view.declarer ?? 0)}의 공약{" "}
        <SuitText text={goalLabel(view.goal, view.rules.playerCount)} /> — 여당{" "}
        {result.rulingPoints}장 {result.rulingWon ? "달성" : "실패"}
      </p>
      <p className="text-center text-xs opacity-70">
        기본 {Math.max(0, result.base)}
        {result.multipliers.map((m) => ` × 2(${MULTIPLIER_LABEL[m]})`).join("")}
        {result.staticRun ? " (런 고정 20)" : ""} = 한 사람당 {result.moved}
      </p>
      <table className="mx-auto text-sm tabular-nums">
        <tbody>
          {view.order.map((seat) => {
            const before = startMoney[seat] ?? view.money[seat] ?? 0;
            const after = view.money[seat] ?? 0;
            const delta = after - before;
            return (
              <tr key={seat} className={teamRow(seat)}>
                <td className="py-0.5 pr-2 pl-1">
                  <SideTag ruling={isRuling(seat)} />
                </td>
                <td className="pr-3">
                  {seatName(seat)}
                  {seat === view.declarer && " (주공)"}
                  {seat === view.friend && " (프렌드)"}
                </td>
                <td className="pr-3 text-right">{after * 10}</td>
                <td
                  className={cn(
                    "text-right",
                    delta > 0
                      ? "text-emerald-300"
                      : delta < 0
                        ? "text-red-300"
                        : "opacity-50",
                  )}
                >
                  {delta > 0 ? "+" : ""}
                  {delta * 10}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {view.history && (
        <details className="text-xs">
          <summary className="cursor-pointer text-center opacity-70">
            이번 판 분석
          </summary>
          <table className="mx-auto mt-2 tabular-nums">
            <thead className="opacity-60">
              <tr>
                <th />
                <th className="pr-3 text-left">이름</th>
                <th className="px-1">득점</th>
                <th
                  className="px-1"
                  title="같은 편이 이긴 턴에 점수 카드를 낸 수"
                >
                  도움
                </th>
                <th
                  className="px-1"
                  title="상대 편이 이긴 턴에 점수 카드를 낸 수"
                >
                  실점
                </th>
                <th className="px-1" title="선을 잡은 턴의 비율">
                  점유율
                </th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((seat) => (
                <tr key={seat} className={teamRow(seat)}>
                  <td className="py-0.5 pr-2 pl-1">
                    <SideTag ruling={isRuling(seat)} />
                  </td>
                  <td className="pr-3">{seatName(seat)}</td>
                  <td className="px-1 text-center">
                    {view.history?.scored[seat] ?? 0}
                  </td>
                  <td className="px-1 text-center">
                    {view.history?.assist[seat] ?? 0}
                  </td>
                  <td className="px-1 text-center">
                    {view.history?.lost[seat] ?? 0}
                  </td>
                  <td className="px-1 text-center">
                    {view.history?.share[seat] ?? 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {gameOver ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-sm">
            {bankrupt
              ? "돈이 바닥난 사람이 생겨 게임이 끝났습니다."
              : "게임을 끝냈습니다."}{" "}
            내 등수는{" "}
            <b>
              {view.order.filter(
                (s) => (view.money[s] ?? 0) > (view.money[view.seat] ?? 0),
              ).length + 1}
              등
            </b>
            입니다.
          </p>
          <ActionButton onClick={onNewGame}>새 게임</ActionButton>
        </div>
      ) : (
        view.decision?.kind === "continue" && (
          // 낮은 화면에서 표가 길어 스크롤되어도 단추는 패널 아래에 붙어 늘 보인다.
          <div className="sticky -bottom-4 -mx-4 -mb-4 flex justify-center bg-gradient-to-t from-black via-black/90 to-transparent px-4 pt-3 pb-4">
            <ActionButton onClick={() => onSubmit({ type: "continue" })}>
              다음 판
            </ActionButton>
          </div>
        )
      )}
    </Panel>
  );
}
