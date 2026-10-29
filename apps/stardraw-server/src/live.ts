import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  carryRegistrations,
  checkRegistration,
  checkSchedule,
  entrantId,
  genesisHash,
  type Schedule,
  toHex,
} from "@mighty/stardraw-core";

import { defaultSchedule } from "./config";
import { Publisher } from "./publish";
import { Store } from "./store";

/**
 * 정식 시작(docs/36 11-6): 시험 장부 백업에서 패스키 등록(공개 열쇠·패스키 번호)만 꺼내,
 * 새 정식 장부의 처음 일정표에 묶어 옮긴다. 응모권·회차·확인 요청은 옮기지 않는다.
 * 옮긴 등록은 처음 일정표의 `carried`(수·머클 루트)로 genesis 해시에 들어가 1회차 전에 고정되고,
 * 목록은 genesis.json에 공개된다. 검사기는 루트·형식·겹침만 보고 작업 증명은 보지 않는다.
 */

export interface StartLiveInput {
  dataDir: string;
  ledgerDir: string;
  /** 정식 1회차 시작(유닉스 초) */
  epoch: number;
  /** 정식 회차 길이(초). 기본 1시간 */
  roundSeconds?: number;
  /** 시험 장부 백업(SQLite 파일, `server.mjs backup`으로 뜬 것) */
  trialExport: string;
  /** 지금 시각(초). 1회차 시작은 이보다 뒤여야 한다 */
  now: number;
}

export interface StartLiveResult {
  schedule: Schedule;
  carried: number;
  /** 옮기지 않은 원시 열쇠 등록(터미널 열쇠) 수 */
  skipped: number;
  genesis: string;
}

export function startLive(input: StartLiveInput): StartLiveResult {
  if (!Number.isInteger(input.epoch))
    throw new Error("1회차 시작 시각이 정수 초가 아니다");
  if (input.epoch <= input.now)
    throw new Error(
      "정식 1회차 시작은 지금보다 뒤여야 한다(지난 회차가 생기지 않게)",
    );
  const exported = Store.readExport(input.trialExport);
  if (exported.genesis?.ledger !== "trial")
    throw new Error("시험 장부 백업이 아니다(처음 일정표에 시험 표시가 없다)");
  const passkeys = exported.registrations.filter(
    (r) => r.kind === "passkey" && checkRegistration(r) === null,
  );
  const skipped = exported.registrations.length - passkeys.length;
  const base = defaultSchedule(input.epoch, "live", input.roundSeconds);
  const { registrations, carried } = carryRegistrations(passkeys);
  const schedule: Schedule =
    registrations.length > 0 ? { ...base, carried } : base;
  const problem = checkSchedule(schedule);
  if (problem) throw new Error(`정식 일정표: ${problem}`);

  mkdirSync(input.dataDir, { recursive: true });
  const store = new Store(join(input.dataDir, "stardraw.sqlite"));
  try {
    store.initLedger(
      schedule,
      registrations.map((reg) => ({
        entrantHex: toHex(entrantId(reg.pub)),
        credentialHex: toHex(reg.credentialId),
        reg,
      })),
    );
    new Publisher(input.ledgerDir).genesis(schedule, registrations);
  } finally {
    store.close();
  }
  return {
    schedule,
    carried: registrations.length,
    skipped,
    genesis: toHex(genesisHash(schedule)),
  };
}

/** `start-live --epoch <ISO> --carry-registrations <파일> [--round-seconds <초>]` 읽기 */
export function parseStartLiveArgs(args: readonly string[]): {
  epoch: number;
  trialExport: string;
  roundSeconds?: number;
} {
  const get = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const iso = get("--epoch");
  const trialExport = get("--carry-registrations");
  if (!iso || !trialExport)
    throw new Error(
      "쓰는 법: start-live --epoch 2026-11-02T09:00:00+09:00 --carry-registrations <시험 장부 백업>",
    );
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || ms % 1000 !== 0)
    throw new Error(`시각을 읽지 못했다: ${iso}`);
  const rounds = get("--round-seconds");
  return {
    epoch: ms / 1000,
    trialExport,
    ...(rounds ? { roundSeconds: Number(rounds) } : {}),
  };
}
