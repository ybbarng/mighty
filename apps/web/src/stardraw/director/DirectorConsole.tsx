"use client";

import {
  BADGES,
  type Badge,
  fromBase64Url,
  fromHex,
  isAlignedEpoch,
  liveStart,
  OP_VERSION,
  type OpBody,
  type Operation,
  type OperationView,
  roundTimes,
} from "@mighty/stardraw-core";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { scheduleLine } from "../components/parts";
import { roundShort } from "../round-label";
import {
  type DirectorBackend,
  type DirectorKey,
  type DirectorKeyring,
  type DirectorState,
  keyLabel,
  NotDirectorError,
} from "./director";

/**
 * 우주국장 관리 화면(docs/36 11-12). 실제(/stardraw/admin)와 데모 국장 모드가 같이 쓴다.
 * 국장도 장부에 남는 기록으로만 일한다: 서명한 요청은 다음 기록에 실리고 24시간 뒤에 효력이 생긴다.
 */

const STATUS_LABEL = {
  pending: "예고 중",
  applied: "적용",
  cancelled: "취소됨",
};

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const at = (seconds: number) => KST.format(new Date(seconds * 1000));

export interface DirectorConsoleProps {
  backend: DirectorBackend;
  keyring: DirectorKeyring;
  /** 데모: 만든 국장 열쇠를 "서버 설정"에 넣는다 */
  onInstall?: (config: string) => Promise<void>;
  /** 데모: 국장 아닌 패스키로 서명해 본다 */
  signAsStranger?: (body: OpBody) => Promise<Operation>;
  /** 데모: 하루(25회차) 건너뛰기 */
  onSkipDay?: () => Promise<void>;
  /** 장부가 바뀌면 오른다(데모의 다른 단추가 시간을 옮겼을 때 다시 읽게) */
  version?: number;
}

export function DirectorConsole({
  backend,
  keyring,
  onInstall,
  signAsStranger,
  onSkipDay,
  version = 0,
}: DirectorConsoleProps) {
  const [state, setState] = useState<DirectorState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mine, setMine] = useState<DirectorKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setState(await backend.state());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [backend]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 데모가 시간을 옮기면(version) 다시 읽는다
  useEffect(() => {
    setMine(keyring.saved());
    void load();
  }, [load, keyring, version]);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
    } catch (err) {
      const text =
        err instanceof NotDirectorError
          ? err.message
          : err instanceof DOMException && err.name === "NotAllowedError"
            ? "서명하지 않았습니다"
            : err instanceof Error
              ? err.message
              : String(err);
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
      await load();
    }
  };

  /** 지금 장부 끝 해시 자리에서 본문을 만들어 국장 패스키로 서명하고 보낸다 */
  const sendBody = async (
    make: (s: DirectorState) => Omit<OpBody, "v" | "after">,
    stranger = false,
  ): Promise<string> => {
    // 서명 직전에 장부 끝 해시를 새로 받는다(그사이 기록이 닫혔으면 다시 서명해야 한다)
    const fresh = await backend.state();
    const body = {
      v: OP_VERSION,
      after: fromHex(fresh.view.next.after),
      ...make(fresh),
    } as OpBody;
    const op =
      stranger && signAsStranger
        ? await signAsStranger(body)
        : await keyring.sign(body, fresh.view.directors);
    const r = await backend.submit(op);
    return `받았습니다. ${roundShort(fresh.schedule, r.round)} 기록에 실리고${
      r.effectiveRound > 0
        ? ` ${roundShort(fresh.schedule, r.effectiveRound)}(${at(roundTimes(fresh.schedule, r.effectiveRound).opensAt)})부터 효력이 생깁니다`
        : " 바로 효력이 생깁니다"
    }.`;
  };

  if (!state)
    return (
      <p className="py-10 text-center text-white/60" data-director-loading>
        {loadError ?? "장부를 읽고 있습니다"}
      </p>
    );

  const { view, schedule } = state;
  const earliest = view.next.earliestEffectiveRound;
  const directorOps = view.operations.filter(
    (o) => o.kind === "director-add" || o.kind === "director-remove",
  );
  const pendingDirectors = directorOps.filter(
    (o) => o.kind === "director-add" && o.status === "pending",
  );

  return (
    <div className="flex flex-col gap-6" data-director-console>
      <section className="sd-glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <p className="break-keep text-white/80">
          국장도 장부에 남는 기록으로만 일합니다. 국장 패스키로 서명한 요청은
          다음 기록({roundShort(schedule, view.next.round)})에 실리고, 가장
          빨라도{" "}
          {`${roundShort(schedule, earliest)}(${at(view.next.earliestEffectiveAt)})부터`}{" "}
          효력이 생깁니다. 그사이 누구나 볼 수 있고, 국장은 취소할 수 있습니다.
        </p>
        {onSkipDay && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await onSkipDay();
                return "하루(25회차)를 건너뛰었습니다";
              })
            }
            className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 hover:bg-amber-200/15 disabled:opacity-40"
          >
            하루 건너뛰기
          </button>
        )}
      </section>

      <p
        role="status"
        aria-live="polite"
        data-director-message={message ? (message.ok ? "ok" : "fail") : ""}
        className={cn(
          "min-h-6 break-keep text-sm",
          message?.ok ? "text-emerald-200" : "text-rose-200",
        )}
      >
        {message?.text}
      </p>

      <Section title="국장 패스키">
        <p className="break-keep text-sm text-white/70">
          이 화면에서 만든 패스키는 우주국이 지정해야 국장 열쇠가 됩니다. 처음
          지정은 서버 설정(<code>STARDRAW_DIRECTOR_KEYS</code>)에 아래 값을
          넣어야 하고, 그 뒤는 쓰는 중인 국장의 서명으로 더합니다. 응모용 우주인
          패스키와 따로 만듭니다(국장 패스키로는 응모할 수 없습니다).
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const key = await keyring.create();
              setMine(keyring.saved());
              return `국장 패스키를 만들었습니다. 지문 ${keyLabel(key).fingerprint}`;
            })
          }
          className="sd-cta self-start rounded-lg px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
        >
          국장 패스키 만들기
        </button>
        {mine.map((key) => (
          <MyKey
            key={keyLabel(key).config}
            k={key}
            busy={busy}
            state={state}
            onInstall={
              onInstall
                ? () =>
                    void act(async () => {
                      await onInstall(keyLabel(key).config);
                      return "서버 설정에 넣었습니다. 다음 기록에 관인이 지정을 싣습니다";
                    })
                : undefined
            }
            onDesignate={() =>
              void act(() =>
                sendBody((s) => ({
                  kind: "director-add",
                  effectiveRound: s.view.next.earliestEffectiveRound,
                  credentialId: key.credentialId,
                  pub: key.pub,
                })),
              )
            }
          />
        ))}
        <h3 className="pt-2 font-semibold text-white/80">장부의 국장 열쇠</h3>
        {view.directors.length === 0 && pendingDirectors.length === 0 ? (
          <p className="text-sm text-white/55">
            아직 지정된 국장 열쇠가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" data-director-keys>
            {view.directors.map((d) => (
              <li
                key={d.pub}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3 py-2"
              >
                <code className="font-semibold tabular-nums">
                  {d.fingerprint}
                </code>
                <span className="text-white/60">
                  {d.until === null
                    ? `쓰는 중 · ${roundShort(schedule, d.from)}부터`
                    : `빠짐 · ${roundShort(schedule, d.until)}부터`}
                </span>
                {d.until === null && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        sendBody((s) => ({
                          kind: "director-remove",
                          effectiveRound: s.view.next.earliestEffectiveRound,
                          pub: fromBase64Url(d.pub),
                        })),
                      )
                    }
                    className="ml-auto rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                  >
                    빼기
                  </button>
                )}
              </li>
            ))}
            {pendingDirectors.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/25 px-3 py-2"
              >
                <code className="font-semibold">
                  {o.summary.replace("국장 열쇠 지정 ", "")}
                </code>
                <span className="text-amber-100/80">
                  {`지정 예고 중 · ${roundShort(schedule, o.effectiveRound)}(${at(o.effectiveAt)})부터 · 서명 ${o.signedBy}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AffiliationForm
        busy={busy}
        onSend={(fields) =>
          void act(() =>
            sendBody((s) => ({
              kind: "affiliation-add",
              effectiveRound: s.view.next.earliestEffectiveRound,
              fields,
            })),
          )
        }
        onStranger={
          signAsStranger
            ? (fields) =>
                void act(() =>
                  sendBody(
                    (s) => ({
                      kind: "affiliation-add",
                      effectiveRound: s.view.next.earliestEffectiveRound,
                      fields,
                    }),
                    true,
                  ),
                )
            : undefined
        }
      />

      <LiveStart
        state={state}
        busy={busy}
        onSend={(fromRound, length) =>
          void act(() =>
            sendBody(() => {
              const last = schedule.entries.at(-1);
              if (!last) throw new Error("일정표가 비었습니다");
              return {
                kind: "schedule",
                effectiveRound: fromRound,
                entry: { ...last, fromRound, length, phase: "live" },
              };
            }),
          )
        }
      />

      <Section title="운영 기록">
        {state.submitted.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" data-director-submitted>
            {state.submitted.map((s) => (
              <li key={s.id} className="text-white/70">
                다음 기록을 기다림 · {s.summary}
              </li>
            ))}
          </ul>
        )}
        {view.operations.length === 0 ? (
          <p className="text-sm text-white/55">장부에 운영 기록이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-director-ops>
            {[...view.operations].reverse().map((o) => (
              <OpRow
                key={o.id}
                o={o}
                state={state}
                busy={busy}
                onCancel={() =>
                  void act(() =>
                    sendBody(() => ({
                      kind: "cancel",
                      effectiveRound: 0,
                      target: fromHex(o.id),
                    })),
                  )
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="소속">
        {view.affiliations.length === 0 ? (
          <p className="text-sm text-white/55">효력이 생긴 소속이 없습니다.</p>
        ) : (
          <ul
            className="flex flex-col gap-2 text-sm"
            data-director-affiliations
          >
            {view.affiliations.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap gap-2 rounded-xl border border-white/10 px-3 py-2"
              >
                <b>{a.name}</b>
                <span className="text-white/60">
                  {a.badgeName} · {a.method} · 발급 {a.issued} ·{" "}
                  {a.until === null
                    ? `${roundShort(schedule, a.from)}부터`
                    : `${roundShort(schedule, a.until)}에 끝남`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="font-bold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function MyKey({
  k,
  busy,
  state,
  onInstall,
  onDesignate,
}: {
  k: DirectorKey;
  busy: boolean;
  state: DirectorState;
  onInstall: (() => void) | undefined;
  onDesignate: () => void;
}) {
  const { config, fingerprint } = keyLabel(k);
  const [copied, setCopied] = useState(false);
  const using = state.view.directors.some(
    (d) => d.until === null && d.fingerprint === fingerprint,
  );
  const pending = state.view.operations.some(
    (o) =>
      o.kind === "director-add" &&
      o.status === "pending" &&
      o.summary.endsWith(fingerprint),
  );
  const someDirector = state.view.directors.some((d) => d.until === null);
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-black/20 p-3"
      data-my-director-key
    >
      <p className="text-sm">
        이 기기에서 만든 국장 패스키 · 지문{" "}
        <code className="font-bold text-amber-100" data-fingerprint>
          {fingerprint}
        </code>{" "}
        <span className="text-white/60">
          {using
            ? "(장부의 국장 열쇠)"
            : pending
              ? "(지정 예고 중)"
              : "(아직 국장 열쇠가 아님)"}
        </span>
      </p>
      {!using && !pending && (
        <>
          <p className="break-keep text-white/65 text-xs">
            서버 설정에 넣을 값입니다. 서버를 다시 띄우면 시작 기록에 같은
            지문이 찍히는지 대조하세요(값을 옮기는 사이 바꿔치기를 막습니다).
          </p>
          <code
            className="break-all rounded-lg bg-black/40 p-2 text-xs"
            data-director-config
          >
            STARDRAW_DIRECTOR_KEYS={config}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(config)
                  .then(() => setCopied(true));
              }}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              {copied ? "복사했습니다" : "값 복사"}
            </button>
            {onInstall && (
              <button
                type="button"
                disabled={busy}
                onClick={onInstall}
                className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 text-sm hover:bg-amber-200/15 disabled:opacity-40"
              >
                서버 설정에 넣기(데모)
              </button>
            )}
            {someDirector && (
              <button
                type="button"
                disabled={busy}
                onClick={onDesignate}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                쓰는 중인 국장 열쇠로 지정
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AffiliationForm({
  busy,
  onSend,
  onStranger,
}: {
  busy: boolean;
  onSend: (fields: Fields) => void;
  onStranger: ((fields: Fields) => void) | undefined;
}) {
  const [name, setName] = useState("시험 성단");
  const [badge, setBadge] = useState<Badge>(2);
  const [method, setMethod] = useState("초대 코드");
  const fields = (): Fields => ({
    name: name.normalize("NFC").trim(),
    badge,
    method: method.normalize("NFC").trim(),
    issuerKey: new Uint8Array(),
    issued: 0,
  });
  return (
    <Section title="시험 소속 추가">
      <p className="break-keep text-sm text-white/70">
        소속은 별·성단 이름과 배지, 신원 확인 방법 이름만 장부에 남깁니다. 실제
        확인 값(기관 주소 등)은 장부에 넣지 않습니다. 자격 열쇠와 발급 수는
        나중에 채웁니다.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          이름
          <input
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          배지
          <select
            value={badge}
            onChange={(e) => setBadge(Number(e.target.value) as Badge)}
            className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
          >
            {Object.entries(BADGES).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          신원 확인 방법
          <input
            value={method}
            maxLength={20}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSend(fields())}
          className="sd-cta rounded-lg px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
        >
          국장 패스키로 서명해 예고
        </button>
        {onStranger && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStranger(fields())}
            className="rounded-lg border border-rose-300/40 px-3 py-2 text-rose-100 text-sm hover:bg-rose-400/10 disabled:opacity-40"
          >
            국장 아닌 패스키로 해 보기
          </button>
        )}
      </div>
    </Section>
  );
}

type Fields = {
  name: string;
  badge: Badge;
  method: string;
  issuerKey: Uint8Array;
  issued: number;
};

/** 정식 시작 예약: 정각 추첨이 되는 x:55 시작 회차만 고를 수 있다(24시간 예고 뒤) */
function LiveStart({
  state,
  busy,
  onSend,
}: {
  state: DirectorState;
  busy: boolean;
  onSend: (fromRound: number, length: number) => void;
}) {
  const { schedule, view } = state;
  const phased = schedule.entries.every((e) => e.phase !== undefined);
  const options = phased ? liveOptions(state) : [];
  const [pick, setPick] = useState<number | null>(null);
  if (!phased) return null;
  const live = liveStart(schedule);
  const chosen = pick ?? options[0]?.round ?? null;
  return (
    <Section title="정식 시작 예약">
      {live !== null ? (
        <p className="text-sm text-white/70">
          정식 단계가 이미 정해졌습니다(사슬 {live}회차부터 정식 1회).
        </p>
      ) : view.schedulePending ? (
        <p className="text-sm text-white/70">
          예고 중인 일정 바꾸기가 있습니다. 바꾸려면 아래 운영 기록에서 먼저
          취소하세요.
        </p>
      ) : (
        <>
          <p className="break-keep text-sm text-white/70">
            정식 단계는 {scheduleLine(3600)}입니다. 첫 회차는 x:55에 열려야
            하고, 이 요청이 실리는 기록의 마감에서 24시간 뒤부터 고를 수
            있습니다. 효력이 생기기 전까지는 취소할 수 있습니다.
          </p>
          <label className="flex flex-col gap-1 text-sm sm:max-w-sm">
            정식 1회가 열리는 시각
            <select
              value={chosen ?? ""}
              onChange={(e) => setPick(Number(e.target.value))}
              className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
              data-live-start
            >
              {options.map((o) => (
                <option key={o.round} value={o.round}>
                  {at(o.opensAt)} 시작 · 사슬 {o.round}회차
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || chosen === null}
            onClick={() => chosen !== null && onSend(chosen, 3600)}
            className="sd-cta self-start rounded-lg px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
          >
            국장 패스키로 서명해 예약
          </button>
        </>
      )}
    </Section>
  );
}

/** 가장 이른 효력 회차부터, 1시간 회차가 정각 추첨이 되는 시작 회차 24개 */
function liveOptions(
  state: DirectorState,
): { round: number; opensAt: number }[] {
  const out: { round: number; opensAt: number }[] = [];
  const { schedule } = state;
  for (
    let r = state.view.next.earliestEffectiveRound;
    out.length < 24 && r < state.view.next.earliestEffectiveRound + 24 * 60;
    r++
  ) {
    const opensAt = roundTimes(schedule, r).opensAt;
    if (isAlignedEpoch(opensAt, 3600)) out.push({ round: r, opensAt });
  }
  return out;
}

function OpRow({
  o,
  state,
  busy,
  onCancel,
}: {
  o: OperationView;
  state: DirectorState;
  busy: boolean;
  onCancel: () => void;
}) {
  const { schedule } = state;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm",
        o.status === "pending" ? "border-amber-200/30" : "border-white/10",
        o.status === "cancelled" && "opacity-60",
      )}
      data-op-status={o.status}
    >
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-semibold text-xs",
          o.status === "pending"
            ? "bg-amber-200/20 text-amber-100"
            : o.status === "applied"
              ? "bg-emerald-300/15 text-emerald-100"
              : "bg-white/10 text-white/60",
        )}
      >
        {STATUS_LABEL[o.status]}
      </span>
      <b className="break-keep">{o.summary}</b>
      <span className="text-white/55 text-xs">
        {roundShort(schedule, o.round)} 기록 ·{" "}
        {o.kind === "cancel"
          ? "바로"
          : `${roundShort(schedule, o.effectiveRound)}(${at(o.effectiveAt)})부터`}{" "}
        · 서명 {o.signedBy}
        {o.cancelledIn !== null &&
          ` · ${roundShort(schedule, o.cancelledIn)}에 취소`}
      </span>
      {o.status === "pending" && o.kind !== "cancel" && (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="ml-auto rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
        >
          예고 취소
        </button>
      )}
    </li>
  );
}
