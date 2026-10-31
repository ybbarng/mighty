import { createReadStream, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { join, normalize } from "node:path";
import {
  decodeSignatureData,
  encodeReceipt,
  fromBase64Url,
  type SignatureData,
  toBase64Url,
} from "@mighty/stardraw-core";

import { EntryError, type StardrawServer } from "./engine";
import type { Relay } from "./relay";

/**
 * HTTP 주소(모두 `basePath` 아래, 운영은 /stardraw-api).
 *   GET  /api/state                     지금 회차·닫힌 회차 수·문제 값·응모 수·서버 공개 열쇠
 *   GET  /api/keys/:pub                 이 공개 열쇠가 등록돼 있는지와 등록 회차 { registered, round }
 *   GET  /api/passkeys/:credentialId    패스키 번호로 공개 열쇠 찾기(다른 기기에서 내 패스키 찾기). 국장 패스키면 403
 *   POST /api/register                  { registration, proof, head } → { round }(우주인 등록 직후 등록만 올리기)
 *   POST /api/enter                     { ticket, registration? } → { receipt, receivedAt }
 *   POST /api/confirm/invites           당첨자: { invite }(서명한 확인 링크 초대) → { expiresAt }
 *   POST /api/confirm/peek              확인하는 사람: { token } → { state: "open", round, ticketId, expiresAt } | { state: "used" }
 *   POST /api/confirm/start             { token, checkerKey, director?: { pub, signature, to } } → { id, request, checkerKey, answerBy, invitedAt, reportKey }
 *   POST /api/confirm/open              { ticketIds } → 열린 요청들
 *   GET  /api/confirm/:id               { answer, outcome }
 *   POST /api/confirm/:id/answer        { claim, winnerKey }(서명 없는 거절은 받지 않는다)
 *   POST /api/confirm/:id/report        { reportKey, outcome }
 * 확인 링크 토큰은 주소에 넣지 않고 본문으로만 받는다(서버 로그에 남지 않게).
 *   GET  /api/director/state            국장 관리 화면: 다음 기록(서명할 장부 끝 해시), 국장 열쇠·운영 기록·소속, 받아 둔 요청
 *   POST /api/director/ops              { op }(국장 패스키로 서명한 운영 기록) → { id, round, effectiveRound }
 *   POST /api/director/qual-key         { pub, signature }(국장 서명) → 새 도장 열쇠(비밀은 서버에) { issuerKey }. 국장이 자격 기간 열기에 넣어 서명한다
 *   GET  /api/qual                      효력이 생긴 자격 기간과 이 서버에서 받을 수 있는지 { round, periods }
 *   POST /api/qual/:periodId/blind      { idToken, blinded }(구글 ID 토큰, 가린 값) → { blindStamp }(docs/36 11-13)
 *   GET  /ledger/...                    공개 장부 파일(nginx가 대신 내도 된다)
 * 바이트는 모두 base64url이다. 화면과 같은 출처라 CORS가 필요 없고, 개발용 출처만 허용 목록에 둔다.
 */

export interface HttpOptions {
  basePath: string;
  ledgerDir: string;
  devOrigins: readonly string[];
  trustProxy: boolean;
}

const MAX_BODY = 16 * 1024;

export function createHttpServer(
  engine: StardrawServer,
  relay: Relay,
  options: HttpOptions,
): Server {
  return createServer((req, res) => {
    void handle(engine, relay, options, req, res).catch((err) => {
      if (err instanceof EntryError)
        send(res, err.status, { error: err.message });
      else {
        console.error(err);
        send(res, 500, { error: "서버에서 문제가 생겼습니다" });
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new EntryError("요청이 너무 큽니다", 413);
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof value !== "object" || value === null) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new EntryError("요청 형식이 맞지 않습니다");
  }
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new EntryError(`${name}이(가) 없습니다`);
  return v;
};

/**
 * 상한을 셀 클라이언트 주소. `trustProxy`(운영: Traefik 뒤)면 `X-Real-Ip`를 쓴다.
 * 위조할 수 없는 이유(2026-10-30 Traefik v3.7.16 소스 pkg/middlewares/forwardedheaders/forwarded_header.go로 확인):
 * 진입점에 `forwardedHeaders.trustedIPs`·`insecure`를 두지 않으면 Traefik은 모든 클라이언트를 믿지 않아
 * 들어온 X-Real-Ip·X-Forwarded-*(밑줄 변형 X_Real_Ip 포함)를 지우고, X-Real-Ip를 실제 접속 주소로 새로 넣는다.
 * 그래서 이 값은 Traefik이 본 접속 주소다. 전제: 서버 포트를 바깥에 열지 않고 Traefik만 바깥 80·443을 받는다
 * (servers 저장소 byb.kr/apps/stardraw/compose.yaml에 ports 없음, traefik.yml에 forwardedHeaders 없음).
 * Traefik 앞에 다른 프록시(CDN 등)를 두게 되면 그 프록시만 trustedIPs로 믿게 설정을 함께 바꿔야 한다
 */
function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const real = req.headers["x-real-ip"];
    if (typeof real === "string" && real) return real;
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function handle(
  engine: StardrawServer,
  relay: Relay,
  o: HttpOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 응답을 받은 형식대로만 읽게(브라우저가 내용을 짐작해 스크립트로 돌리지 않게, D12)
  res.setHeader("x-content-type-options", "nosniff");
  const origin = req.headers.origin;
  if (origin && o.devOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "GET, POST");
    res.setHeader("vary", "origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://local");
  if (!url.pathname.startsWith(`${o.basePath}/`))
    return send(res, 404, { error: "없는 주소입니다" });
  const path = url.pathname.slice(o.basePath.length);
  const method = req.method ?? "GET";

  if (method === "GET" && path.startsWith("/ledger/"))
    return serveLedger(o.ledgerDir, path.slice(8), res);

  if (method === "GET" && path === "/api/state")
    return send(res, 200, engine.state());

  const keyMatch = path.match(/^\/api\/keys\/([A-Za-z0-9_-]+)$/);
  if (method === "GET" && keyMatch) {
    let pub: Uint8Array;
    try {
      pub = fromBase64Url(keyMatch[1] as string);
    } catch {
      throw new EntryError("공개 열쇠 형식이 맞지 않습니다");
    }
    const round = engine.registrationRound(pub);
    return send(res, 200, { registered: round !== null, round });
  }

  const credentialMatch = path.match(/^\/api\/passkeys\/([A-Za-z0-9_-]+)$/);
  if (method === "GET" && credentialMatch) {
    let credentialId: Uint8Array;
    try {
      credentialId = fromBase64Url(credentialMatch[1] as string);
    } catch {
      throw new EntryError("패스키 번호 형식이 맞지 않습니다");
    }
    const pub = await engine.passkeyPub(credentialId);
    if (!pub) throw new EntryError("장부에 없는 패스키입니다", 404);
    return send(res, 200, { pub: toBase64Url(pub) });
  }

  if (method === "POST" && path === "/api/register") {
    const body = await readJson(req);
    let registration: Uint8Array;
    let proof: Uint8Array;
    try {
      registration = fromBase64Url(str(body.registration, "열쇠 등록"));
      proof = fromBase64Url(str(body.proof, "등록 서명"));
    } catch (err) {
      if (err instanceof EntryError) throw err;
      throw new EntryError("등록 형식이 맞지 않습니다");
    }
    return send(
      res,
      200,
      await engine.register({
        registration,
        proof,
        head: str(body.head, "문제 값"),
        ip: clientIp(req, o.trustProxy),
      }),
    );
  }

  if (method === "POST" && path === "/api/enter") {
    const body = await readJson(req);
    let ticket: Uint8Array;
    let registration: Uint8Array | undefined;
    try {
      ticket = fromBase64Url(str(body.ticket, "응모권"));
      if (body.registration !== undefined)
        registration = fromBase64Url(str(body.registration, "열쇠 등록"));
    } catch (err) {
      if (err instanceof EntryError) throw err;
      throw new EntryError("응모권 형식이 맞지 않습니다");
    }
    const receipt = await engine.submit({
      ticket,
      ...(registration ? { registration } : {}),
      ip: clientIp(req, o.trustProxy),
    });
    return send(res, 200, {
      receipt: toBase64Url(encodeReceipt(receipt)),
      receivedAt: receipt.receivedAt,
    });
  }

  if (method === "GET" && path === "/api/director/state")
    return send(res, 200, await engine.directorState());

  if (method === "POST" && path === "/api/director/ops") {
    const body = await readJson(req);
    let op: Uint8Array;
    try {
      op = fromBase64Url(str(body.op, "운영 기록"));
    } catch (err) {
      if (err instanceof EntryError) throw err;
      throw new EntryError("운영 기록 형식이 맞지 않습니다");
    }
    return send(
      res,
      200,
      await engine.submitDirectorOp(op, clientIp(req, o.trustProxy)),
    );
  }

  if (method === "POST" && path === "/api/director/qual-key") {
    const body = await readJson(req);
    let auth: { pub: Uint8Array; signature: SignatureData };
    try {
      auth = {
        pub: fromBase64Url(str(body.pub, "국장 공개 열쇠")),
        signature: decodeSignatureData(str(body.signature, "국장 서명")),
      };
    } catch {
      throw new EntryError("국장 서명 형식이 맞지 않습니다");
    }
    return send(
      res,
      200,
      await engine.createIssuerKey(clientIp(req, o.trustProxy), auth),
    );
  }

  if (method === "GET" && path === "/api/qual")
    return send(res, 200, await engine.qualInfo());

  const qualMatch = path.match(/^\/api\/qual\/([0-9a-f]{64})\/blind$/);
  if (method === "POST" && qualMatch) {
    const body = await readJson(req);
    let blinded: Uint8Array;
    try {
      blinded = fromBase64Url(str(body.blinded, "가린 값"));
    } catch (err) {
      if (err instanceof EntryError) throw err;
      throw new EntryError("가린 값 형식이 맞지 않습니다");
    }
    const { blindStamp } = await engine.issueStamp({
      periodId: qualMatch[1] as string,
      idToken: str(body.idToken, "로그인 결과"),
      blinded,
      ip: clientIp(req, o.trustProxy),
    });
    return send(res, 200, { blindStamp: toBase64Url(blindStamp) });
  }

  if (method === "POST" && path === "/api/confirm/invites") {
    const body = await readJson(req);
    return send(
      res,
      200,
      await relay.createInvite({
        invite: str(body.invite, "확인 링크"),
        ip: clientIp(req, o.trustProxy),
      }),
    );
  }

  if (method === "POST" && path === "/api/confirm/peek") {
    const body = await readJson(req);
    return send(
      res,
      200,
      relay.peek(str(body.token, "링크"), clientIp(req, o.trustProxy)),
    );
  }

  if (method === "POST" && path === "/api/confirm/start") {
    const body = await readJson(req);
    const d =
      body.director && typeof body.director === "object"
        ? (body.director as Record<string, unknown>)
        : null;
    return send(
      res,
      200,
      await relay.start({
        token: str(body.token, "링크"),
        checkerKey: str(body.checkerKey, "임시 공개 열쇠"),
        ip: clientIp(req, o.trustProxy),
        ...(d
          ? {
              director: {
                pub: str(d.pub, "국장 공개 열쇠"),
                signature: str(d.signature, "국장 서명"),
                to: str(d.to, "받는 분"),
              },
            }
          : {}),
      }),
    );
  }

  if (method === "POST" && path === "/api/confirm/open") {
    const body = await readJson(req);
    if (!Array.isArray(body.ticketIds))
      throw new EntryError("응모권 id 목록이 없습니다");
    return send(res, 200, {
      open: relay.openFor(body.ticketIds.map((t) => str(t, "응모권 id"))),
    });
  }

  const confirmMatch = path.match(
    /^\/api\/confirm\/([0-9a-f]{24})(\/answer|\/report)?$/,
  );
  if (confirmMatch) {
    const id = confirmMatch[1] as string;
    const action = confirmMatch[2];
    if (method === "GET" && !action) return send(res, 200, relay.get(id));
    if (method === "POST" && action === "/answer") {
      const body = await readJson(req);
      // 서명 없는 거절은 받지 않는다(아무나 확인을 막을 수 있었다, 2026-10-31 보안 검토 B2). 답이 없으면 기한 뒤 끝난다
      if (body.declined === true)
        throw new EntryError(
          "거절은 보내지 않습니다. 승인하지 않으면 24시간 뒤 끝납니다",
        );
      await relay.answer(id, {
        claim: str(body.claim, "서명"),
        winnerKey: str(body.winnerKey, "임시 공개 열쇠"),
      });
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && action === "/report") {
      const body = await readJson(req);
      relay.report(id, str(body.reportKey, "결과 열쇠"), body.outcome);
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: "없는 주소입니다" });
}

/** 장부 파일. 닫힌 회차·봉인·묶음 파일은 바뀌지 않으므로 오래 캐시하고, head.json은 캐시하지 않는다 */
function serveLedger(dir: string, rel: string, res: ServerResponse): void {
  // genesis.json, head.json, rounds/000001.json, seals/000001.json, bundles/10/000001.json 꼴만(위 폴더로 나가지 못하게)
  if (
    !/^[a-z]+(\/[0-9]{6})?\.json$/.test(rel) &&
    !/^bundles\/(10|100)\/[0-9]{6}\.json$/.test(rel)
  ) {
    send(res, 404, { error: "없는 장부 파일입니다" });
    return;
  }
  const full = normalize(join(dir, rel));
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    send(res, 404, { error: "없는 장부 파일입니다" });
    return;
  }
  const immutable =
    rel.startsWith("rounds/") ||
    rel.startsWith("seals/") ||
    rel.startsWith("bundles/") ||
    rel === "genesis.json";
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": size,
    "cache-control": immutable
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(full).pipe(res);
}
