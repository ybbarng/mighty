import {
  ByteReader,
  ByteWriter,
  compareBytes,
  concat,
  equalBytes,
  fromBase64Url,
  taggedHash,
  toBase64Url,
  toHex,
  utf8,
} from "./bytes";
import {
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  type Signer,
  verifySignature,
} from "./keys";
import type { RoundRecord } from "./record";
import {
  checkScheduleChange,
  readScheduleEntry,
  roundAt,
  roundTimes,
  SCHEDULE_NOTICE,
  type Schedule,
  type ScheduleEntry,
  withChange,
  writeScheduleEntry,
} from "./schedule";
import {
  DEFAULT_WEBAUTHN_POLICY,
  type EntrantSigner,
  readSignature,
  type SignatureData,
  verifyEntrantSignature,
  type WebAuthnPolicy,
  writeSignature,
} from "./signature";

/**
 * 운영 기록(docs/36 11-12): 우주국장(운영자)과 관인(서버 서명 열쇠)이 서명한 일 한 건.
 * 회차 기록 v2의 끝 칸에 실리고, 실린 회차 마감 + 24시간 뒤에 열리는 회차부터 효력이 생긴다.
 * "국장도 장부에 남는 기록으로만 일한다": 서버 DB에 직접 넣는 운영 일은 없다.
 *
 * 본문 = v(u8 = 1) ‖ kind(u8) ‖ after(32) ‖ effectiveRound(u32) ‖ 내용
 *   1 국장 열쇠 지정  credentialId(bytes) ‖ pub(65)
 *   2 국장 열쇠 빼기  pub(65)
 *   3 소속 추가       이름(text) ‖ 배지(u8) ‖ 방법(text) ‖ 자격 열쇠(bytes, 0 또는 65) ‖ 발급 수(u32)
 *   4 소속 바꾸기     대상 소속 id(32) ‖ 소속 추가와 같은 칸
 *   5 소속 끝내기     대상 소속 id(32)
 *   6 예고 취소       대상 운영 기록 id(32)
 *   7 일정 바꾸기     일정표 한 줄(schedule.ts writeScheduleEntry)
 * 운영 기록 = 본문 ‖ 서명자(u8: 1 관인, 2 국장) ‖ pub(65) ‖ 서명(관인 r‖s 64, 국장 패스키 서명)
 * 서명 대상 = "stardraw/op-sig/v1" ‖ 0x00 ‖ 본문, 운영 기록 id = taggedHash("stardraw/op/v1", 본문)
 *
 * `after`는 서명할 때의 장부 끝 해시다. 운영 기록은 prev가 그 값인 기록(서명 뒤 처음 닫히는 기록)에만
 * 실릴 수 있어, 예전 서명을 다른 회차에 다시 넣을 수 없다(재사용 방지).
 */

export const OP_VERSION = 1;

export const OP_KINDS = [
  "director-add",
  "director-remove",
  "affiliation-add",
  "affiliation-update",
  "affiliation-end",
  "cancel",
  "schedule",
] as const;
export type OpKind = (typeof OP_KINDS)[number];

/** 배지 종류(소속의 모양). 값은 바이트 */
export const BADGES = { 1: "별", 2: "성단", 3: "성운", 4: "은하" } as const;
export type Badge = keyof typeof BADGES;

export const MAX_LABEL = 20;
/** 패스키 번호 길이(등록과 같다) */
const MAX_CREDENTIAL_ID = 1023;

export interface AffiliationFields {
  /** 별·성단 이름(NFC, 1~20자) */
  name: string;
  badge: Badge;
  /** 신원 확인 방법 이름("기관 계정", "초대 코드"). 실제 값(도메인 등)은 서버 설정에만 둔다 */
  method: string;
  /** 소속 자격 열쇠의 공개 열쇠(나중에 채운다). 비면 0바이트 */
  issuerKey: Uint8Array;
  /** 공개한 발급 수. 소속 추가 때 0 */
  issued: number;
}

export type OpPayload =
  | { kind: "director-add"; credentialId: Uint8Array; pub: Uint8Array }
  | { kind: "director-remove"; pub: Uint8Array }
  | { kind: "affiliation-add"; fields: AffiliationFields }
  | {
      kind: "affiliation-update";
      target: Uint8Array;
      fields: AffiliationFields;
    }
  | { kind: "affiliation-end"; target: Uint8Array }
  | { kind: "cancel"; target: Uint8Array }
  | { kind: "schedule"; entry: ScheduleEntry };

export type OpBody = OpPayload & {
  v: number;
  /** 서명할 때의 장부 끝 해시(마지막 기록 해시, 기록이 없으면 genesis 해시) */
  after: Uint8Array;
  /** 효력이 생기는 회차(이 회차가 열릴 때부터). 취소는 0(실리는 즉시) */
  effectiveRound: number;
};

export type OpSigner =
  | { role: "seal"; pub: Uint8Array; signature: Uint8Array }
  | { role: "director"; pub: Uint8Array; signature: SignatureData };

export type Operation = OpBody & { signer: OpSigner };

// ── 바이트 ──

function writeFields(w: ByteWriter, f: AffiliationFields): void {
  w.text(f.name).u8(f.badge).text(f.method).bytes(f.issuerKey).u32(f.issued);
}

function readFields(r: ByteReader): AffiliationFields {
  const name = r.text();
  const badge = r.u8();
  if (!(badge in BADGES)) throw new Error(`모르는 배지: ${badge}`);
  return {
    name,
    badge: badge as Badge,
    method: r.text(),
    issuerKey: r.bytes(),
    issued: r.u32(),
  };
}

function writeBody(w: ByteWriter, b: OpBody): void {
  w.u8(b.v)
    .u8(OP_KINDS.indexOf(b.kind) + 1)
    .fixed(b.after, 32)
    .u32(b.effectiveRound);
  switch (b.kind) {
    case "director-add":
      w.bytes(b.credentialId).fixed(b.pub, PUBLIC_KEY_LENGTH);
      break;
    case "director-remove":
      w.fixed(b.pub, PUBLIC_KEY_LENGTH);
      break;
    case "affiliation-add":
      writeFields(w, b.fields);
      break;
    case "affiliation-update":
      w.fixed(b.target, 32);
      writeFields(w, b.fields);
      break;
    case "affiliation-end":
    case "cancel":
      w.fixed(b.target, 32);
      break;
    case "schedule":
      writeScheduleEntry(w, b.entry);
      break;
  }
}

function readBody(r: ByteReader): OpBody {
  const v = r.u8();
  if (v !== OP_VERSION) throw new Error(`모르는 운영 기록 판: ${v}`);
  const code = r.u8();
  const kind = OP_KINDS[code - 1];
  if (!kind) throw new Error(`모르는 운영 기록 종류: ${code}`);
  const head = { v, after: r.fixed(32), effectiveRound: r.u32() };
  switch (kind) {
    case "director-add":
      return {
        ...head,
        kind,
        credentialId: r.bytes(),
        pub: r.fixed(PUBLIC_KEY_LENGTH),
      };
    case "director-remove":
      return { ...head, kind, pub: r.fixed(PUBLIC_KEY_LENGTH) };
    case "affiliation-add":
      return { ...head, kind, fields: readFields(r) };
    case "affiliation-update":
      return { ...head, kind, target: r.fixed(32), fields: readFields(r) };
    case "affiliation-end":
    case "cancel":
      return { ...head, kind, target: r.fixed(32) };
    case "schedule":
      return { ...head, kind, entry: readScheduleEntry(r) };
  }
}

export function encodeOpBody(b: OpBody): Uint8Array {
  const w = new ByteWriter();
  writeBody(w, b);
  return w.done();
}

/** 운영 기록 id. 서명을 뺀 본문의 해시라 서명 모양만 바꾼 복제도 같은 id다 */
export function opId(b: OpBody): Uint8Array {
  return taggedHash("stardraw/op/v1", encodeOpBody(b));
}

/** 국장·관인이 서명하는 바이트 */
export function opMessage(b: OpBody): Uint8Array {
  return concat(
    utf8("stardraw/op-sig/v1"),
    new Uint8Array([0]),
    encodeOpBody(b),
  );
}

export function encodeOperation(op: Operation): Uint8Array {
  const w = new ByteWriter();
  writeBody(w, op);
  w.u8(op.signer.role === "seal" ? 1 : 2).fixed(
    op.signer.pub,
    PUBLIC_KEY_LENGTH,
  );
  if (op.signer.role === "seal") w.fixed(op.signer.signature, SIGNATURE_LENGTH);
  else writeSignature(w, op.signer.signature);
  return w.done();
}

export function decodeOperation(bytes: Uint8Array): Operation {
  const r = new ByteReader(bytes);
  const body = readBody(r);
  const role = r.u8();
  const pub = r.fixed(PUBLIC_KEY_LENGTH);
  let signer: OpSigner;
  if (role === 1)
    signer = { role: "seal", pub, signature: r.fixed(SIGNATURE_LENGTH) };
  else if (role === 2)
    signer = { role: "director", pub, signature: readSignature(r) };
  else throw new Error(`모르는 서명자: ${role}`);
  r.end();
  return { ...body, signer } as Operation;
}

/** 운영 기록 id 순(장부의 차례) */
export function sortOperations(ops: readonly Operation[]): Operation[] {
  return ops
    .map((op) => ({ op, id: opId(op) }))
    .sort((a, b) => compareBytes(a.id, b.id))
    .map(({ op }) => op);
}

// ── 서명 ──

/** 국장 패스키(또는 흉내 패스키)로 서명한다 */
export async function signAsDirector(
  body: OpBody,
  signer: EntrantSigner,
): Promise<Operation> {
  return {
    ...body,
    signer: {
      role: "director",
      pub: signer.publicKey,
      signature: await signer.sign(opMessage(body)),
    },
  } as Operation;
}

/** 관인(서버 서명 열쇠)으로 서명한다 */
export async function signAsSeal(
  body: OpBody,
  seal: Signer,
): Promise<Operation> {
  return {
    ...body,
    signer: {
      role: "seal",
      pub: seal.publicKey,
      signature: await seal.sign(opMessage(body)),
    },
  } as Operation;
}

export async function verifyOperationSignature(
  op: Operation,
  policy: WebAuthnPolicy = DEFAULT_WEBAUTHN_POLICY,
): Promise<boolean> {
  return op.signer.role === "seal"
    ? verifySignature(op.signer.pub, opMessage(op), op.signer.signature)
    : verifyEntrantSignature(
        op.signer.pub,
        opMessage(op),
        op.signer.signature,
        policy,
      );
}

// ── 국장 열쇠 지문 ──

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 국장 열쇠 지문 `국장-XXXX-XXXX-XXXX`: taggedHash("stardraw/director-fp/v1", pub) 앞 60비트를 Crockford base32 12자로.
 * 관리 화면·서버 시작 기록·검증 페이지에서 사람이 대조하는 보조 표시다. 판정은 늘 공개 열쇠 전체와 서명으로 한다
 */
export function directorFingerprint(pub: Uint8Array): string {
  const h = taggedHash("stardraw/director-fp/v1", pub);
  let bits = 0n;
  for (let i = 0; i < 8; i++) bits = (bits << 8n) | BigInt(h[i] ?? 0);
  bits >>= 4n; // 앞 60비트
  let out = "";
  for (let i = 11; i >= 0; i--)
    out += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)];
  return `국장-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

// ── 장부의 운영 상태 ──

export interface DirectorKey {
  pub: Uint8Array;
  credentialId: Uint8Array;
  /** 지정한 운영 기록 id(hex) */
  addedBy: string;
  /** 쓸 수 있는 첫 회차 */
  from: number;
  /** 빼기 효력 회차(이 회차부터 못 쓴다). 쓰는 중이면 null */
  until: number | null;
}

export type OpStatus = "pending" | "applied" | "cancelled";

export interface OpEntry {
  id: Uint8Array;
  op: Operation;
  /** 실린 회차 기록 */
  round: number;
  status: OpStatus;
  /** 취소가 실린 회차 */
  cancelledIn: number | null;
}

export interface AffiliationState {
  /** 소속 추가의 운영 기록 id */
  id: Uint8Array;
  fields: AffiliationFields;
  from: number;
  /** 끝내기 효력 회차. 이어지면 null */
  until: number | null;
}

/**
 * 장부를 처음부터 읽으며 쌓는 운영 상태. 검사기(verifyLedger)·서버·연습 장부가 같은 함수로 만든다.
 * 맵 대신 배열만 써서 structuredClone으로 복사할 수 있다(서버가 다음 기록을 미리 맞춰 볼 때)
 */
export interface OpsState {
  /** 처음 일정표에 일정 변경(옛 칸과 일정 바꾸기 운영 기록)을 반영한 일정표. 취소된 일정 바꾸기는 빠진다 */
  schedule: Schedule;
  /** 장부에 처음 실린 관인 열쇠. 관인 기록이 없으면 null */
  sealKey: Uint8Array | null;
  /** 실린 운영 기록(실린 차례) */
  ops: OpEntry[];
  directors: DirectorKey[];
  affiliations: AffiliationState[];
  /** 예고 중인 일정 바꾸기 운영 기록 id(hex) */
  pendingSchedule: string | null;
  /** 효력을 맞춘 마지막 회차 */
  matured: number;
}

/** 운영 기록 확인에 필요한 바깥 사실 */
export interface OpsContext {
  policy?: WebAuthnPolicy;
  /** 이 열쇠나 패스키 번호가 우주인으로 등록돼 있는지(국장·우주인 분리) */
  isEntrant(pub: Uint8Array, credentialId: Uint8Array | null): boolean;
}

export function newOpsState(genesis: Schedule): OpsState {
  return {
    schedule: genesis,
    sealKey: null,
    ops: [],
    directors: [],
    affiliations: [],
    pendingSchedule: null,
    matured: 0,
  };
}

export function cloneOpsState(state: OpsState): OpsState {
  return structuredClone(state);
}

const hex = toHex;

function find(state: OpsState, id: Uint8Array): OpEntry | undefined {
  return state.ops.find((e) => equalBytes(e.id, id));
}

/** 회차 round에 쓰는 중인 국장 열쇠 */
export function activeDirector(
  state: OpsState,
  pub: Uint8Array,
  round: number,
): DirectorKey | undefined {
  return state.directors.find(
    (d) =>
      equalBytes(d.pub, pub) &&
      d.from <= round &&
      (d.until === null || d.until > round),
  );
}

/** 국장으로 지정된 적 있는 열쇠·패스키 번호인지(예고 중·취소된 지정 포함). 우주인 등록을 막는다 */
export function everDirector(
  state: OpsState,
  pub: Uint8Array,
  credentialId: Uint8Array | null,
): boolean {
  return state.ops.some(
    (e) =>
      e.op.kind === "director-add" &&
      (equalBytes(e.op.pub, pub) ||
        (credentialId !== null && equalBytes(e.op.credentialId, credentialId))),
  );
}

/** 효력 회차가 된 운영 기록을 적용한다(그 회차 기록을 보기 전에) */
export function matureOps(state: OpsState, round: number): void {
  if (round <= state.matured) return;
  const due = state.ops
    .filter(
      (e) =>
        e.status === "pending" &&
        e.op.kind !== "cancel" &&
        e.op.effectiveRound <= round,
    )
    .sort((a, b) => a.op.effectiveRound - b.op.effectiveRound);
  for (const e of due) {
    e.status = "applied";
    const op = e.op;
    const E = op.effectiveRound;
    switch (op.kind) {
      case "director-add":
        state.directors.push({
          pub: op.pub,
          credentialId: op.credentialId,
          addedBy: hex(e.id),
          from: E,
          until: null,
        });
        break;
      case "director-remove":
        for (const d of state.directors)
          if (equalBytes(d.pub, op.pub) && d.until === null) d.until = E;
        break;
      case "affiliation-add":
        state.affiliations.push({
          id: e.id,
          fields: op.fields,
          from: E,
          until: null,
        });
        break;
      case "affiliation-update": {
        const a = state.affiliations.find((x) => equalBytes(x.id, op.target));
        if (a) a.fields = op.fields;
        break;
      }
      case "affiliation-end": {
        const a = state.affiliations.find((x) => equalBytes(x.id, op.target));
        if (a) a.until = E;
        break;
      }
      case "schedule":
        if (state.pendingSchedule === hex(e.id)) state.pendingSchedule = null;
        break;
    }
  }
  state.matured = round;
}

/** 예고 중인 일정 바꾸기가 있으면 그 줄을 뺀 일정표도 함께(그 줄이 취소돼도 24시간이 지켜지게) */
function scheduleVariants(state: OpsState): Schedule[] {
  if (!state.pendingSchedule) return [state.schedule];
  return [
    state.schedule,
    { ...state.schedule, entries: state.schedule.entries.slice(0, -1) },
  ];
}

/** 회차 round 기록에 실리는 운영 기록의 가장 이른 효력 회차(그 회차 마감 + 24시간 뒤에 열리는 첫 회차) */
export function earliestEffectiveRound(state: OpsState, round: number): number {
  let best = round + 1;
  for (const s of scheduleVariants(state)) {
    const t = roundTimes(s, round).closesAt + SCHEDULE_NOTICE;
    let r = roundAt(s, t) ?? round + 1;
    if (roundTimes(s, r).opensAt < t) r++;
    best = Math.max(best, r);
  }
  return best;
}

export function checkAffiliationFields(f: AffiliationFields): string | null {
  const name = checkLabel(f.name, "이름은");
  if (name) return name;
  const method = checkLabel(f.method, "확인 방법은");
  if (method) return method;
  if (!(f.badge in BADGES)) return "모르는 배지";
  if (f.issuerKey.length !== 0 && f.issuerKey.length !== PUBLIC_KEY_LENGTH)
    return "자격 열쇠는 비우거나 65바이트 공개 열쇠";
  if (!Number.isInteger(f.issued) || f.issued < 0 || f.issued > 0xffffffff)
    return "발급 수가 맞지 않는다";
  return null;
}

/** 별명과 같은 규칙: NFC로 맞춘 1~20자, 보이지 않는 글자 없음 */
function checkLabel(text: string, label: string): string | null {
  if (text.normalize("NFC").trim() !== text)
    return `${label} NFC로 맞추고 앞뒤 공백 없이`;
  const length = [...text].length;
  if (length < 1 || length > MAX_LABEL) return `${label} 1~${MAX_LABEL}자`;
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return `${label} 보이지 않는 글자가 있다`;
  return null;
}

/** 이 열쇠를 지정하는 운영 기록이 예고 중이거나 이미 쓰는 국장 열쇠인지 */
function directorTaken(state: OpsState, pub: Uint8Array): boolean {
  if (state.directors.some((d) => equalBytes(d.pub, pub) && d.until === null))
    return true;
  return state.ops.some(
    (e) =>
      e.status === "pending" &&
      e.op.kind === "director-add" &&
      equalBytes(e.op.pub, pub),
  );
}

function pendingOn(
  state: OpsState,
  kind: OpKind,
  match: (op: Operation) => boolean,
): boolean {
  return state.ops.some(
    (e) => e.status === "pending" && e.op.kind === kind && match(e.op),
  );
}

/**
 * 회차 round 기록(prev = 그 기록의 앞 기록 해시)에 이 운영 기록을 실어도 되는지. 문제가 없으면 null.
 * 상태는 바꾸지 않는다. 먼저 matureOps(state, round)를 불러 둔다
 */
export async function checkOperation(
  state: OpsState,
  op: Operation,
  round: number,
  prev: Uint8Array,
  ctx: OpsContext,
): Promise<string | null> {
  if (op.v !== OP_VERSION) return "모르는 운영 기록 판";
  if (!equalBytes(op.after, prev))
    return "다른 자리(장부 끝 해시)에서 서명한 운영 기록이다(예전 서명 재사용)";

  // 서명자: 국장 열쇠 지정·빼기는 관인이나 국장, 취소는 국장(관인은 자기가 한 지정만), 나머지는 국장
  const role = op.signer.role;
  if (role === "seal") {
    const sealAllowed =
      op.kind === "director-add" ||
      op.kind === "director-remove" ||
      op.kind === "cancel";
    if (!sealAllowed) return "관인은 이 운영 기록에 서명할 수 없다";
    if (state.sealKey && !equalBytes(state.sealKey, op.signer.pub))
      return "관인 열쇠가 장부에 처음 실린 관인과 다르다";
  } else if (!activeDirector(state, op.signer.pub, round)) {
    return "국장 열쇠가 아니다(장부에 지정돼 쓰는 중인 열쇠만 서명할 수 있다)";
  }
  if (!(await verifyOperationSignature(op, ctx.policy)))
    return "서명이 맞지 않는다";

  // 효력 회차: 24시간 예고와 회차 경계. 취소는 0
  if (op.kind === "cancel") {
    if (op.effectiveRound !== 0)
      return "예고 취소의 효력 회차는 0(실리는 즉시)";
  } else {
    const earliest = earliestEffectiveRound(state, round);
    if (op.effectiveRound < earliest)
      return `24시간 예고가 모자란다(효력은 ${earliest}회차부터 가능)`;
  }

  switch (op.kind) {
    case "director-add":
      if (
        op.credentialId.length < 1 ||
        op.credentialId.length > MAX_CREDENTIAL_ID
      )
        return "패스키 번호는 1~1023바이트";
      if (ctx.isEntrant(op.pub, op.credentialId))
        return "우주인으로 등록된 열쇠·패스키는 국장으로 지정할 수 없다";
      if (directorTaken(state, op.pub))
        return "이미 국장 열쇠이거나 지정 예고 중이다";
      return null;
    case "director-remove": {
      const using = state.directors.some(
        (d) => equalBytes(d.pub, op.pub) && d.until === null,
      );
      if (!using) return "쓰는 중인 국장 열쇠가 아니다";
      if (
        pendingOn(
          state,
          "director-remove",
          (o) => o.kind === "director-remove" && equalBytes(o.pub, op.pub),
        )
      )
        return "이미 빼기 예고 중이다";
      return null;
    }
    case "affiliation-add": {
      const problem = checkAffiliationFields(op.fields);
      if (problem) return problem;
      if (op.fields.issued !== 0) return "소속 추가의 발급 수는 0";
      return null;
    }
    case "affiliation-update":
    case "affiliation-end": {
      const a = state.affiliations.find((x) => equalBytes(x.id, op.target));
      if (!a || a.until !== null)
        return "효력이 생긴, 끝나지 않은 소속이 아니다";
      if (
        pendingOn(
          state,
          "affiliation-end",
          (o) =>
            o.kind === "affiliation-end" && equalBytes(o.target, op.target),
        )
      )
        return "끝내기 예고 중인 소속이다";
      return op.kind === "affiliation-update"
        ? checkAffiliationFields(op.fields)
        : null;
    }
    case "cancel": {
      const target = find(state, op.target);
      if (!target) return "장부에 실린 운영 기록이 아니다";
      if (target.op.kind === "cancel") return "예고 취소는 취소할 수 없다";
      if (target.status === "cancelled") return "이미 취소된 운영 기록이다";
      if (target.status !== "pending")
        return "이미 효력이 생긴 운영 기록은 취소할 수 없다";
      if (
        role === "seal" &&
        !(target.op.signer.role === "seal" && target.op.kind === "director-add")
      )
        return "관인은 자기가 서명한 국장 열쇠 지정만 취소할 수 있다";
      return null;
    }
    case "schedule": {
      if (op.effectiveRound !== op.entry.fromRound)
        return "일정 바꾸기의 효력 회차는 새 줄의 fromRound";
      if (state.pendingSchedule) return "이미 예고 중인 일정 바꾸기가 있다";
      const problem = checkScheduleChange(state.schedule, op.entry, round);
      return problem ? `일정 바꾸기: ${problem}` : null;
    }
  }
}

/** 확인을 통과한 운영 기록을 상태에 넣는다(취소는 바로 효력) */
export function acceptOperation(
  state: OpsState,
  op: Operation,
  round: number,
): void {
  const id = opId(op);
  if (op.signer.role === "seal" && !state.sealKey)
    state.sealKey = op.signer.pub;
  if (op.kind === "cancel") {
    state.ops.push({ id, op, round, status: "applied", cancelledIn: null });
    const target = find(state, op.target);
    if (!target) return;
    target.status = "cancelled";
    target.cancelledIn = round;
    if (
      target.op.kind === "schedule" &&
      state.pendingSchedule === hex(target.id)
    ) {
      // 예고 중인 일정 바꾸기는 늘 마지막 줄이다(한 번에 하나만 예고)
      state.schedule = {
        ...state.schedule,
        entries: state.schedule.entries.slice(0, -1),
      };
      state.pendingSchedule = null;
    }
    return;
  }
  state.ops.push({ id, op, round, status: "pending", cancelledIn: null });
  if (op.kind === "schedule") {
    state.schedule = withChange(state.schedule, op.entry);
    state.pendingSchedule = hex(id);
  }
}

/**
 * 회차 기록 하나의 일정 변경(옛 칸)과 운영 기록을 반영하고 문제 문장을 돌려준다(검사기).
 * 문제가 있는 운영 기록은 넣지 않는다. 일정 변경 문장은 "일정 변경:", 운영 기록 문장은 "운영 기록 <id>:"로 시작한다
 */
export async function applyRecordOps(
  state: OpsState,
  record: RoundRecord,
  ctx: OpsContext,
): Promise<string[]> {
  const problems: string[] = [];
  const round = record.round;
  matureOps(state, round);
  for (const change of record.scheduleChanges) {
    if (state.pendingSchedule) {
      problems.push(
        "일정 변경: 일정 바꾸기 예고 중에는 다른 일정 변경을 받지 않는다",
      );
      continue;
    }
    const problem = checkScheduleChange(state.schedule, change, round);
    if (problem) problems.push(`일정 변경: ${problem}`);
    else state.schedule = withChange(state.schedule, change);
  }
  const ops = record.operations ?? [];
  const ids = ops.map(opId);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as Operation;
    const id = ids[i] as Uint8Array;
    const label = `운영 기록 ${hex(id).slice(0, 12)}`;
    if (i > 0 && compareBytes(ids[i - 1] as Uint8Array, id) >= 0)
      problems.push(
        `${label}: 목록이 id 순서가 아니거나 같은 기록이 두 번 있다`,
      );
    if (find(state, id)) {
      problems.push(`${label}: 이미 실린 운영 기록이다`);
      continue;
    }
    const problem = await checkOperation(state, op, round, record.prev, ctx);
    if (problem) {
      problems.push(`${label}: ${problem}`);
      continue;
    }
    acceptOperation(state, op, round);
  }
  return problems;
}

/**
 * 서버·연습 장부: 다음 기록(회차 round, prev)에 실을 운영 기록을 고른다. 검사기와 같은 규칙으로 id 순서대로
 * 하나씩 맞춰 보고, 통과한 것만(id 순) 돌려준다. 상태는 바꾸지 않는다(복사본으로 본다)
 */
export async function selectOperations(
  state: OpsState,
  round: number,
  prev: Uint8Array,
  candidates: readonly Operation[],
  ctx: OpsContext,
  scheduleChanges: readonly ScheduleEntry[] = [],
): Promise<{
  accepted: Operation[];
  rejected: { op: Operation; problem: string }[];
}> {
  const s = cloneOpsState(state);
  matureOps(s, round);
  for (const change of scheduleChanges)
    if (!s.pendingSchedule && !checkScheduleChange(s.schedule, change, round))
      s.schedule = withChange(s.schedule, change);
  const accepted: Operation[] = [];
  const rejected: { op: Operation; problem: string }[] = [];
  const seen = new Set<string>();
  for (const op of sortOperations(candidates)) {
    const id = hex(opId(op));
    if (seen.has(id) || find(s, opId(op))) {
      rejected.push({ op, problem: "이미 받은 운영 기록이다" });
      continue;
    }
    const problem = await checkOperation(s, op, round, prev, ctx);
    if (problem) {
      rejected.push({ op, problem });
      continue;
    }
    seen.add(id);
    acceptOperation(s, op, round);
    accepted.push(op);
  }
  return { accepted, rejected };
}

/**
 * 서버 설정의 국장 열쇠(`STARDRAW_DIRECTOR_KEYS`)를 장부에 맞춘다: 장부에 없는 열쇠는 관인 "국장 열쇠 지정"을,
 * 설정에서 빠졌는데 관인 지정이 아직 예고 중이면 관인 "예고 취소"를 만든다(서명 전 본문).
 * 지정이 취소된 적 있는 열쇠, 우주인으로 등록된 열쇠는 다시 싣지 않고 skipped로 알린다
 */
export function sealDesignations(
  state: OpsState,
  round: number,
  prev: Uint8Array,
  desired: readonly { credentialId: Uint8Array; pub: Uint8Array }[],
  ctx: OpsContext,
): { bodies: OpBody[]; skipped: { pub: Uint8Array; reason: string }[] } {
  const s = cloneOpsState(state);
  matureOps(s, round);
  const effectiveRound = earliestEffectiveRound(s, round);
  const bodies: OpBody[] = [];
  const skipped: { pub: Uint8Array; reason: string }[] = [];
  for (const key of desired) {
    if (directorTaken(s, key.pub)) continue;
    const cancelled = s.ops.some(
      (e) =>
        e.op.kind === "director-add" &&
        equalBytes(e.op.pub, key.pub) &&
        e.status === "cancelled",
    );
    if (cancelled) {
      skipped.push({ pub: key.pub, reason: "지정이 취소된 적 있는 열쇠" });
      continue;
    }
    if (ctx.isEntrant(key.pub, key.credentialId)) {
      skipped.push({ pub: key.pub, reason: "우주인으로 등록된 열쇠" });
      continue;
    }
    bodies.push({
      v: OP_VERSION,
      kind: "director-add",
      after: prev,
      effectiveRound,
      credentialId: key.credentialId,
      pub: key.pub,
    });
  }
  for (const e of s.ops) {
    if (
      e.status !== "pending" ||
      e.op.kind !== "director-add" ||
      e.op.signer.role !== "seal"
    )
      continue;
    const pub = e.op.pub;
    if (desired.some((k) => equalBytes(k.pub, pub))) continue;
    bodies.push({
      v: OP_VERSION,
      kind: "cancel",
      after: prev,
      effectiveRound: 0,
      target: e.id,
    });
  }
  return { bodies, skipped };
}

// ── 사람이 읽는 모양(관리 화면·검증 페이지·서버 API) ──

export interface OperationView {
  id: string;
  kind: OpKind;
  /** 실린 회차 */
  round: number;
  effectiveRound: number;
  /** 효력 회차가 열리는 시각(초). 취소는 실린 회차 마감 */
  effectiveAt: number;
  status: OpStatus;
  cancelledIn: number | null;
  signer: "seal" | "director";
  /** 서명한 열쇠의 지문(관인은 "관인") */
  signedBy: string;
  summary: string;
  /** 대상 운영 기록·소속 id(취소·소속 바꾸기·끝내기) */
  target: string | null;
}

export interface DirectorView {
  pub: string;
  credentialId: string;
  fingerprint: string;
  from: number;
  until: number | null;
}

export interface AffiliationView {
  id: string;
  name: string;
  badge: Badge;
  badgeName: string;
  method: string;
  issuerKey: string | null;
  issued: number;
  from: number;
  until: number | null;
}

export interface OperationsView {
  sealKey: string | null;
  /** 다음에 닫히는 기록 */
  next: {
    round: number;
    /** 서명할 때 넣을 장부 끝 해시(hex) */
    after: string;
    earliestEffectiveRound: number;
    earliestEffectiveAt: number;
  };
  /** 지정이 효력을 얻은 국장 열쇠(빠진 것 포함) */
  directors: DirectorView[];
  operations: OperationView[];
  affiliations: AffiliationView[];
  /** 예고 중인 일정 바꾸기가 있는지 */
  schedulePending: boolean;
}

function describe(state: OpsState, op: Operation): string {
  switch (op.kind) {
    case "director-add":
      return `국장 열쇠 지정 ${directorFingerprint(op.pub)}`;
    case "director-remove":
      return `국장 열쇠 빼기 ${directorFingerprint(op.pub)}`;
    case "affiliation-add":
      return `소속 추가: ${op.fields.name}(${BADGES[op.fields.badge]})`;
    case "affiliation-update":
      return `소속 바꾸기: ${op.fields.name}(${BADGES[op.fields.badge]})`;
    case "affiliation-end": {
      const a = state.affiliations.find((x) => equalBytes(x.id, op.target));
      return `소속 끝내기: ${a?.fields.name ?? hex(op.target).slice(0, 12)}`;
    }
    case "cancel": {
      const t = find(state, op.target);
      return `예고 취소: ${t ? describe(state, t.op) : hex(op.target).slice(0, 12)}`;
    }
    case "schedule": {
      const e = op.entry;
      const phase =
        e.phase === "live" ? "정식 " : e.phase === "trial" ? "시험 " : "";
      return `일정 바꾸기: ${e.fromRound}회차부터 ${phase}${e.length / 60}분 회차`;
    }
  }
}

/**
 * 관리 화면이 쓰는 모양. records = 닫힌 기록 수, head = 장부 끝 해시.
 * 다음 기록(records + 1)을 기준으로 효력·취소 가능을 판단한다
 */
export function operationsView(
  state: OpsState,
  records: number,
  head: Uint8Array,
): OperationsView {
  const next = records + 1;
  const s = cloneOpsState(state);
  matureOps(s, next);
  const earliest = earliestEffectiveRound(s, next);
  const opensAt = (r: number) => roundTimes(s.schedule, r).opensAt;
  return {
    sealKey: s.sealKey ? toBase64Url(s.sealKey) : null,
    next: {
      round: next,
      after: hex(head),
      earliestEffectiveRound: earliest,
      earliestEffectiveAt: opensAt(earliest),
    },
    directors: s.directors.map((d) => ({
      pub: toBase64Url(d.pub),
      credentialId: toBase64Url(d.credentialId),
      fingerprint: directorFingerprint(d.pub),
      from: d.from,
      until: d.until,
    })),
    operations: s.ops.map((e) => ({
      id: hex(e.id),
      kind: e.op.kind,
      round: e.round,
      effectiveRound: e.op.effectiveRound,
      effectiveAt:
        e.op.kind === "cancel"
          ? roundTimes(s.schedule, e.round).closesAt
          : opensAt(e.op.effectiveRound),
      status: e.status,
      cancelledIn: e.cancelledIn,
      signer: e.op.signer.role,
      signedBy:
        e.op.signer.role === "seal"
          ? "관인"
          : directorFingerprint(e.op.signer.pub),
      summary: describe(s, e.op),
      target: "target" in e.op ? hex(e.op.target) : null,
    })),
    affiliations: s.affiliations.map((a) => ({
      id: hex(a.id),
      name: a.fields.name,
      badge: a.fields.badge,
      badgeName: BADGES[a.fields.badge],
      method: a.fields.method,
      issuerKey:
        a.fields.issuerKey.length > 0 ? toBase64Url(a.fields.issuerKey) : null,
      issued: a.fields.issued,
      from: a.from,
      until: a.until,
    })),
    schedulePending: s.pendingSchedule !== null,
  };
}

export interface DirectorHistoryLine {
  round: number;
  action: "지정" | "빼기";
  fingerprint: string;
  signedBy: string;
  effectiveRound: number;
  status: OpStatus;
  cancelledIn: number | null;
}

/**
 * 국장 열쇠 내력: 언제(실린 회차), 어느 열쇠(지문)가, 누구 서명(관인·국장)으로 지정·빼기됐고 취소됐는지.
 * 검증 페이지와 터미널 검사기가 보여 준다. 서버 설정으로 몰래 바꿔도 여기에 드러난다(docs/36 11-12 D2)
 */
export function directorHistory(state: OpsState): DirectorHistoryLine[] {
  return state.ops.flatMap((e) =>
    e.op.kind === "director-add" || e.op.kind === "director-remove"
      ? [
          {
            round: e.round,
            action:
              e.op.kind === "director-add"
                ? ("지정" as const)
                : ("빼기" as const),
            fingerprint: directorFingerprint(e.op.pub),
            signedBy:
              e.op.signer.role === "seal"
                ? "관인"
                : directorFingerprint(e.op.signer.pub),
            effectiveRound: e.op.effectiveRound,
            status: e.status,
            cancelledIn: e.cancelledIn,
          },
        ]
      : [],
  );
}

/** 설정 값 한 줄 `<패스키 번호 base64url>.<공개 열쇠 base64url>`(관리 화면이 보여 주고 서버가 읽는다) */
export function directorKeyConfig(
  credentialId: Uint8Array,
  pub: Uint8Array,
): string {
  return `${toBase64Url(credentialId)}.${toBase64Url(pub)}`;
}

/** 설정 값(쉼표로 여럿)을 읽는다. 모양이 틀리면 오류 */
export function parseDirectorKeys(
  text: string,
): { credentialId: Uint8Array; pub: Uint8Array }[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [cred, pub, extra] = item.split(".");
      if (!cred || !pub || extra !== undefined)
        throw new Error(`국장 열쇠 설정 모양이 아니다: ${item.slice(0, 16)}…`);
      const credentialId = fromBase64Url(cred);
      const key = fromBase64Url(pub);
      if (key.length !== PUBLIC_KEY_LENGTH || key[0] !== 4)
        throw new Error("국장 공개 열쇠는 압축하지 않은 65바이트(04로 시작)");
      if (credentialId.length < 1 || credentialId.length > MAX_CREDENTIAL_ID)
        throw new Error("국장 패스키 번호는 1~1023바이트");
      return { credentialId, pub: key };
    });
}

/**
 * 닫힌 기록들로 지금 일정표를 빠르게 맞춘다(서명은 보지 않는다): 옛 일정 변경 칸과 일정 바꾸기 운영 기록을 더하고,
 * 취소된 일정 바꾸기는 뺀다. 화면·서버가 회차 시각을 계산할 때 쓴다. 규칙 확인은 verifyLedger가 한다
 */
export function scheduleFromRecords(
  genesis: Schedule,
  records: readonly RoundRecord[],
): Schedule {
  let schedule = genesis;
  const scheduleOps = new Set<string>();
  for (const record of records) {
    for (const change of record.scheduleChanges)
      schedule = withChange(schedule, change);
    for (const op of record.operations ?? []) {
      if (op.kind === "schedule") {
        schedule = withChange(schedule, op.entry);
        scheduleOps.add(hex(opId(op)));
      } else if (op.kind === "cancel" && scheduleOps.has(hex(op.target))) {
        schedule = { ...schedule, entries: schedule.entries.slice(0, -1) };
        scheduleOps.delete(hex(op.target));
      }
    }
  }
  return schedule;
}
