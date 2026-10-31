"use client";

import {
  GOOGLE_CLIENT_ID,
  type QualHolding,
  type QualInfo,
  type QualPeriodInfo,
  qualDisplayId,
  qualKeyFromSeed,
  recoveryCode,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { InviteQr } from "@/components/InviteQr";
import { cn } from "@/lib/cn";
import { checkOwner } from "../astronaut/owner-check";
import { FX } from "../fx-timing";
import {
  checkHolding,
  importRecoveryCode,
  loadHoldings,
  qualLoginNonceFor,
  receiveQualification,
  removeHolding,
} from "../qual-store";
import { roundShort } from "../round-label";
import { DEMO_NS, type Services } from "../services";
import { sitePolicy } from "../wallet";
import { IdPresentView, useIdPresent } from "./IdPresent";

/**
 * 상품 자격 받기·백업·불러오기(docs/36 11-13). 기관 계정으로 확인하면 이 기기에서 만든 자격 열쇠에
 * 우주국 도장을 가린 채로 받는다. 우주국은 무엇에 찍었는지 모른다. 데모는 데모 기관 계정으로 받는다.
 */
export function QualifyPanel({
  services,
  onChange,
}: {
  services: Services;
  onChange?: () => void;
}) {
  const [info, setInfo] = useState<QualInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const demo = services.ns === DEMO_NS;
  const ledgerId = services.ledger.id();

  const load = useCallback(async () => {
    try {
      setInfo(await services.ledger.qualInfo());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [services]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setVersion((v) => v + 1);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const holdings = loadHoldings(services.ns, ledgerId);
  const holdingOf = (p: QualPeriodInfo) =>
    holdings.find((h) => toHex(h.periodId) === p.id && checkHolding(p, h));

  if (!info)
    return (
      <p className="py-6 text-center text-sm text-white/60">
        {error ?? "소속을 읽고 있습니다"}
      </p>
    );

  return (
    <div className="flex flex-col gap-4" data-qualify data-version={version}>
      {info.periods.length === 0 ? (
        <div className="sd-glass flex flex-col gap-3 rounded-2xl p-4 text-sm">
          <p className="text-white/70">지금 받을 수 있는 소속이 없습니다.</p>
          {demo && services.practice && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await services.practice?.prepareDemoQualification();
                })
              }
              className="sd-cta self-start rounded-lg px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
            >
              {busy ? "데모 소속을 차리는 중" : "데모 소속 차리기"}
            </button>
          )}
        </div>
      ) : (
        info.periods.map((p) => {
          const holding = holdingOf(p);
          return (
            <section
              key={p.id}
              className="sd-glass flex flex-col gap-3 rounded-2xl p-4"
              data-qual-period={p.id}
            >
              <div className="flex flex-col gap-1">
                <h2 className="font-bold text-lg">{p.affiliationName}</h2>
                <p className="text-sm text-white/60 tabular-nums">
                  {`${p.method} · ${p.number}기 · ${day(p.startsAt)}~${day(p.endsAt)} · 발급 ${p.issued}개`}
                </p>
                <p className="break-keep text-sm text-white/70">
                  우주국도 누가 받았는지 모릅니다.
                </p>
              </div>
              {holding ? (
                <Backup
                  services={services}
                  holding={holding}
                  fresh={justReceived.has(p.id)}
                  onRemoved={() => {
                    removeHolding(services.ns, ledgerId, p.id);
                    justReceived.delete(p.id);
                    setVersion((v) => v + 1);
                    onChange?.();
                  }}
                />
              ) : !p.open ? (
                <p className="text-sm text-white/60">
                  지금은 받을 수 없습니다.
                </p>
              ) : p.verify === "demo" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await receiveQualification(
                        services.ns,
                        services.ledger,
                        p,
                        "demo",
                      );
                      justReceived.add(p.id);
                    })
                  }
                  className="sd-cta self-start rounded-lg px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
                  data-qual-demo-receive
                >
                  데모 기관 계정으로 받기
                </button>
              ) : GOOGLE_CLIENT_ID ? (
                <GoogleButton
                  disabled={busy}
                  nonce={qualLoginNonceFor(services.ns, services.ledger, p)}
                  onCredential={(token) =>
                    void act(async () => {
                      await receiveQualification(
                        services.ns,
                        services.ledger,
                        p,
                        token,
                      );
                      justReceived.add(p.id);
                    })
                  }
                />
              ) : (
                <p className="text-sm text-white/60">준비 중입니다.</p>
              )}
            </section>
          );
        })
      )}
      {info.periods.length > 0 && (
        <ImportCode
          busy={busy}
          onImport={(code) =>
            void act(async () => {
              const got = importRecoveryCode(services.ns, ledgerId, info, code);
              justReceived.add(toHex(got.periodId));
            })
          }
        />
      )}
      <p
        role="status"
        aria-live="polite"
        className={cn("min-h-5 break-keep text-sm text-rose-200")}
        data-qual-error={error ? "" : undefined}
      >
        {error}
      </p>
    </div>
  );
}

function day(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 이번 방문에서 막 받거나 불러온 기간(복구 코드를 바로 한 번 보여 준다) */
const justReceived = new Set<string>();

/** 이 기기에서 내지 않은 응모에 내 소속 증서가 쓰였는지(복구 코드가 새어 나간 신호) */
function foreignUses(services: Services, holding: QualHolding): number[] {
  const qualPub = toHex(qualKeyFromSeed(holding.seed).publicKey);
  const mine = new Set(
    services.wallet.loadTickets().map((m) => toHex(ticketId(m.ticket))),
  );
  const rounds = new Set<number>();
  for (const { tickets } of services.ledger.closed())
    for (const t of tickets)
      if (
        t.qual &&
        toHex(t.qual.cert.qualPub) === qualPub &&
        !mine.has(toHex(ticketId(t)))
      )
        rounds.add(t.round);
  return [...rounds].sort((a, b) => a - b);
}

/**
 * 받은 자격과 복구 코드(평문 백업). 2026-10-31 보안 검토 B5: 코드는 받거나 불러온 직후에만 보이고, 다시 볼 때는
 * 등록증 주인 확인(패스키)을 거친다. 공용 PC·잠금이 풀린 기기에서 남이 코드를 베껴 가지 못하게 한다
 */
function Backup({
  services,
  holding,
  fresh,
  onRemoved,
}: {
  services: Services;
  holding: QualHolding;
  fresh: boolean;
  onRemoved: () => void;
}) {
  const code = recoveryCode(holding);
  const id = qualDisplayId(
    holding.periodId,
    qualKeyFromSeed(holding.seed).publicKey,
  );
  const [shown, setShown] = useState(fresh);
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const key = services.wallet.loadKey();
  const idp = useIdPresent(services);
  const leaked = foreignUses(services, holding);
  const reveal = async () => {
    if (!key) return;
    setChecking(true);
    setDenied(false);
    try {
      // 신분증 제시 틀: 오버레이 → 우주국 말 → 등록증을 내밀면 그 누름에 바로 패스키
      const ok = await idp.run(
        async () => {
          const yes = await checkOwner(
            key.pub,
            await services.wallet.ownerSigner(key.pub),
            sitePolicy(),
            Math.floor(services.clock.now() / 1000),
          );
          if (!yes) throw new Error("이 기기의 등록증이 아닙니다");
          return true;
        },
        {
          verb: "확인",
          pub: key.pub,
          tap: true,
          readFirst: true,
          done: "본인이 맞습니다.",
          hold: FX.idHoldSubmit,
        },
      );
      if (ok) setShown(true);
    } catch {
      setDenied(true);
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="flex flex-col gap-3" data-qual-holding={id}>
      <IdPresentView services={services} id={idp} />
      <p className="font-semibold text-emerald-200">
        받았습니다 · 소속 번호 {id}
      </p>
      {leaked.length > 0 && (
        <p
          role="alert"
          className="break-keep rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-rose-100 text-sm"
          data-qual-leak
        >
          이 기기에서 내지 않은 응모에 내 소속 증서가 쓰였습니다(
          {leaked
            .map((r) => roundShort(services.ledger.schedule, r))
            .join(", ")}
          ).
        </p>
      )}
      {!shown ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            disabled={!key || checking}
            onClick={() => void reveal()}
            className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10 disabled:opacity-40"
            data-qual-reveal
          >
            {checking ? "확인하고 있습니다" : "복구 코드 다시 보기"}
          </button>
          {denied && (
            <span className="text-rose-200">
              등록증 확인을 마치지 못했습니다.
            </span>
          )}
          {!key && (
            <span className="text-white/60">
              이 기기에 등록증이 있어야 다시 볼 수 있습니다.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200/30 bg-amber-200/5 p-3">
          <p className="break-keep text-sm text-amber-50">
            복구 코드를 가진 사람은 이 기간 이 소속으로 응모할 수 있습니다.
            비밀번호처럼 보관하세요. 패스키를 잃어도 이 코드로 새 등록증에
            불러올 수 있습니다.
          </p>
          <code
            className="select-all break-all rounded-lg bg-black/40 p-2 font-mono text-xs"
            data-qual-code
          >
            {code}
          </code>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(code)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
              className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10"
            >
              {copied ? "복사됨" : "복사"}
            </button>
            <button
              type="button"
              onClick={() => setQr((v) => !v)}
              className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10"
            >
              {qr ? "QR 닫기" : "QR 보기"}
            </button>
            <button
              type="button"
              onClick={() => download(`stardraw-${id}.txt`, `${code}\n`)}
              className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10"
            >
              파일로 받기
            </button>
          </div>
          {qr && (
            <div className="self-start">
              <InviteQr url={code} size={200} label="복구 코드 QR" />
            </div>
          )}
          <p className="text-white/50 text-xs">
            받은 다음 회차 응모부터 붙습니다.
          </p>
        </div>
      )}
      {removing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="break-keep text-rose-100">
            복구 코드를 보관하지 않았다면 되돌릴 수 없습니다.
          </span>
          <button
            type="button"
            onClick={onRemoved}
            className="rounded-lg border border-rose-300/50 px-3 py-1.5 text-rose-100 hover:bg-rose-500/10"
            data-qual-remove-confirm
          >
            지우기
          </button>
          <button
            type="button"
            onClick={() => setRemoving(false)}
            className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10"
          >
            그대로 두기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRemoving(true)}
          className="self-start text-sm text-white/60 underline underline-offset-4 hover:text-white"
          data-qual-remove
        >
          이 기기에서 지우기
        </button>
      )}
    </div>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportCode({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <details className="sd-glass rounded-2xl p-4 text-sm">
      <summary className="cursor-pointer font-semibold">
        복구 코드 불러오기
      </summary>
      <div className="flex flex-col gap-2 pt-3">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={3}
          placeholder="SDQ1-…"
          aria-label="복구 코드"
          className="rounded-lg border border-white/15 bg-black/30 p-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={busy || code.trim() === ""}
          onClick={() => onImport(code)}
          className="self-start rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10 disabled:opacity-40"
        >
          불러오기
        </button>
      </div>
    </details>
  );
}

// ── 구글 로그인(Google Identity Services) ──

interface GoogleId {
  initialize(o: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    auto_select?: boolean;
    nonce?: string;
  }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}

let gis: Promise<GoogleId> | null = null;

function loadGoogle(): Promise<GoogleId> {
  const found = (window as { google?: { accounts?: { id?: GoogleId } } }).google
    ?.accounts?.id;
  if (found) return Promise.resolve(found);
  gis ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const id = (window as { google?: { accounts?: { id?: GoogleId } } })
        .google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("구글 로그인을 불러오지 못했습니다"));
    };
    script.onerror = () => {
      gis = null;
      reject(new Error("구글 로그인을 불러오지 못했습니다"));
    };
    document.head.appendChild(script);
  });
  return gis;
}

/** 구글 단추. 로그인하면 ID 토큰을 넘긴다(서버가 서명·도메인을 확인한다) */
function GoogleButton({
  disabled,
  nonce,
  onCredential,
}: {
  disabled: boolean;
  /** ID 토큰을 이 기기의 가린 값에 묶는 값(서버가 확인한다, docs/36 11-13) */
  nonce: string;
  onCredential: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadGoogle()
      .then((id) => {
        if (!alive || !ref.current) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r) => callback.current(r.credential),
          auto_select: false,
          nonce,
        });
        id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          locale: "ko",
        });
      })
      .catch((err: Error) => setFailed(err.message));
    return () => {
      alive = false;
    };
  }, [nonce]);
  return (
    <div className={cn(disabled && "pointer-events-none opacity-40")}>
      <div ref={ref} data-qual-google />
      {failed && <p className="text-rose-200 text-sm">{failed}</p>}
    </div>
  );
}
