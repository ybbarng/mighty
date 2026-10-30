import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  BUNDLE_SIZES,
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
 *   genesis.json         처음 일정표(시험 표시·옮긴 등록의 수와 루트 포함)와 옮겨 온 등록 목록
 *   head.json            닫힌 회차 수, 마지막 기록 해시, 봉인한 회차 수, 서버 공개 열쇠
 *   seals/000001.json    마감 직후 봉인 값과 투명성 로그 증거(drand 값보다 먼저 나온다)
 *   rounds/000001.json   회차 기록(고정 바이너리 base64url)과 응모권·열쇠 등록 목록(id 순)
 *   bundles/10/000001.json, bundles/100/000001.json
 *                        다 찬 10·100회차 구간의 회차·봉인 파일 묶음(받는 요청 수를 줄인다). 한 번 쓰면 바꾸지 않는다
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

export interface BundleFile {
  v: 1;
  first: number;
  size: number;
  rounds: RoundFile[];
  seals: SealFile[];
}

export interface GenesisFile {
  v: 1;
  schedule: Schedule;
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
    for (const size of BUNDLE_SIZES)
      mkdirSync(join(dir, "bundles", String(size)), { recursive: true });
  }

  private write(path: string, value: unknown): void {
    const full = join(this.dir, path);
    const tmp = `${full}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(value)}\n`);
    renameSync(tmp, full);
  }

  /** 처음 일정표 */
  genesis(schedule: Schedule): void {
    this.write("genesis.json", { v: 1, schedule } satisfies GenesisFile);
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

  /**
   * 닫힌 회차가 rounds개일 때 다 찬 묶음 가운데 아직 없는 것을 쓴다(띄울 때 지난 구간도 채운다).
   * 묶음은 이미 낸 회차·봉인 파일을 그대로 담는다. 있는 묶음은 다시 쓰지 않는다(바뀌지 않는 파일)
   */
  bundles(rounds: number): void {
    for (const size of BUNDLE_SIZES)
      for (let first = 1; first + size - 1 <= rounds; first += size) {
        const path = `bundles/${size}/${pad(first)}.json`;
        if (existsSync(join(this.dir, path))) continue;
        const read = (kind: string, n: number) =>
          JSON.parse(
            readFileSync(join(this.dir, kind, `${pad(n)}.json`), "utf8"),
          ) as unknown;
        const range = Array.from({ length: size }, (_, i) => first + i);
        this.write(path, {
          v: 1,
          first,
          size,
          rounds: range.map((n) => read("rounds", n)) as RoundFile[],
          seals: range.map((n) => read("seals", n)) as SealFile[],
        } satisfies BundleFile);
      }
  }
}
