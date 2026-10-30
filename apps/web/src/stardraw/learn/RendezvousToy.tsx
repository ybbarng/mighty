"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";

import { astronautOf } from "../astronaut/identity";
import { GAME_NS } from "../services";
import { createWallet } from "../wallet";
import {
  ADDRESS_POOL,
  type Addr,
  assign,
  colorOf,
  expectedMoveShare,
  movedIndices,
  residents,
  START_COUNT,
  sampleSeeds,
  scoreTable,
  seedOfKey,
} from "./rendezvous";
import { Btn, Mono, Row, Toy, Verdict } from "./ui";

/** 점으로 그리는 우주인 수(8줄 × 6칸) */
const PEOPLE = 48;
const START = ADDRESS_POOL.slice(0, START_COUNT);

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 끝 글자의 받침 번호(0이면 받침 없음, 한글이 아니면 0) */
function batchim(word: string): number {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : 0;
}
const obj = (w: string) => `${w}${batchim(w) ? "을" : "를"}`;
const subj = (w: string) => `${w}${batchim(w) ? "이" : "가"}`;
/** 받침이 없거나 ㄹ(8)이면 "로" */
const toward = (w: string) =>
  `${w}${batchim(w) && batchim(w) !== 8 ? "으로" : "로"}`;

/** 이 기기에 등록증(패스키 공개 열쇠)이 있으면 그 열쇠 */
function useMyKey(): Uint8Array | null {
  const [pub, setPub] = useState<Uint8Array | null>(null);
  useEffect(() => {
    try {
      setPub(createWallet(GAME_NS).loadKey()?.pub ?? null);
    } catch {
      setPub(null);
    }
  }, []);
  return pub;
}

/** 우주인 씨앗: 등록증이 있으면 0번이 나, 나머지는 견본 */
function usePeople(pub: Uint8Array | null): Uint8Array[] {
  return useMemo(() => {
    const samples = sampleSeeds(PEOPLE);
    return pub ? [seedOfKey(pub), ...samples.slice(1)] : samples;
  }, [pub]);
}

function DotGrid({
  homes,
  moved,
  version,
  selected,
  onSelect,
  me,
  testId,
  wide = false,
}: {
  homes: readonly string[];
  moved: ReadonlySet<number>;
  /** 바뀔 때마다 반짝임을 다시 시작한다 */
  version: number;
  selected?: number;
  onSelect?: (i: number) => void;
  me: boolean;
  testId: string;
  /** 넓은 상자에서는 한 줄에 더 많이 놓아 점이 너무 커지지 않게 */
  wide?: boolean;
}) {
  return (
    <div
      data-grid={testId}
      className={cn(
        "grid gap-1",
        wide ? "grid-cols-12 gap-1.5" : "grid-cols-8",
      )}
    >
      {homes.map((h, i) => {
        const isMe = me && i === 0;
        const label = isMe ? "나" : `우주인 ${i + 1}`;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: 점 차례가 곧 우주인이다
            key={`${i}-${moved.has(i) ? version : 0}`}
            type="button"
            aria-label={label}
            title={label}
            data-moved={moved.has(i) || undefined}
            onClick={() => onSelect?.(i)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-full font-bold text-[9px] text-slate-900 transition-colors duration-500",
              moved.has(i) && "sd-moved ring-2 ring-white",
              selected === i &&
                "outline outline-2 outline-amber-300 outline-offset-1",
              !onSelect && "cursor-default",
            )}
            style={{ backgroundColor: colorOf(h) }}
          >
            {isMe ? "★" : ""}
          </button>
        );
      })}
    </div>
  );
}

function Legend({
  list,
  homes,
}: {
  list: readonly Addr[];
  homes: readonly string[];
}) {
  const count = residents(homes, list);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/75">
      {list.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: colorOf(a.id) }}
          />
          {a.name}
          <span className="text-white/45 tabular-nums">
            {count.get(a.id) ?? 0}
          </span>
        </span>
      ))}
    </div>
  );
}

/** 나머지 방식과 나란히 + 점수표(주소 목록을 함께 쓴다) */
function CompareAndScore({
  pub,
  people,
}: {
  pub: Uint8Array | null;
  people: Uint8Array[];
}) {
  const [list, setList] = useState<Addr[]>(START);
  const [prev, setPrev] = useState<Addr[] | null>(null);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(0);
  const me = pub !== null;

  const change = (next: Addr[]) => {
    setPrev(list);
    setList(next);
    setVersion((v) => v + 1);
  };
  const canAdd = list.length < ADDRESS_POOL.length;
  const add = () => change(ADDRESS_POOL.slice(0, list.length + 1));
  const remove = () => change(list.slice(0, -1));

  const mod = useMemo(() => assign(people, list, "mod"), [people, list]);
  const hrw = useMemo(() => assign(people, list, "hrw"), [people, list]);
  const modBefore = useMemo(
    () => (prev ? assign(people, prev, "mod") : mod),
    [people, prev, mod],
  );
  const hrwBefore = useMemo(
    () => (prev ? assign(people, prev, "hrw") : hrw),
    [people, prev, hrw],
  );
  const modMoved = new Set(movedIndices(modBefore, mod));
  const hrwMoved = new Set(movedIndices(hrwBefore, hrw));
  const expected = prev ? expectedMoveShare(prev.length, list.length) : 0;
  const added = prev && list.length > prev.length ? list.at(-1) : undefined;
  const dropped = prev && list.length < prev.length ? prev.at(-1) : undefined;

  return (
    <>
      <Toy title="나머지 방식과 랑데부 해싱 나란히" id="rendezvous">
        <div className="flex flex-wrap gap-1.5">
          <Btn primary onClick={add} disabled={!canAdd}>
            주소 하나 더하기
          </Btn>
          <Btn onClick={remove} disabled={list.length <= 2}>
            주소 하나 빼기
          </Btn>
          <Btn
            onClick={() => {
              setList(START);
              setPrev(null);
            }}
          >
            처음대로
          </Btn>
        </div>
        <Legend list={list} homes={hrw} />
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["mod", "해시 % 목록 길이", mod, modMoved],
              ["hrw", "랑데부 해싱", hrw, hrwMoved],
            ] as const
          ).map(([key, title, homes, moved]) => (
            <div key={key} className="flex min-w-0 flex-col gap-1.5">
              <span className="font-semibold text-xs">{title}</span>
              <DotGrid
                homes={homes}
                moved={moved}
                version={version}
                selected={selected}
                onSelect={setSelected}
                me={me}
                testId={key}
              />
              <span
                data-moved-count={key}
                className={cn(
                  "text-[11px] tabular-nums",
                  prev ? "text-white/85" : "text-white/45",
                )}
              >
                이사 {moved.size}/{people.length}명 (
                {pct(moved.size / people.length)})
                {key === "hrw" && prev && (
                  <span className="block text-white/55">
                    기댓값 1/{Math.max(prev.length, list.length)} ≈{" "}
                    {pct(expected)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/55">
          점 하나가 우주인 한 명, 색이 사는 주소입니다. 견본 우주인은 가짜
          열쇠로 만든 점이라 이름과 사진이 없습니다
          {me ? ". ★는 이 기기의 내 등록증입니다" : ""}. 점을 누르면 아래
          점수표에서 그 우주인을 봅니다.
        </p>
        {prev && (
          <Verdict ok={hrwMoved.size < modMoved.size} testId="rendezvous-moves">
            {added
              ? `${obj(added.name)} 더하자 나머지 방식은 ${modMoved.size}명이 이사했고, 랑데부 해싱은 ${added.name} 점수가 1등이 된 ${hrwMoved.size}명만 이사했습니다.`
              : dropped
                ? `${obj(dropped.name)} 빼자 나머지 방식은 ${modMoved.size}명이 이사했고, 랑데부 해싱은 ${dropped.name}에 살던 ${hrwMoved.size}명만 옮겼습니다.`
                : ""}
          </Verdict>
        )}
      </Toy>
      <ScoreTable
        pub={pub}
        people={people}
        list={list}
        prev={prev}
        selected={selected}
        setSelected={setSelected}
      />
    </>
  );
}

function fmt(score: number): string {
  return score >= 100 ? score.toFixed(0) : score.toFixed(2);
}

function ScoreTable({
  pub,
  people,
  list,
  prev,
  selected,
  setSelected,
}: {
  pub: Uint8Array | null;
  people: Uint8Array[];
  list: readonly Addr[];
  prev: readonly Addr[] | null;
  selected: number;
  setSelected: (i: number) => void;
}) {
  const seed = people[selected] as Uint8Array;
  const rows = useMemo(() => scoreTable(seed, list), [seed, list]);
  const top = rows.reduce((a, b) => (b.score > a.score ? b : a));
  const max = top.score;
  const prevRows = useMemo(
    () => (prev ? scoreTable(seed, prev) : null),
    [seed, prev],
  );
  const prevTop = prevRows?.reduce((a, b) => (b.score > a.score ? b : a));
  const prevIds = new Set(prev?.map((a) => a.id));
  const isMe = pub !== null && selected === 0;
  const who = isMe ? "나(이 기기의 등록증)" : `견본 우주인 ${selected + 1}`;
  const newRow = prev ? rows.find((r) => !prevIds.has(r.id)) : undefined;

  let story: string | null = null;
  if (prev && prevTop) {
    if (newRow)
      story =
        newRow.id === top.id
          ? `새 주소 ${newRow.name}의 점수 ${fmt(newRow.score)}가 원래 1등 ${prevTop.name}(${fmt(prevTop.score)})보다 높아 ${toward(newRow.name)} 이사합니다.`
          : `새 주소 ${newRow.name}의 점수 ${fmt(newRow.score)}가 1등 ${top.name}(${fmt(top.score)})보다 낮아 그대로 삽니다. 다른 막대는 하나도 바뀌지 않았습니다.`;
    else if (prevTop.id !== top.id)
      story = `살던 ${subj(prevTop.name)} 빠져 2등이던 ${toward(top.name)} 옮겼습니다.`;
    else
      story = `빠진 주소가 1등이 아니라 그대로 삽니다. 남은 막대는 하나도 바뀌지 않았습니다.`;
  }

  return (
    <Toy title="한 우주인의 점수표" id="rendezvous-score">
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn
          onClick={() =>
            setSelected((selected + people.length - 1) % people.length)
          }
        >
          ◀
        </Btn>
        <span
          data-score-who
          className="min-w-32 text-center font-semibold text-xs"
        >
          {who}
        </span>
        <Btn onClick={() => setSelected((selected + 1) % people.length)}>▶</Btn>
        {pub && !isMe && <Btn onClick={() => setSelected(0)}>★ 나</Btn>}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const best = r.id === top.id;
          return (
            <div
              key={r.id}
              data-score-row={r.id}
              data-top={best || undefined}
              className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs"
            >
              <span className={cn("truncate", best && "font-bold")}>
                {r.name}
                {r === newRow && (
                  <span className="ml-1 text-[10px] text-amber-300">새</span>
                )}
              </span>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    r === newRow && "sd-moved",
                  )}
                  style={{
                    width: `${Math.max(2, (r.score / max) * 100)}%`,
                    backgroundColor: colorOf(r.id),
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-right font-mono tabular-nums",
                  best ? "text-amber-200" : "text-white/60",
                )}
              >
                {best ? "★ " : ""}
                {fmt(r.score)}
              </span>
            </div>
          );
        })}
      </div>
      <Row label="내 주소">
        <span className="font-semibold">{top.name}</span>
        <span className="text-white/55"> (점수 1등)</span>
      </Row>
      <Row label="점수">
        <span className="flex flex-col items-start gap-0.5">
          <Mono>-가중치 / ln(u)</Mono>
          <Mono>u = sha256(씨앗‖"place"‖0‖id)를 0~1로</Mono>
        </span>
      </Row>
      {story && (
        <Verdict ok testId="rendezvous-score">
          {story}
        </Verdict>
      )}
      {isMe && pub && (
        <p className="text-[11px] text-white/55">
          실제 등록증은 주소 수백 곳 전체에서 같은 방식으로 골라{" "}
          {astronautOf(pub).home}입니다. 여기 목록은 짧은 견본이라 다를 수
          있습니다.
        </p>
      )}
    </Toy>
  );
}

type Edit = "remove" | "rename" | "reid" | "weight";

const TARGET = START[0] as Addr;
const RENAMED = "붉은 행성";
const NEW_ID = "mars-2";

function edited(edit: Edit | null): Addr[] {
  switch (edit) {
    case "remove":
      return START.filter((a) => a.id !== TARGET.id);
    case "rename":
      return START.map((a) => (a === TARGET ? { ...a, name: RENAMED } : a));
    case "reid":
      return START.map((a) => (a === TARGET ? { ...a, id: NEW_ID } : a));
    case "weight":
      return START.map((a) => (a === TARGET ? { ...a, weight: 2 } : a));
    default:
      return START;
  }
}

/** 빼 보기·이름 고쳐 보기·id 바꿔 보기·가중치 */
function EditToy({ people, me }: { people: Uint8Array[]; me: boolean }) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [version, setVersion] = useState(0);
  const list = useMemo(() => edited(edit), [edit]);
  const before = useMemo(() => assign(people, START, "hrw"), [people]);
  const after = useMemo(() => assign(people, list, "hrw"), [people, list]);
  const moved = movedIndices(before, after);
  const movedSet = new Set(moved);
  const beforeCount = residents(before, START);
  const afterCount = residents(after, list);
  const oldCount = beforeCount.get(TARGET.id) ?? 0;
  const oldResidents = before.flatMap((h, i) => (h === TARGET.id ? [i] : []));
  // 가중치는 점 48개로는 들쭉날쭉해 견본 600명으로도 센다
  const many = useMemo(
    () => (edit === "weight" ? sampleSeeds(600) : null),
    [edit],
  );
  const manyCounts = useMemo(() => {
    if (!many) return null;
    return [
      residents(assign(many, START, "hrw"), START).get(TARGET.id) ?? 0,
      residents(assign(many, list, "hrw"), list).get(TARGET.id) ?? 0,
    ] as const;
  }, [many, list]);

  const pick = (e: Edit) => {
    setEdit(edit === e ? null : e);
    setVersion((v) => v + 1);
  };

  let result: { ok: boolean; text: string } | null = null;
  if (edit === "remove")
    result = {
      ok: moved.length === oldCount,
      text: `${TARGET.name}에 살던 ${oldCount}명만 이사했습니다. 다른 주소 주민은 아무도 움직이지 않았습니다.`,
    };
  else if (edit === "rename")
    result = {
      ok: moved.length === 0,
      text: `화면 이름을 '${RENAMED}'${toward(RENAMED).slice(RENAMED.length)} 고쳤지만 이사한 사람은 ${moved.length}명입니다. 점수는 id(${TARGET.id})로 계산하기 때문입니다.`,
    };
  else if (edit === "reid") {
    const left = oldResidents.filter((i) => after[i] !== NEW_ID).length;
    const came = moved.length - oldResidents.length;
    result = {
      ok: false,
      text: `id를 ${TARGET.id} → ${NEW_ID}로 바꾸자 이 주소의 점수가 모두 새로 나와 ${TARGET.name} 주민 ${oldCount}명 가운데 ${left}명이 다른 곳으로 흩어지고, 다른 주소에서 ${came}명이 들어왔습니다. 그래서 id는 한 번 정하면 고치지 않습니다.`,
    };
  } else if (edit === "weight") {
    const newCount = residents(after, list).get(TARGET.id) ?? 0;
    result = {
      ok: true,
      text: `${TARGET.name}의 가중치를 2배로 하자 주민이 ${oldCount}명 → ${newCount}명이 됐습니다${manyCounts ? `(견본 600명으로 세면 ${manyCounts[0]}명 → ${manyCounts[1]}명)` : ""}. 기댓값은 1/5 → 2/6입니다. 이사한 사람은 모두 ${toward(TARGET.name)} 옮겨 왔습니다.`,
    };
  }

  return (
    <Toy title="빼 보기·이름 고쳐 보기" id="rendezvous-edit">
      <div className="flex flex-wrap gap-1.5">
        <Btn active={edit === "remove"} onClick={() => pick("remove")}>
          {TARGET.name} 빼기
        </Btn>
        <Btn active={edit === "rename"} onClick={() => pick("rename")}>
          이름만 고치기
        </Btn>
        <Btn active={edit === "reid"} onClick={() => pick("reid")}>
          id 바꾸기
        </Btn>
        <Btn active={edit === "weight"} onClick={() => pick("weight")}>
          가중치 2배
        </Btn>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px]">
        {START.map((orig) => {
          // 같은 자리의 주소(빼면 없다)
          const a = list.find((x) => x.id === orig.id || x.name === orig.name);
          const was = beforeCount.get(orig.id) ?? 0;
          const now = a ? (afterCount.get(a.id) ?? 0) : 0;
          return (
            <div
              key={orig.id}
              className={cn(
                "flex items-center gap-2",
                !a && "text-white/40 line-through",
              )}
            >
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorOf((a ?? orig).id) }}
              />
              <span className="w-24 truncate">{(a ?? orig).name}</span>
              <Mono tone={a?.id === NEW_ID ? "warn" : "plain"}>
                {(a ?? orig).id}
              </Mono>
              {a && a.weight !== 1 && (
                <span className="text-amber-300">×{a.weight}</span>
              )}
              <span className="ml-auto text-white/60 tabular-nums">
                {was === now ? `${now}명` : `${was} → ${now}명`}
              </span>
            </div>
          );
        })}
      </div>
      <DotGrid
        homes={after}
        moved={movedSet}
        version={version}
        me={me}
        testId="edit"
        wide
      />
      {result ? (
        <Verdict ok={result.ok} testId="rendezvous-edit">
          {result.text}
        </Verdict>
      ) : (
        <p className="text-[11px] text-white/55">
          단추를 눌러 {obj(TARGET.name)} 바꿔 보세요. 이사한 우주인이
          반짝입니다.
        </p>
      )}
    </Toy>
  );
}

/** 보안 배우기 부록: 우주인 등록증을 고르는 랑데부 해싱 */
export function RendezvousToys() {
  const pub = useMyKey();
  const people = usePeople(pub);
  return (
    <>
      <CompareAndScore pub={pub} people={people} />
      <EditToy people={people} me={pub !== null} />
    </>
  );
}
