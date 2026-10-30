"use client";

import {
  CHECK_LINK_REQUESTER,
  checkScheduleChange,
  displayRound,
  drandRandomness,
  drandRoundForClose,
  drandTime,
  drawNumbers,
  drawSeed,
  fromHex,
  generateSasKey,
  generateSigner,
  isVoidRound,
  makeChallengeClaim,
  type RoundRecord,
  recordHash,
  roundTimes,
  type SasKey,
  type Schedule,
  type SoftPasskey,
  sasChallenge,
  sasSecret,
  sasStars,
  sha256,
  signTicket,
  softPasskeySigner,
  type Ticket,
  type TimestampCheck,
  TSA_AUTHORITIES,
  toHex,
  unsignedTicket,
  utf8,
  verifyClaim,
  verifyQuicknetBeacon,
  verifyTimestampToken,
} from "@mighty/stardraw-core";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";

import { LottoBall } from "../components/parts";
import { SkyBoard } from "../components/SkyBoard";
import { starOf } from "../sky";
import {
  type AnchorRepo,
  anchorRepoFor,
  buildChain,
  CHAIN_EPOCH,
  type ChainCheck,
  chainSchedule,
  checkChain,
  fromBase64,
  kst,
  relink,
  shiftTokenTime,
  short,
  tamperRecord,
  traceDraw,
  writeRoundAnchors,
} from "./lab";
import { Btn, Mono, Row, Toy, Verdict } from "./ui";

/* ------------------------------------------------------------------ */
/* 5. 시각 인증(TSA)                                                   */
/* ------------------------------------------------------------------ */

type Tokens = Record<"digicert" | "sectigo" | "freetsa", string>;
const TSA_LABEL = {
  digicert: "DigiCert",
  sectigo: "Sectigo",
  freetsa: "FreeTSA",
} as const;
const FIXTURE_TEXT = "stardraw rekor fixture";

export function TsaToy() {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [name, setName] = useState<keyof Tokens>("digicert");
  const [text, setText] = useState(FIXTURE_TEXT);
  const [shift, setShift] = useState(false);
  const [untrust, setUntrust] = useState(false);
  const [check, setCheck] = useState<TimestampCheck | null>(null);
  const [closeAt, setCloseAt] = useState<"before" | "long" | "after">("before");

  useEffect(() => {
    void import("@mighty/stardraw-core/tsa-fixtures").then((m) =>
      setTokens(m.FIXTURE_TOKENS),
    );
  }, []);

  /** 고치기 전 토큰의 시각(시각 글자 찾기와 마감 시각 비교의 기준) */
  const [baseTime, setBaseTime] = useState(0);
  useEffect(() => {
    if (!tokens) return;
    void verifyTimestampToken(fromBase64(tokens[name]), {
      imprint: sha256(utf8(FIXTURE_TEXT)),
    }).then((c) => setBaseTime(c.genTime));
  }, [tokens, name]);

  useEffect(() => {
    if (!tokens || !baseTime) return;
    let live = true;
    setCheck(null);
    const original = fromBase64(tokens[name]);
    const token = shift
      ? (shiftTokenTime(original, baseTime) ?? original)
      : original;
    void verifyTimestampToken(token, {
      imprint: sha256(utf8(text)),
      authorities: untrust
        ? TSA_AUTHORITIES.filter((a) => a.name !== name)
        : TSA_AUTHORITIES,
    }).then((c) => live && setCheck(c));
    return () => {
      live = false;
    };
  }, [tokens, name, text, shift, untrust, baseTime]);

  const closesAt =
    closeAt === "before"
      ? baseTime - 60
      : closeAt === "long"
        ? baseTime - 600
        : baseTime + 60;
  const drandAt = drandTime(drandRoundForClose(closesAt));
  const isVoid = isVoidRound(closesAt, baseTime);

  return (
    <Toy title="받아 둔 시각 인증 토큰 확인" id="tsa">
      <p className="text-white/60 text-xs">
        2026-10-30에 실제 기관 세 곳에서 받아 둔 토큰입니다. 실제 회차에서는
        봉인 값의 SHA-256을 보내지만, 이 토큰은 글귀 「{FIXTURE_TEXT}」의
        SHA-256을 담았습니다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TSA_LABEL) as (keyof Tokens)[]).map((k) => (
          <Btn key={k} active={k === name} onClick={() => setName(k)}>
            {TSA_LABEL[k]}
          </Btn>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-white/70">
          봉인 값(이 글귀의 SHA-256을 토큰과 맞춰 봅니다)
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 font-mono text-sm"
          aria-label="봉인 값"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Btn active={shift} onClick={() => setShift(!shift)}>
          토큰 안 시각 고치기
        </Btn>
        <Btn active={untrust} onClick={() => setUntrust(!untrust)}>
          이 기관 열쇠를 믿는 목록에서 빼기
        </Btn>
      </div>
      {check && (
        <>
          <Row label="기관이 찍은 시각">
            <Mono>
              {check.genTime ? `${kst(check.genTime)} (한국 시각)` : "-"}
            </Mono>
          </Row>
          <Row label="사슬이 닿은 기관 열쇠">
            <Mono tone={check.tsa ? "good" : "bad"}>{check.tsa ?? "없음"}</Mono>
          </Row>
        </>
      )}
      <Verdict ok={check ? check.ok : null} testId="tsa">
        {check === null
          ? "확인하는 중"
          : check.ok
            ? "토큰이 맞습니다: 이 값이 이 시각에 있었다고 기관이 서명했습니다"
            : check.problems.join(" · ")}
      </Verdict>
      {baseTime > 0 && (
        <div className="flex flex-col gap-1.5 border-white/10 border-t pt-3">
          <span className="text-white/70 text-xs">
            봉인 시각은 마감 뒤, drand 추첨 전이어야 그 회차가 유효합니다
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Btn
              active={closeAt === "before"}
              onClick={() => setCloseAt("before")}
            >
              마감이 토큰 1분 전
            </Btn>
            <Btn active={closeAt === "long"} onClick={() => setCloseAt("long")}>
              마감이 토큰 10분 전
            </Btn>
            <Btn
              active={closeAt === "after"}
              onClick={() => setCloseAt("after")}
            >
              마감이 토큰 1분 뒤
            </Btn>
          </div>
          <Row label="마감">
            <Mono>{kst(closesAt).slice(11)}</Mono>
          </Row>
          <Row label="봉인(토큰)">
            <Mono>{kst(baseTime).slice(11)}</Mono>
          </Row>
          <Row label="추첨(drand)">
            <Mono>{kst(drandAt).slice(11)}</Mono>
          </Row>
          <Verdict ok={!isVoid} testId="tsa-order">
            {!isVoid
              ? "유효: 봉인이 추첨보다 먼저입니다. 결과를 알기 전에 응모권 목록이 고정됐습니다"
              : baseTime < closesAt
                ? "무효: 마감 전 봉인은 말이 되지 않습니다"
                : "무효: 봉인이 추첨 뒤입니다. 결과를 보고 목록을 바꿨을 수 있어 당첨 없이 닫습니다"}
          </Verdict>
        </div>
      )}
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 6. drand                                                            */
/* ------------------------------------------------------------------ */

const BEACON_SIG = fromHex(
  "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
);
const DRAND_SCHEDULE = chainSchedule(CHAIN_EPOCH);

export function DrandToy() {
  const [closeRound, setCloseRound] = useState(1);
  const [flip, setFlip] = useState(false);
  const [round, setRound] = useState(1);
  const [beaconOk, setBeaconOk] = useState<boolean | null>(null);

  const signature = useMemo(() => {
    const s = BEACON_SIG.slice();
    if (flip) s[20] = (s[20] ?? 0) ^ 0x01;
    return s;
  }, [flip]);
  const beacon = { round: 1000000, signature };

  useEffect(() => {
    setBeaconOk(null);
    // BLS 확인은 수십 ms 걸린다. 화면을 먼저 그리고 계산한다
    const id = setTimeout(
      () => setBeaconOk(verifyQuicknetBeacon({ round: 1000000, signature })),
      0,
    );
    return () => clearTimeout(id);
  }, [signature]);

  const times = roundTimes(DRAND_SCHEDULE, closeRound);
  const drandRound = drandRoundForClose(times.closesAt);
  const randomness = drandRandomness(beacon);
  const seed = drawSeed(round, randomness);
  const steps = traceDraw(seed);
  const order = steps
    .filter((s) => s.result === "pick")
    .map((s) => s.n as number);
  const same = order.join() === drawNumbers(seed).order.join();
  const numbers = order.slice(0, 6);
  const bonus = order[6] ?? null;

  return (
    <Toy title="drand 공개 난수로 번호 뽑기" id="drand">
      <div className="flex flex-col gap-1.5">
        <span className="text-white/70 text-xs">
          ① 어느 drand 회차를 쓸지는 마감 시각이 정합니다
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn onClick={() => setCloseRound(Math.max(1, closeRound - 1))}>
            앞 회차
          </Btn>
          <Btn onClick={() => setCloseRound(closeRound + 1)}>뒤 회차</Btn>
        </div>
        <Row label={`${closeRound}회 마감`}>
          <Mono>{kst(times.closesAt)}</Mono>
        </Row>
        <Row label="마감 + 5분 뒤 첫 drand">
          <Mono>{drandRound.toLocaleString()}회</Mono> ·{" "}
          <Mono>{kst(drandTime(drandRound))}</Mono>
        </Row>
      </div>
      <div className="flex flex-col gap-1.5 border-white/10 border-t pt-3">
        <span className="text-white/70 text-xs">
          ② drand 값은 League of Entropy 여러 기관이 함께 서명해 3초마다 냅니다.
          그 시각 전에는 아무도 모릅니다. 실제 값(1,000,000회)으로 확인해 봅니다
        </span>
        <Row label="BLS 서명(48바이트)">
          <Mono tone={flip ? "warn" : "plain"}>
            {toHex(signature).slice(0, 40)}…
          </Mono>
        </Row>
        <div>
          <Btn active={flip} onClick={() => setFlip(!flip)}>
            서명 한 바이트 바꾸기
          </Btn>
        </div>
        <Verdict ok={beaconOk} testId="drand-sig">
          {beaconOk === null
            ? "BLS 서명 확인 중"
            : beaconOk
              ? "quicknet 공개 열쇠로 서명이 맞습니다. 진짜 drand 값입니다"
              : "서명이 맞지 않습니다. 이 값으로는 추첨하지 않습니다"}
        </Verdict>
        <Row label="난수 = SHA-256(서명)">
          <Mono>{short(randomness, 24)}…</Mono>
        </Row>
      </div>
      <div className="flex flex-col gap-2 border-white/10 border-t pt-3">
        <span className="text-white/70 text-xs">
          ③ seed = taggedHash("stardraw/seed/v1", 회차 ‖ 난수). 회차를 바꿔
          보세요. 응모권 목록은 들어가지 않아 운영자가 응모권을 넣고 빼도 번호는
          그대로입니다
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn onClick={() => setRound(Math.max(1, round - 1))}>−</Btn>
          <Mono>{round}회</Mono>
          <Btn onClick={() => setRound(round + 1)}>+</Btn>
        </div>
        <div className="flex flex-wrap gap-1" data-draw-steps>
          {steps.map((s, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 읽은 차례 그대로
              key={i}
              title={
                s.result === "reject"
                  ? `${s.byte}: 225 이상이라 버림`
                  : s.result === "dup"
                    ? `${s.byte} → ${s.n}: 이미 나옴`
                    : `${s.byte} mod 45 + 1 = ${s.n}`
              }
              className={cn(
                "rounded px-1 py-0.5 font-mono text-[10px]",
                s.result === "pick" && "bg-amber-200 text-slate-900",
                s.result === "dup" && "bg-white/10 text-white/50",
                s.result === "reject" &&
                  "bg-white/5 text-white/30 line-through",
              )}
            >
              {s.byte}
              {s.result !== "reject" && `→${s.n}`}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-white/50">
          바이트를 차례로 읽어 225 이상은 버리고(치우침 없애기), 나머지는 45로
          나눈 나머지 + 1. 이미 나온 번호는 건너뜁니다
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {numbers.map((n) => (
            <LottoBall key={n} n={n} size="sm" />
          ))}
          <span className="text-white/50 text-xs">+ 보너스</span>
          {bonus && <LottoBall n={bonus} size="sm" />}
        </div>
        <SkyBoard
          label={`${round}회 당첨 별`}
          className="mx-auto w-full max-w-sm"
          state={{ mode: "draw", picked: [], focus: null, lit: numbers, bonus }}
        />
        <span className="text-[11px] text-white/50">
          {numbers.map((n) => starOf(n).ko).join(" · ")}
        </span>
        <Verdict ok={same} testId="drand-draw">
          규칙 코드(drawNumbers)로 다시 계산한 차례와{" "}
          {same ? "같습니다" : "다릅니다"}: {order.join(", ")}
        </Verdict>
      </div>
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 7. 사슬과 앵커                                                      */
/* ------------------------------------------------------------------ */

interface ChainState {
  genesis: Schedule;
  records: RoundRecord[];
  repo: AnchorRepo;
}

function freshChain(): ChainState {
  const genesis = chainSchedule(CHAIN_EPOCH);
  const records = buildChain(genesis, 5);
  return { genesis, records, repo: anchorRepoFor(genesis, records) };
}

const FIRST_HEAD = recordHash(freshChain().records[4] as RoundRecord);

export function ChainToy() {
  const [chain, setChain] = useState<ChainState>(freshChain);
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [liveFrom, setLiveFrom] = useState(12);

  useEffect(() => {
    let live = true;
    void checkChain(chain.genesis, chain.records, chain.repo).then(
      (c) => live && setCheck(c),
    );
    return () => {
      live = false;
    };
  }, [chain]);

  const allLinked = check?.rounds.every((r) => r.linked) ?? null;
  const allAnchored = check
    ? check.rounds.every((r) => r.anchored === true)
    : null;
  const headSeen = check
    ? chain.records.some((r) => toHex(recordHash(r)) === toHex(FIRST_HEAD))
    : null;

  const decided = chain.records.length;
  const entry = chain.genesis.entries[0];
  const change = entry
    ? { ...entry, fromRound: liveFrom, phase: "live" as const }
    : null;
  const problem = change
    ? checkScheduleChange(chain.genesis, change, decided)
    : "일정표 없음";
  // 결정한 회차와 효력 회차 사이에 장부에 보이는 회차 수(decided+1은 이미 응모받는 중)
  const notice = Math.max(0, liveFrom - decided - 1);
  const changed =
    change && !problem
      ? { ...chain.genesis, entries: [...chain.genesis.entries, change] }
      : null;

  return (
    <Toy title="해시 사슬과 GitHub 앵커" id="chain">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {chain.records.map((r, i) => {
          const c = check?.rounds[i];
          return (
            <div
              key={r.round}
              data-chain-round={r.round}
              data-linked={c ? String(c.linked) : undefined}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-lg border p-2 text-[11px]",
                c && !c.linked ? "border-rose-400/70" : "border-white/15",
              )}
            >
              <span className="font-semibold text-xs">
                {displayRound(chain.genesis, r.round).label}
              </span>
              <span className="text-white/55">
                앞{" "}
                <Mono tone={c && !c.linked ? "bad" : "plain"}>
                  {short(r.prev, 6)}
                </Mono>
              </span>
              <span className="text-white/55">
                해시 <Mono>{short(recordHash(r), 6)}</Mono>
              </span>
              <span className="text-white/55">번호 {r.numbers.join("·")}</span>
              <span
                className={cn(
                  c?.anchored === false ? "text-rose-300" : "text-white/55",
                )}
              >
                앵커{" "}
                {c?.anchored === true
                  ? "✓"
                  : c?.anchored === false
                    ? "✗ 다름"
                    : "없음"}
              </span>
              <Btn
                onClick={() =>
                  setChain({
                    ...chain,
                    records: chain.records.map((x, k) =>
                      k === i ? tamperRecord(x) : x,
                    ),
                  })
                }
              >
                번호 고치기
              </Btn>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() =>
            setChain({
              ...chain,
              records: relink(chain.genesis, chain.records),
            })
          }
        >
          뒤 기록 다시 잇기
        </Btn>
        <Btn
          onClick={() => {
            const repo = new Map(chain.repo);
            writeRoundAnchors(chain.genesis, chain.records, repo);
            setChain({ ...chain, repo });
          }}
        >
          앵커도 고쳐 쓰기(강제 push)
        </Btn>
        <Btn
          onClick={() => {
            const genesis = chainSchedule(chain.genesis.epoch + 86400);
            setChain({
              genesis,
              records: buildChain(genesis, 5),
              repo: chain.repo,
            });
          }}
        >
          장부 처음부터 다시 만들기
        </Btn>
        <Btn onClick={() => setChain(freshChain())}>처음대로</Btn>
      </div>
      <Verdict ok={allLinked} testId="chain-linked">
        {allLinked
          ? "사슬이 이어집니다: 모든 기록의 「앞」이 바로 앞 기록의 해시입니다"
          : "사슬이 끊겼습니다: 고친 기록 다음 회차의 「앞」과 맞지 않습니다"}
      </Verdict>
      <Verdict ok={allAnchored} testId="chain-anchor">
        {allAnchored
          ? "회차마다 GitHub 앵커 저장소에 남긴 기록 해시와 같습니다"
          : "GitHub 앵커와 다르거나 없는 회차가 있습니다. 모두가 같은 앵커와 비교하므로 드러납니다"}
      </Verdict>
      <Verdict
        ok={check ? check.genesisAnchored === true : null}
        testId="chain-genesis"
      >
        {check?.genesisAnchored
          ? "처음 일정표가 genesis.txt와 같습니다: 장부를 다시 시작하지 않았습니다"
          : "처음 일정표가 genesis.txt와 다릅니다: 장부를 다시 시작했습니다"}
      </Verdict>
      <Verdict ok={headSeen} testId="chain-head">
        {headSeen
          ? "기기가 전에 본 끝 해시가 이 장부 안에 있습니다"
          : "기기가 전에 본 끝 해시가 이 장부에 없습니다: 앵커까지 고쳐 써도 기기가 알아챕니다"}
      </Verdict>
      <div className="flex flex-col gap-1.5 border-white/10 border-t pt-3">
        <span className="text-white/70 text-xs">
          일정 바꾸기(예: 정식 시작)는 회차 기록에 한 줄을 넣고, 그 뒤 3회차
          동안 장부에 보인 다음 회차부터만 됩니다. 지금 {decided}회 기록에
          넣는다면:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn onClick={() => setLiveFrom(Math.max(decided + 1, liveFrom - 1))}>
            −
          </Btn>
          <Mono>{liveFrom}회부터 정식</Mono>
          <Btn onClick={() => setLiveFrom(liveFrom + 1)}>+</Btn>
          <span className="text-white/50 text-xs">예고 {notice}회차</span>
        </div>
        <Verdict ok={!problem} testId="chain-schedule">
          {problem
            ? `받지 않습니다: ${problem}`
            : `받습니다. ${liveFrom - 1}회는 ${changed ? displayRound(changed, liveFrom - 1).label : ""}, ${liveFrom}회는 ${changed ? displayRound(changed, liveFrom).label : ""}로 보입니다`}
        </Verdict>
      </div>
    </Toy>
  );
}

/* ------------------------------------------------------------------ */
/* 8. 당첨자 확인 별 세 개                                             */
/* ------------------------------------------------------------------ */

interface SasWorld {
  signer: SoftPasskey;
  ticket: Ticket;
  checker: SasKey;
  winner: SasKey;
  /** 중간자가 양쪽에 따로 쓰는 열쇠 */
  mitmToWinner: SasKey;
  mitmToChecker: SasKey;
}

interface SasOutcome {
  winnerStars: number[];
  checkerStars: number[];
  claimProblems: string[];
}

const REQUEST_ID = "req-12-1";
const CHALLENGE = "K7Q2MX9PRA";
const REQUESTER = CHECK_LINK_REQUESTER;

async function makeSasWorld(): Promise<SasWorld> {
  const signer = softPasskeySigner(await generateSigner());
  const ticket = await signTicket(
    signer,
    unsignedTicket(signer, 12, [5, 29, 37, 38, 41, 45]),
    0,
  );
  const [checker, winner, mitmToWinner, mitmToChecker] = await Promise.all([
    generateSasKey(),
    generateSasKey(),
    generateSasKey(),
    generateSasKey(),
  ]);
  return { signer, ticket, checker, winner, mitmToWinner, mitmToChecker };
}

async function runSas(w: SasWorld, mitm: boolean): Promise<SasOutcome> {
  // 서버(또는 가운데 끼어든 사람)를 거쳐 상대에게 닿는 임시 공개 열쇠
  const keyAtWinner = mitm ? w.mitmToWinner.publicKey : w.checker.publicKey;
  const keyAtChecker = mitm ? w.mitmToChecker.publicKey : w.winner.publicKey;
  // 당첨자: 받은 열쇠와 내 열쇠를 묶은 문구에 응모권 열쇠로 서명하고, 별 세 개를 계산한다
  const claim = await makeChallengeClaim(
    w.signer,
    w.ticket,
    sasChallenge(CHALLENGE, keyAtWinner, w.winner.publicKey),
    REQUESTER,
  );
  const winnerStars = sasStars(
    await sasSecret(w.winner.privateKey, keyAtWinner),
    REQUEST_ID,
  );
  // 확인하는 분: 내 열쇠와 받은 열쇠로 기대하는 문구를 만들어 서명을 검사하고, 별 세 개를 계산한다
  const claimProblems = await verifyClaim(claim, {
    ticket: w.ticket,
    request: {
      challenge: sasChallenge(CHALLENGE, w.checker.publicKey, keyAtChecker),
      requester: REQUESTER,
    },
  });
  const checkerStars = sasStars(
    await sasSecret(w.checker.privateKey, keyAtChecker),
    REQUEST_ID,
  );
  return { winnerStars, checkerStars, claimProblems };
}

export function SasToy() {
  const [world, setWorld] = useState<SasWorld | null>(null);
  const [mitm, setMitm] = useState(false);
  const [out, setOut] = useState<SasOutcome | null>(null);

  useEffect(() => {
    void makeSasWorld().then(setWorld);
  }, []);
  useEffect(() => {
    if (!world) return;
    let live = true;
    setOut(null);
    void runSas(world, mitm).then((o) => live && setOut(o));
    return () => {
      live = false;
    };
  }, [world, mitm]);

  const sameStars = out
    ? out.winnerStars.join() === out.checkerStars.join()
    : null;

  return (
    <Toy title="두 기기가 같은 별 세 개를 얻는다" id="sas">
      <div className="flex flex-wrap gap-1.5">
        <Btn active={!mitm} onClick={() => setMitm(false)}>
          그대로 전달
        </Btn>
        <Btn active={mitm} onClick={() => setMitm(true)}>
          가운데서 열쇠 바꿔치기
        </Btn>
        <Btn onClick={() => void makeSasWorld().then(setWorld)}>
          새 임시 열쇠
        </Btn>
      </div>
      {world && (
        <div className="flex flex-col gap-1">
          <Row label="서버가 보는 것">
            확인하는 분 열쇠{" "}
            <Mono>{short(world.checker.publicKey.slice(1), 8)}</Mono>, 당첨자
            열쇠 <Mono>{short(world.winner.publicKey.slice(1), 8)}</Mono>, 요청
            id <Mono>{REQUEST_ID}</Mono>. 공유 비밀은 두 기기의 비밀 열쇠가
            있어야 계산됩니다
          </Row>
          {mitm && (
            <Row label="바꿔치기">
              당첨자에게는{" "}
              <Mono tone="warn">
                {short(world.mitmToWinner.publicKey.slice(1), 8)}
              </Mono>
              , 확인하는 분에게는{" "}
              <Mono tone="warn">
                {short(world.mitmToChecker.publicKey.slice(1), 8)}
              </Mono>
              를 대신 건넵니다
            </Row>
          )}
        </div>
      )}
      {out && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["당첨자 화면", out.winnerStars],
              ["확인하는 분이 계산한 별", out.checkerStars],
            ] as const
          ).map(([label, stars]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <span className="text-white/70 text-xs">{label}</span>
              <SkyBoard
                label={label}
                className="w-full"
                state={{
                  mode: "receipt",
                  picked: [],
                  focus: null,
                  lit: [],
                  bonus: null,
                  marks: stars,
                }}
              />
              <span
                className="text-[11px] text-white/70"
                data-sas-stars={label}
              >
                {stars.map((n, i) => `${"①②③"[i]} ${starOf(n).ko}`).join(" ")}
              </span>
            </div>
          ))}
        </div>
      )}
      <Verdict
        ok={out ? out.claimProblems.length === 0 : null}
        testId="sas-claim"
      >
        {out === null
          ? "계산하는 중"
          : out.claimProblems.length === 0
            ? "서명 검사 통과: 응모권 열쇠로, 양쪽 임시 열쇠를 묶은 문구에 서명했습니다"
            : `서명 검사 실패: ${out.claimProblems.join(", ")}(당첨자가 서명한 문구 속 열쇠가 확인하는 분의 열쇠가 아닙니다)`}
      </Verdict>
      <Verdict ok={sameStars} testId="sas-stars">
        {sameStars === null
          ? "계산하는 중"
          : sameStars
            ? "두 화면의 별 세 개가 같습니다. 당첨자가 메신저로 보낸 별을 누르면 초록불이 켜집니다"
            : "별이 다릅니다. 가운데 끼어든 사람은 양쪽에 같은 별을 맞춰 줄 수 없습니다"}
      </Verdict>
    </Toy>
  );
}
