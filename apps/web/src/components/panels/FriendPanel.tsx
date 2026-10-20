"use client";

import {
  type Action,
  type Card,
  type Decision,
  type FriendDeclaration,
  type Kiruda,
  mightyOf,
  type RuleSet,
  sameFriend,
} from "@mighty/engine";
import { useState } from "react";

import { friendLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

import { ActionButton, CardPicker, Panel } from "./common";

type FriendDecision = Extract<Decision, { kind: "friend" }>;

export function FriendPanel({
  rules,
  kiruda,
  decision,
  seatName,
  onSubmit,
}: {
  rules: RuleSet;
  kiruda: Kiruda;
  decision: FriendDecision;
  seatName: (seat: number) => string;
  onSubmit: (action: Action) => void;
}) {
  const available = (card: Card) =>
    decision.options.some((o) => o.kind === "card" && o.card === card);
  const mighty = mightyOf(rules, kiruda);
  const quick: { label: string; friend: FriendDeclaration }[] = [];
  const addCard = (label: string, card: Card) => {
    if (available(card)) quick.push({ label, friend: { kind: "card", card } });
  };
  addCard("마이티", mighty);
  addCard("조커", "JK");
  if (kiruda !== "NT") {
    addCard("기루다 A", `${kiruda}A`);
    addCard("기루다 K", `${kiruda}K`);
  }
  if (decision.options.some((o) => o.kind === "firstTrick"))
    quick.push({ label: "초구", friend: { kind: "firstTrick" } });
  quick.push({ label: "노프렌드", friend: { kind: "none" } });
  const players = decision.options.filter(
    (o): o is Extract<FriendDeclaration, { kind: "player" }> =>
      o.kind === "player",
  );

  const [choice, setChoice] = useState<FriendDeclaration>(
    quick[0]?.friend ?? { kind: "none" },
  );
  const pickedCard = choice.kind === "card" ? choice.card : null;
  const valid = decision.options.some((o) => sameFriend(o, choice));

  return (
    <Panel title="프렌드를 정하세요" term="friend">
      <div className="flex flex-wrap justify-center gap-1.5">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setChoice(q.friend)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              sameFriend(q.friend, choice)
                ? "border-amber-300 bg-white text-black"
                : "border-white/20 bg-white/10",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
      {players.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {players.map((p) => (
            <button
              key={p.seat}
              type="button"
              onClick={() => setChoice(p)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                sameFriend(p, choice)
                  ? "border-amber-300 bg-white text-black"
                  : "border-white/20 bg-white/10",
              )}
            >
              {seatName(p.seat)} 지목
            </button>
          ))}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-center text-xs opacity-70">
          다른 카드로 정하기
        </summary>
        <div className="mt-2">
          <CardPicker
            value={pickedCard}
            available={available}
            allowJoker={rules.jokerFriend}
            onChange={(card) => setChoice({ kind: "card", card })}
          />
        </div>
      </details>
      <div className="panel-pair flex flex-col items-center gap-1">
        <span className="text-sm">
          {friendLabel(choice, seatName)}
          {pickedCard &&
            !available(pickedCard) &&
            " — 내 손에 있거나 버린 카드라 지목할 수 없습니다"}
        </span>
        <ActionButton
          disabled={!valid}
          onClick={() => onSubmit({ type: "friend", friend: choice })}
        >
          확정
        </ActionButton>
      </div>
    </Panel>
  );
}
