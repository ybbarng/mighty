"use client";

import { useEffect, useState } from "react";

import {
  ATTACKS,
  type AttackResult,
  buildWorld,
  type CheckOutcome,
  honestCheck,
  type Role,
  type World,
} from "./attacks";
import { Btn, Toy, Verdict } from "./ui";

const ROLES: { id: Role; label: string; who: string }[] = [
  {
    id: "operator",
    label: "서버 운영자",
    who: "장부를 쓰고 앵커 저장소도 가진 사람. 고친 뒤 사슬을 다시 잇고 앵커도 강제 push로 고쳐 쓴다고 칩니다",
  },
  { id: "entrant", label: "다른 참가자", who: "응모권을 내는 누구나" },
  {
    id: "middle",
    label: "중간자",
    who: "내 기기와 서버 사이에서 오가는 것을 바꿀 수 있는 사람",
  },
];

/** 9. 공격해 보기: 작은 실제 장부를 고치고 core의 검사가 어디서 잡는지 본다 */
export function AttackToy() {
  const [world, setWorld] = useState<World | null>(null);
  const [honest, setHonest] = useState<CheckOutcome | null>(null);
  const [role, setRole] = useState<Role>("operator");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<AttackResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void buildWorld().then(async (w) => {
      if (!live) return;
      setWorld(w);
      const h = await honestCheck(w);
      if (live) setHonest(h);
    });
    return () => {
      live = false;
    };
  }, []);

  const run = async (id: string) => {
    const attack = ATTACKS.find((a) => a.id === id);
    if (!world || !attack) return;
    setPicked(id);
    setResult(null);
    setBusy(true);
    try {
      setResult(await attack.run(world));
    } finally {
      setBusy(false);
    }
  };

  const current = ROLES.find((r) => r.id === role);
  const attack = ATTACKS.find((a) => a.id === picked);

  return (
    <Toy title="공격해 보기" id="attack">
      <p className="text-white/60 text-xs">
        이 브라우저에서 작은 장부를 실제로 만들었습니다: 1회차에 세 명이
        응모했고(나는 1등), 추첨은 실제 drand 1,000,000회 값, 봉인 토큰은 연습용
        시각 인증 기관이 냈습니다. 2회차는 봉인을 받지 못한 무효 회차입니다.
        공격을 고르면 장부를 고친 뒤 검증하기 페이지와 같은 장부 전체 검사를
        돌립니다.
      </p>
      <Verdict
        ok={honest ? honest.problems.length === 0 : null}
        testId="attack-honest"
      >
        {honest === null
          ? "장부를 만들고 검사하는 중"
          : honest.problems.length === 0
            ? "고치기 전 장부는 모든 검사를 통과합니다"
            : honest.problems.join(" · ")}
      </Verdict>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {ROLES.map((r) => (
          <Btn
            key={r.id}
            active={r.id === role}
            onClick={() => {
              setRole(r.id);
              setPicked(null);
              setResult(null);
            }}
          >
            {r.label}
          </Btn>
        ))}
      </div>
      {current && <p className="text-white/55 text-xs">{current.who}</p>}
      <div className="flex flex-col gap-1.5">
        {ATTACKS.filter((a) => a.role === role).map((a) => (
          <button
            key={a.id}
            type="button"
            data-attack={a.id}
            disabled={!world || busy}
            onClick={() => void run(a.id)}
            className={`flex flex-col rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${
              a.id === picked
                ? "border-amber-300 bg-amber-300/10"
                : "border-white/15 bg-white/5 hover:bg-white/10"
            }`}
          >
            <span className="font-semibold">{a.title}</span>
            <span className="text-white/55 text-xs">{a.how}</span>
          </button>
        ))}
      </div>
      {attack && (
        <div
          data-attack-result={result ? "done" : "running"}
          className="flex flex-col gap-2"
        >
          <Verdict ok={result ? false : null} testId="attack">
            {result === null
              ? "장부를 고치고 다시 검사하는 중"
              : result.caught.length > 0
                ? `「${attack.title}」 걸렸습니다. ${result.why}`
                : "걸리지 않았습니다"}
          </Verdict>
          {result && result.caught.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg bg-black/30 p-2 text-[11px] text-rose-100/90">
              {result.caught.map((c) => (
                <li key={c} className="break-keep">
                  · {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Toy>
  );
}
