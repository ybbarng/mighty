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
  SUIT_NAME,
  SUIT_SYMBOL,
} from "@/game/terms";
import { cn } from "@/lib/cn";

import { CardArt } from "../card-art/CardArt";

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
      <p className="text-center text-xs opacity-70">
        고른 카드를 가진 사람이 이번 판에서 빠집니다. 내 손에 있거나 이미 고른
        카드는 헛다리입니다.
      </p>
      {decision.failed.length > 0 && (
        <p className="text-center text-xs">
          헛다리: {decision.failed.map(cardLabel).join(", ")}
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
          {card ? `${cardLabel(card)} 지목` : "카드를 고르세요"}
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
            key={index}
            type="button"
            onClick={() => onSubmit({ type: "pick", index })}
            className="flex flex-col items-center gap-1"
          >
            <span className="block h-28 w-20 rounded-md shadow-lg transition hover:-translate-y-1">
              <CardArt card={card} theme={theme} />
            </span>
            <span className="text-xs">{label}</span>
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
        kind === "jokerSuit"
          ? "조커로 부를 무늬를 고르세요"
          : `${cardLabel(card)}로 조커콜을 할까요?`
      }
    >
      {kind === "jokerSuit" ? (
        <div className="flex justify-center gap-2">
          {SUITS.map((s) => (
            <button
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
              {SUIT_SYMBOL[s]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex justify-center gap-2">
          <ActionButton onClick={() => onChoose({ jokerCall: true })}>
            조커콜!
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => onChoose({ jokerCall: false })}
          >
            그냥 내기
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
  if (!result || !view.goal) return null;
  const ruling = view.seat === view.declarer || view.seat === view.friend;
  const won = ruling === result.rulingWon;
  const gameOver = view.phase === "gameOver";
  return (
    <Panel title={won ? "승리!" : "패배"}>
      <p className="text-center text-sm">
        {seatName(view.declarer ?? 0)}의 공약 {goalLabel(view.goal)} — 여당{" "}
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
              <tr key={seat} className={cn(seat === view.seat && "font-bold")}>
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
                <th className="pr-3 text-left">이름</th>
                <th className="px-1">득점</th>
                <th
                  className="px-1"
                  title="같은 편이 이긴 트릭에 점수 카드를 낸 수"
                >
                  도움
                </th>
                <th
                  className="px-1"
                  title="상대 편이 이긴 트릭에 점수 카드를 낸 수"
                >
                  실점
                </th>
                <th className="px-1" title="선을 잡은 트릭의 비율">
                  점유율
                </th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((seat) => (
                <tr key={seat}>
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
            돈이 바닥난 사람이 생겨 게임이 끝났습니다. 내 등수는{" "}
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
          <div className="flex justify-center">
            <ActionButton onClick={() => onSubmit({ type: "continue" })}>
              다음 판
            </ActionButton>
          </div>
        )
      )}
    </Panel>
  );
}
