import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  type KeyRegistration,
  type RoundRecord,
  type Schedule,
  sortRegistrations,
  sortTickets,
  type Ticket,
  toBase64Url,
} from "@mighty/stardraw-core";

/**
 * 공개 장부 파일(누구나 내려받아 처음부터 검사한다, docs/36 7절).
 *   genesis.json         처음 일정표
 *   head.json            닫힌 회차 수, 마지막 기록 해시, 봉인한 회차 수, 서버 공개 열쇠
 *   seals/000001.json    마감 직후 봉인 값과 투명성 로그 증거(drand 값보다 먼저 나온다)
 *   rounds/000001.json   회차 기록(고정 바이너리 base64url)과 응모권·열쇠 등록 목록(id 순)
 * 바이너리 형식은 규칙 패키지(@mighty/stardraw-core)가 정한다.
 */

export const pad = (n: number) => String(n).padStart(6, "0");

export interface SealFile {
  v: 1;
  round: number;
  count: number;
  merkleRoot: string;
  registrationCount: number;
  registrationRoot: string;
  digest: string;
  loggedAt: number;
  log: unknown;
}

export interface RoundFile {
  v: 1;
  record: string;
  tickets: string[];
  registrations: string[];
}

export interface HeadFile {
  v: 1;
  rounds: number;
  head: string;
  sealed: number;
  serverKey: string;
}

export class Publisher {
  constructor(private readonly dir: string) {
    mkdirSync(join(dir, "rounds"), { recursive: true });
    mkdirSync(join(dir, "seals"), { recursive: true });
  }

  private write(path: string, value: unknown): void {
    const full = join(this.dir, path);
    const tmp = `${full}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(value)}\n`);
    renameSync(tmp, full);
  }

  genesis(schedule: Schedule): void {
    this.write("genesis.json", { v: 1, schedule });
  }

  head(h: Omit<HeadFile, "v">): void {
    this.write("head.json", { v: 1, ...h } satisfies HeadFile);
  }

  seal(s: Omit<SealFile, "v">): void {
    this.write(`seals/${pad(s.round)}.json`, { v: 1, ...s } satisfies SealFile);
  }

  round(
    record: RoundRecord,
    tickets: readonly Ticket[],
    registrations: readonly KeyRegistration[],
  ): void {
    this.write(`rounds/${pad(record.round)}.json`, {
      v: 1,
      record: toBase64Url(encodeRecord(record)),
      tickets: sortTickets(tickets).map((t) => toBase64Url(encodeTicket(t))),
      registrations: sortRegistrations(registrations).map((r) =>
        toBase64Url(encodeRegistration(r)),
      ),
    } satisfies RoundFile);
  }
}
