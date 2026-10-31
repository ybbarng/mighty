"use client";

import {
  GOOGLE_CLIENT_ID,
  type QualHolding,
  type QualInfo,
  type QualPeriodInfo,
  qualDisplayId,
  qualKeyFromSeed,
  recoveryCode,
  toHex,
} from "@mighty/stardraw-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { InviteQr } from "@/components/InviteQr";
import { cn } from "@/lib/cn";

import {
  checkHolding,
  importRecoveryCode,
  loadHoldings,
  qualLoginNonceFor,
  receiveQualification,
} from "../qual-store";
import { DEMO_NS, type Services } from "../services";

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
                <Backup holding={holding} />
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
              importRecoveryCode(services.ns, ledgerId, info, code);
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

/** 받은 자격과 복구 코드(평문 백업) */
function Backup({ holding }: { holding: QualHolding }) {
  const code = recoveryCode(holding);
  const id = qualDisplayId(
    holding.periodId,
    qualKeyFromSeed(holding.seed).publicKey,
  );
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3" data-qual-holding={id}>
      <p className="font-semibold text-emerald-200">
        받았습니다 · 소속 번호 {id}
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-amber-200/30 bg-amber-200/5 p-3">
        <p className="break-keep text-sm text-amber-50">
          복구 코드를 가진 사람은 이 기간 이 소속으로 응모할 수 있습니다.
          비밀번호처럼 보관하세요. 패스키를 잃어도 이 코드로 새 등록증에 불러올
          수 있습니다.
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
