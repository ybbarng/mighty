import { createReadStream, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { join, normalize } from "node:path";
import {
  encodeReceipt,
  fromBase64Url,
  toBase64Url,
} from "@mighty/stardraw-core";

import { EntryError, type StardrawServer } from "./engine";
import type { Relay } from "./relay";

/**
 * HTTP 주소(모두 `basePath` 아래, 운영은 /stardraw-api).
 *   GET  /api/state                     지금 회차·닫힌 회차 수·문제 값·응모 수·서버 공개 열쇠
 *   GET  /api/keys/:pub                 이 공개 열쇠가 등록돼 있는지와 등록 회차 { registered, round }
 *   GET  /api/passkeys/:credentialId    패스키 번호로 공개 열쇠 찾기(다른 기기에서 내 패스키 찾기)
 *   POST /api/enter                     { ticket, registration? } → { receipt, receivedAt }
 *   POST /api/confirm                   당첨자 확인 요청 만들기 → { id, request, checkerKey, answerBy, token }
 *   POST /api/confirm/open              { ticketIds } → 열린 요청들
 *   GET  /api/confirm/:id               { answer, outcome }
 *   POST /api/confirm/:id/answer        { claim, winnerKey } | { declined: true }
 *   POST /api/confirm/:id/report        { token, outcome }
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
    const pub = engine.passkeyPub(credentialId);
    if (!pub) throw new EntryError("장부에 없는 패스키입니다", 404);
    return send(res, 200, { pub: toBase64Url(pub) });
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

  if (method === "POST" && path === "/api/confirm") {
    const body = await readJson(req);
    if (typeof body.round !== "number" || !Number.isInteger(body.round))
      throw new EntryError("회차가 없습니다");
    return send(
      res,
      200,
      relay.create({
        round: body.round,
        ticketId: str(body.ticketId, "응모권 id"),
        requester: str(body.requester, "확인하는 분 이름"),
        checkerKey: str(body.checkerKey, "임시 공개 열쇠"),
        ip: clientIp(req, o.trustProxy),
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
      await relay.answer(
        id,
        body.declined === true
          ? { declined: true }
          : {
              claim: str(body.claim, "서명"),
              winnerKey: str(body.winnerKey, "임시 공개 열쇠"),
            },
      );
      return send(res, 200, { ok: true });
    }
    if (method === "POST" && action === "/report") {
      const body = await readJson(req);
      relay.report(id, str(body.token, "확인 표"), body.outcome);
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: "없는 주소입니다" });
}

/** 장부 파일. 닫힌 회차·봉인 파일은 바뀌지 않으므로 오래 캐시하고, head.json은 캐시하지 않는다 */
function serveLedger(dir: string, rel: string, res: ServerResponse): void {
  // genesis.json, head.json, rounds/000001.json, seals/000001.json 꼴만(위 폴더로 나가지 못하게)
  if (!/^[a-z]+(\/[0-9]{6})?\.json$/.test(rel)) {
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
