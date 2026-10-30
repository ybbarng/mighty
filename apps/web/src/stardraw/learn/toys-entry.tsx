"use client";

import {
  checkPow,
  entrantId,
  fromHex,
  generateSigner,
  inclusionProof,
  meetsTarget,
  merkleRoot,
  passkeySigner,
  powHash,
  powTargetForTries,
  type SoftPasskey,
  signTicket,
  softPasskeySigner,
  sortLeaves,
  type Ticket,
  ticketBody,
  ticketContent,
  ticketId,
  toHex,
  unsignedTicket,
  verifyInclusion,
  verifyTicketSignature,
} from "@mighty/stardraw-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { LottoBall } from "../components/parts";
import {
  BODY_FIELDS,
  buildTree,
  bumpNumber,
  createDemoPasskey,
  type DemoPasskey,
  demoAssertion,
  type Entry,
  entryTicketId,
  indexOfId,
  MERKLE_ENTRIES,
  practicePub,
  proofNodes,
  readAssertion,
  rpIdAllowed,
  SITE,
  SITE_ORIGIN,
  short,
  treeNodes,
  tryExportPrivateKey,
} from "./lab";
import { Btn, Mono, Row, Toy, Verdict } from "./ui";

const START_NUMBERS = [3, 11, 19, 27, 38, 44];

/** 번호 공 줄. onBump가 있으면 공을 눌러 다음 번호로 바꾼다 */
function Balls({
  numbers,
  onBump,
  changed = [],
}: {
  numbers: readonly number[];
  onBump?: (index: number) => void;
  changed?: readonly number[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {numbers.map((n, i) =>
        onBump ? (
          <button
            key={n}
            type="button"
            onClick={() => onBump(i)}
            aria-label={`${n}번을 다른 번호로 바꾸기`}
            className="rounded-full"
          >
            <LottoBall n={n} size="sm" ring={changed.includes(n)} />
          </button>
        ) : (
          <LottoBall key={n} n={n} size="sm" />
        ),
      )}
    </div>
  );
}

/** 응모권 앞부분 80바이트를 칸별로. 원본과 다른 바이트는 붉게 */
function BodyHex({ body, base }: { body: Uint8Array; base: Uint8Array }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-black/30 p-2 font-mono text-[11px]">
      {BODY_FIELDS.map((f) => {
        const bytes = Array.from(body.slice(f.from, f.to));
        const shown = f.key === "pub" ? bytes.slice(0, 8) : bytes;
        return (
          <div key={f.key} className="flex min-w-0 gap-2">
            <span className="w-16 shrink-0 text-white/50">{f.label}</span>
            <span className="min-w-0 break-all">
              {shown.map((b, i) => {
                const at = f.from + i;
                const diff = base[at] !== b;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 고정 길이 바이트 칸
                    key={i}
                    className={diff ? "text-rose-300" : "text-amber-100/85"}
                  >
                    {b.toString(16).padStart(2, "0")}
                  </span>
                );
              })}
              {f.key === "pub" && (
                <span className="text-white/40">…(65바이트)</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. 서명                                                             */
/* ------------------------------------------------------------------ */

export function SignToy() {
  const [signer, setSigner] = useState<SoftPasskey | null>(null);
  const [numbers, setNumbers] = useState(START_NUMBERS);
  const [signed, setSigned] = useState<Ticket | null>(null);
  const [arrived, setArrived] = useState<Ticket | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // 흉내 패스키(UP·UV 켬): 장부는 패스키 모양 서명만 받는다
    void generateSigner().then((key) => setSigner(softPasskeySigner(key)));
  }, []);

  useEffect(() => {
    if (!arrived) return;
    let live = true;
    setOk(null);
    void verifyTicketSignature(arrived).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [arrived]);

  const sign = async () => {
    if (!signer) return;
    const t = await signTicket(signer, unsignedTicket(signer, 7, numbers), 0);
    setSigned(t);
    setArrived(t);
  };

  const flipSig = () => {
    if (!arrived) return;
    // DER 서명의 r 값 가운데 한 바이트
    const signature = arrived.sig.signature.slice();
    signature[10] = (signature[10] ?? 0) ^ 0x01;
    setArrived({ ...arrived, sig: { ...arrived.sig, signature } });
  };

  return (
    <Toy title="응모권 서명" id="sign">
      <Row label="이 브라우저에서 만든 열쇠">
        {signer ? (
          <>
            공개 열쇠 <Mono>{short(signer.publicKey, 16)}…</Mono> · 응모자 id{" "}
            <Mono>{short(entrantId(signer.publicKey), 12)}</Mono>
          </>
        ) : (
          "만드는 중…"
        )}
      </Row>
      <div className="flex flex-col gap-2">
        <span className="text-white/70 text-xs">
          7회 응모권 번호(공을 누르면 바뀝니다)
        </span>
        <Balls
          numbers={numbers}
          onBump={(i) => {
            setNumbers(bumpNumber(numbers, i));
            setSigned(null);
            setArrived(null);
          }}
        />
        <div>
          <Btn primary onClick={() => void sign()} disabled={!signer}>
            이 번호로 서명하기
          </Btn>
        </div>
      </div>
      {signed && arrived && (
        <div className="flex flex-col gap-2 border-white/10 border-t pt-3">
          <span className="text-white/70 text-xs">
            서버에 도착한 응모권. 공을 누르거나 아래 단추로 한 글자씩 바꿔
            보세요.
          </span>
          <Balls
            numbers={arrived.numbers}
            changed={arrived.numbers.filter((n) => !signed.numbers.includes(n))}
            onBump={(i) =>
              setArrived({
                ...arrived,
                numbers: bumpNumber(arrived.numbers, i),
              })
            }
          />
          <div className="flex flex-wrap gap-1.5">
            <Btn
              onClick={() =>
                setArrived({ ...arrived, round: arrived.round + 1 })
              }
            >
              회차 바꾸기({arrived.round}회)
            </Btn>
            <Btn onClick={flipSig}>서명 한 바이트 바꾸기</Btn>
            <Btn onClick={() => setArrived(signed)}>처음대로</Btn>
          </div>
          <BodyHex body={ticketBody(arrived)} base={ticketBody(signed)} />
          <Row label="서명(패스키 서명, DER)">
            <Mono>{toHex(arrived.sig.signature).slice(0, 48)}…</Mono>
          </Row>
          <Row label="응모권 id">
            <Mono
              tone={
                toHex(ticketId(arrived)) === toHex(ticketId(signed))
                  ? "plain"
                  : "bad"
              }
            >
              {short(ticketId(arrived), 24)}
            </Mono>
          </Row>
          <Verdict ok={ok} testId="sign">
            {ok
              ? "서명이 맞습니다. 이 열쇠의 주인이 이 내용 그대로 냈습니다"
              : "서명이 맞지 않습니다. 서명한 뒤 내용이 바뀌었습니다"}
          </Verdict>
        </div>
      )}
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 2. 패스키                                                           */
/* ------------------------------------------------------------------ */

const SITES = [
  { origin: SITE_ORIGIN, label: "game.byb.kr (진짜)" },
  { origin: "https://game-byb.kr", label: "game-byb.kr (비슷한 가짜)" },
  {
    origin: "https://game.byb.kr.example.net",
    label: "game.byb.kr.example.net (가짜)",
  },
] as const;

type PasskeyResult =
  | { kind: "blocked"; reason: string }
  | {
      kind: "signed";
      ok: boolean;
      origin: string;
      rpIdMatches: boolean;
      userPresent: boolean;
      userVerified: boolean;
      bypass: boolean;
    };

export function PasskeyToy() {
  const [passkey, setPasskey] = useState<DemoPasskey | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [site, setSite] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [noUv, setNoUv] = useState(false);
  const [result, setResult] = useState<PasskeyResult | null>(null);

  useEffect(() => {
    void createDemoPasskey().then(setPasskey);
  }, []);

  const origin = SITES[site]?.origin ?? SITE_ORIGIN;
  const host = new URL(origin).hostname;

  const sign = async (
    where: { origin: string; rpId: string },
    bypass: boolean,
  ) => {
    if (!passkey) return;
    const signer = passkeySigner(passkey.publicKey, (c) =>
      demoAssertion(passkey, c, { ...where, userVerified: !noUv }),
    );
    const t = await signTicket(
      signer,
      unsignedTicket(passkey, 7, START_NUMBERS),
      0,
    );
    if (t.sig.kind !== "webauthn") return;
    const read = readAssertion(t.sig);
    setResult({
      kind: "signed",
      ok: await verifyTicketSignature(t),
      origin: read.origin,
      rpIdMatches: read.rpIdMatches,
      userPresent: read.userPresent,
      userVerified: read.userVerified,
      bypass,
    });
  };

  const start = () => {
    setResult(null);
    // 페이지는 game.byb.kr 패스키를 달라고 한다. 브라우저는 지금 주소에서 그 패스키를 쓸 수 있는지 본다
    if (!rpIdAllowed(origin, SITE)) {
      setResult({
        kind: "blocked",
        reason: `브라우저가 거절합니다: 지금 주소(${host})에서는 ${SITE}의 패스키를 쓸 수 없습니다. 패스키 목록에 뜨지도 않습니다.`,
      });
      return;
    }
    setSheet(true);
  };

  return (
    <Toy title="패스키 흉내" id="passkey">
      <Row label="이 기기의 패스키">
        {passkey ? (
          <>
            {SITE}에 묶인 열쇠 하나 · 공개 열쇠{" "}
            <Mono>{short(passkey.publicKey, 12)}…</Mono>
          </>
        ) : (
          "만드는 중…"
        )}
      </Row>
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          onClick={() =>
            passkey &&
            void tryExportPrivateKey(passkey.privateKey).then(setExported)
          }
          disabled={!passkey}
        >
          비밀 열쇠 꺼내 보기
        </Btn>
        {exported && (
          <span data-export-result className="text-rose-200 text-xs">
            브라우저 답: {exported} — 꺼낼 수 없게 만든 열쇠라 화면 코드도 못
            봅니다
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-white/70 text-xs">지금 연 주소</span>
        <div className="flex flex-wrap gap-1.5">
          {SITES.map((s, i) => (
            <Btn
              key={s.origin}
              active={i === site}
              onClick={() => {
                setSite(i);
                setResult(null);
                setSheet(false);
              }}
            >
              {s.label}
            </Btn>
          ))}
        </div>
        <label className="flex items-center gap-2 text-white/70 text-xs">
          <input
            type="checkbox"
            checked={noUv}
            onChange={(e) => setNoUv(e.target.checked)}
          />
          지문·얼굴·PIN 없이 서명(본인 확인 표시 UV 끔)
        </label>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-white/70">
        🔒 {origin}/stardraw
      </div>
      <div>
        <Btn primary onClick={start} disabled={!passkey}>
          응모권에 패스키로 서명
        </Btn>
      </div>
      {sheet && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-slate-900/90 p-3">
          <span className="font-semibold text-sm">패스키로 서명할까요?</span>
          <span className="text-white/60 text-xs">
            {SITE} · Face ID·지문 흉내(실제 패스키는 쓰지 않습니다)
          </span>
          <div className="flex gap-2">
            <Btn
              primary
              onClick={() => {
                setSheet(false);
                void sign({ origin, rpId: SITE }, false);
              }}
            >
              확인
            </Btn>
            <Btn onClick={() => setSheet(false)}>취소</Btn>
          </div>
        </div>
      )}
      {result?.kind === "blocked" && (
        <>
          <Verdict ok={false} testId="passkey">
            {result.reason}
          </Verdict>
          <div>
            <Btn onClick={() => void sign({ origin, rpId: host }, true)}>
              브라우저가 막지 않았다면?
            </Btn>
          </div>
        </>
      )}
      {result?.kind === "signed" && (
        <div className="flex flex-col gap-1.5">
          {result.bypass && (
            <span className="text-white/60 text-xs">
              가짜 사이트가 어떻게든 이 열쇠로 서명을 받아 냈다고 쳐 봅니다.
              브라우저는 서명 안에 지금 주소를 넣습니다.
            </span>
          )}
          <Row label="서명 안의 주소(origin)">
            <Mono tone={result.origin === SITE_ORIGIN ? "good" : "bad"}>
              {result.origin}
            </Mono>
          </Row>
          <Row label="사이트 해시(rpIdHash)">
            <Mono tone={result.rpIdMatches ? "good" : "bad"}>
              {result.rpIdMatches ? `SHA-256("${SITE}")와 같음` : "다름"}
            </Mono>
          </Row>
          <Row label="사람이 누름(UP)">
            <Mono tone={result.userPresent ? "good" : "bad"}>
              {result.userPresent ? "예" : "아니오"}
            </Mono>
          </Row>
          <Row label="본인 확인(UV)">
            <Mono tone={result.userVerified ? "good" : "bad"}>
              {result.userVerified ? "예" : "아니오"}
            </Mono>
          </Row>
          <Verdict ok={result.ok} testId="passkey">
            {result.ok
              ? "검사기가 받습니다: game.byb.kr에서 본인 확인을 거친 서명입니다"
              : "검사기가 거절합니다: 이 사이트에서 본인 확인을 거친 서명이 아닙니다"}
          </Verdict>
        </div>
      )}
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 3. 작업 증명                                                        */
/* ------------------------------------------------------------------ */

const MEMORY_OPTIONS = [
  { kib: 256, label: "256KB" },
  { kib: 1024, label: "1MB" },
  { kib: 4096, label: "4MB" },
  { kib: 16384, label: "16MB(규칙)" },
];
const TRIES_OPTIONS = [1, 4, 16, 30];
/** 문제 값 흉내(앞 회차 기록 해시 자리) */
const POW_CHALLENGE = fromHex("11".repeat(32));
const NEXT_CHALLENGE = fromHex("22".repeat(32));

interface PowRun {
  tries: number;
  ms: number;
  nonce: number | null;
  head?: string;
  checkMs?: number;
  nextOk?: boolean;
}

export function PowToy() {
  const [kib, setKib] = useState(1024);
  const [tries, setTries] = useState(4);
  const [round, setRound] = useState(7);
  const [run, setRun] = useState<PowRun | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  const target = powTargetForTries(tries);
  const content = useMemo(
    () =>
      ticketContent({
        v: 1,
        round,
        numbers: START_NUMBERS,
        pub: practicePub("나"),
      }),
    [round],
  );

  const solve = async () => {
    const params = { memorySize: kib, iterations: 1 };
    stop.current = false;
    setBusy(true);
    const t0 = performance.now();
    for (let n = 0; ; n++) {
      if (stop.current) break;
      const h = await powHash(POW_CHALLENGE, content, n, params);
      const ms = performance.now() - t0;
      if (meetsTarget(h, target)) {
        const c0 = performance.now();
        await checkPow(POW_CHALLENGE, content, n, target, params);
        const checkMs = performance.now() - c0;
        const nextOk = await checkPow(
          NEXT_CHALLENGE,
          content,
          n,
          target,
          params,
        );
        setRun({
          tries: n + 1,
          ms,
          nonce: n,
          head: toHex(h.slice(0, 4)),
          checkMs,
          nextOk,
        });
        break;
      }
      setRun({ tries: n + 1, ms, nonce: null });
      // 화면이 숫자를 그릴 틈을 준다
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusy(false);
  };

  const perHash = run && run.tries > 0 ? run.ms / run.tries : null;
  /** 규칙 값(16MB, 평균 30번)으로 늘린 어림 */
  const ruleEstimate = perHash ? (perHash * (16384 / kib) * 30) / 1000 : null;

  return (
    <Toy title="Argon2id 작업 증명" id="pow">
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="text-white/70">메모리(한 번 계산에 쓰는 크기)</span>
        <div className="flex flex-wrap gap-1.5">
          {MEMORY_OPTIONS.map((m) => (
            <Btn
              key={m.kib}
              active={m.kib === kib}
              onClick={() => setKib(m.kib)}
              disabled={busy}
            >
              {m.label}
            </Btn>
          ))}
        </div>
        <span className="text-white/70">어렵기(평균 시도 수)</span>
        <div className="flex flex-wrap gap-1.5">
          {TRIES_OPTIONS.map((t) => (
            <Btn
              key={t}
              active={t === tries}
              onClick={() => setTries(t)}
              disabled={busy}
            >
              {t}번{t === 30 ? "(규칙)" : ""}
            </Btn>
          ))}
        </div>
        <span className="text-white/70">응모권 내용</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn onClick={() => setRound(round + 1)} disabled={busy}>
            회차 바꾸기({round}회)
          </Btn>
          <span className="text-white/50">번호 3·11·19·27·38·44</span>
        </div>
      </div>
      <Row label="목표값">
        <Mono>{target.toLocaleString()}</Mono>
        <span className="text-white/50">
          {" "}
          결과 앞 4바이트가 이보다 작으면 통과
        </span>
      </Row>
      <div className="flex gap-2">
        <Btn primary onClick={() => void solve()} disabled={busy}>
          {busy ? "계산하는 중…" : "응모권 한 장 만들기"}
        </Btn>
        {busy && <Btn onClick={() => (stop.current = true)}>멈추기</Btn>}
      </div>
      {run && (
        <div
          data-pow-result={run.nonce === null ? "running" : "done"}
          className="flex flex-col gap-1.5"
        >
          <Row label="시도">
            <Mono>{run.tries}번</Mono> ·{" "}
            <Mono>{(run.ms / 1000).toFixed(2)}초</Mono>
            {perHash && (
              <span className="text-white/50">
                {" "}
                (한 번 {perHash.toFixed(0)}ms)
              </span>
            )}
          </Row>
          {run.nonce !== null && (
            <>
              <Row label="찾은 n">
                <Mono tone="good">{run.nonce}</Mono> · 결과 앞 4바이트{" "}
                <Mono>{run.head}</Mono>
              </Row>
              <Verdict ok testId="pow">
                확인하는 쪽은 Argon2를 한 번만 계산하면 됩니다(
                {run.checkMs?.toFixed(0)}ms). 만드는 쪽은 {run.tries}번
                했습니다.
              </Verdict>
              <Verdict ok={!run.nextOk} testId="pow-next">
                {run.nextOk
                  ? "다음 회차 문제 값으로도 이 n이 우연히 맞았습니다(드문 일). 그래도 미리 계산할 수는 없습니다: 문제 값은 앞 회차가 끝나야 나옵니다"
                  : "다음 회차 문제 값으로는 같은 n이 맞지 않습니다. 미리 만들어 둘 수 없습니다"}
              </Verdict>
            </>
          )}
          {ruleEstimate !== null && kib !== 16384 && (
            <span className="text-white/55 text-xs">
              낮춘 값으로 계산했습니다. 규칙 값(16MB, 평균 30번)이면 이 기기에서
              어림잡아 {ruleEstimate.toFixed(1)}초입니다.
            </span>
          )}
        </div>
      )}
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 4. 머클 나무                                                        */
/* ------------------------------------------------------------------ */

const W = 360;
const ROW = 46;

function MerkleSvg({
  ids,
  labels,
  mine,
}: {
  ids: Uint8Array[];
  labels: Map<string, string>;
  mine: number;
}) {
  const tree = buildTree(ids);
  const nodes = treeNodes(tree);
  if (!tree) return <p className="text-white/50 text-xs">응모권이 없습니다</p>;
  const { path, siblings } = proofNodes(tree, mine);
  const top = 18;
  // 잎 아래 이름표까지
  const h = top + tree.height * ROW + 32;
  const x = (n: { lo: number; hi: number }) =>
    ((n.lo + n.hi) / 2 / ids.length) * W;
  const y = (n: { height: number }) => top + (tree.height - n.height) * ROW;
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      className="w-full"
      role="img"
      aria-label="머클 나무"
    >
      {nodes.flatMap((n) =>
        [n.left, n.right]
          .filter(Boolean)
          .map((c) => (
            <line
              key={`${n.lo}-${n.hi}-${c?.lo}`}
              x1={x(n)}
              y1={y(n)}
              x2={x(c as typeof n)}
              y2={y(c as typeof n)}
              stroke={
                path.includes(c as typeof n) && path.includes(n)
                  ? "#fcd34d"
                  : "#ffffff33"
              }
              strokeWidth={1.2}
            />
          )),
      )}
      {nodes.map((n) => {
        const onPath = mine >= 0 && path.includes(n);
        const sib = mine >= 0 && siblings.includes(n);
        const fill = onPath ? "#f6c343" : sib ? "#7dd3fc" : "#1e293b";
        return (
          <g key={`${n.lo}-${n.hi}`}>
            <rect
              x={x(n) - 19}
              y={y(n) - 9}
              width={38}
              height={18}
              rx={5}
              fill={fill}
              stroke="#ffffff40"
            />
            <text
              x={x(n)}
              y={y(n) + 3.5}
              textAnchor="middle"
              fontSize={9}
              fontFamily="monospace"
              fill={onPath || sib ? "#0f172a" : "#e2e8f0"}
            >
              {toHex(n.hash).slice(0, 4)}
            </text>
            {n.height === 0 && (
              <text
                x={x(n)}
                y={y(n) + 24}
                textAnchor="middle"
                fontSize={10}
                fill="#ffffffb0"
              >
                {labels.get(toHex(ids[n.lo] as Uint8Array))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function MerkleToy() {
  const [entries, setEntries] = useState<Entry[]>(() =>
    MERKLE_ENTRIES.map((e) => ({ ...e })),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const ids = useMemo(
    () =>
      sortLeaves(
        entries
          .filter((e) => !removed.has(e.name))
          .map((e) => entryTicketId(e)),
      ),
    [entries, removed],
  );
  const labels = useMemo(
    () => new Map(entries.map((e) => [toHex(entryTicketId(e)), e.name])),
    [entries],
  );
  const [sealed, setSealed] = useState(() =>
    merkleRoot(sortLeaves(MERKLE_ENTRIES.map((e) => entryTicketId(e)))),
  );
  /** 마감 때 받아 둔 내 응모권 id */
  const myId = useMemo(() => entryTicketId(MERKLE_ENTRIES[0] as Entry), []);
  const mine = indexOfId(ids, myId);
  const root = merkleRoot(ids);
  const same = toHex(root) === toHex(sealed);
  const proofOk =
    mine >= 0 &&
    verifyInclusion(myId, mine, ids.length, inclusionProof(ids, mine), sealed);
  const changedCount = entries.filter(
    (e, i) => e.numbers.join() !== MERKLE_ENTRIES[i]?.numbers.join(),
  ).length;

  return (
    <Toy title="머클 나무와 내 응모권 증명" id="merkle">
      <MerkleSvg ids={ids} labels={labels} mine={mine} />
      <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-[#f6c343]" />
          내 응모권에서 뿌리까지
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-[#7dd3fc]" />
          증명에 들어가는 값(
          {mine >= 0 ? proofNodes(buildTree(ids), mine).siblings.length : 0}개)
        </span>
      </div>
      <Row label="마감 때 봉인한 뿌리">
        <Mono>{short(sealed, 16)}</Mono>
      </Row>
      <Row label="지금 목록의 뿌리">
        <Mono tone={same ? "good" : "bad"}>{short(root, 16)}</Mono>
      </Row>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {entries.map((e, i) => {
          const out = removed.has(e.name);
          return (
            <div
              key={e.name}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-1.5 text-xs",
                out ? "border-white/5 opacity-50" : "border-white/15",
              )}
            >
              <span className="font-semibold">
                {e.name}
                {e.numbers.join() !== MERKLE_ENTRIES[i]?.numbers.join() && (
                  <span className="ml-1 text-rose-300">바뀜</span>
                )}
              </span>
              <div className="flex gap-1">
                <Btn
                  onClick={() => {
                    const next = new Set(removed);
                    if (out) next.delete(e.name);
                    else next.add(e.name);
                    setRemoved(next);
                  }}
                >
                  {out ? "넣기" : "빼기"}
                </Btn>
                {i > 0 && (
                  <Btn
                    onClick={() =>
                      setEntries(
                        entries.map((x, k) =>
                          k === i
                            ? { ...x, numbers: bumpNumber(x.numbers, 0) }
                            : x,
                        ),
                      )
                    }
                  >
                    번호
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() => {
            setEntries(MERKLE_ENTRIES.map((e) => ({ ...e })));
            setRemoved(new Set());
            setSealed(
              merkleRoot(
                sortLeaves(MERKLE_ENTRIES.map((e) => entryTicketId(e))),
              ),
            );
          }}
        >
          처음대로
        </Btn>
      </div>
      <Verdict ok={same} testId="merkle-root">
        {same
          ? "지금 응모권 목록이 마감 때 봉인한 뿌리와 같습니다"
          : `봉인한 뿌리와 다릅니다(뺀 응모권 ${removed.size}장, 바꾼 응모권 ${changedCount}장). 마감 뒤에 목록이 바뀐 것이 드러납니다`}
      </Verdict>
      <Verdict ok={proofOk} testId="merkle-proof">
        {mine < 0
          ? "내 응모권이 목록에 없어 증명을 만들 수 없습니다. 서버가 서명해 준 응모 영수증으로 누구에게나 보일 수 있습니다"
          : proofOk
            ? `내 응모권 증명 확인: 값 ${inclusionProof(ids, mine).length}개만으로 봉인한 뿌리까지 다시 계산됩니다`
            : "내 응모권 증명이 봉인한 뿌리에 닿지 않습니다. 목록이 바뀌었습니다"}
      </Verdict>
    </Toy>
  );
}
