import type {
  KeyRegistration,
  PowParams,
  RoundRecord,
  Schedule,
  Ticket,
  VerifyReport,
} from "@mighty/stardraw-core";

import type { LedgerStatus } from "./local-ledger";

/**
 * 화면이 쓰는 장부. 기기 안 연습 장부(`LocalLedger`)와 서버 장부(`RemoteLedger`)가 같은 모양이다.
 * 읽기(`status`·`record`·`closed`)는 동기로, 가져온 내용을 들고 있다가 `settle()` 때 새로 맞춘다.
 */
export interface Ledger {
  /** 처음 일정표(서버 장부는 첫 `settle()` 뒤에 정해진다) */
  readonly schedule: Schedule;
  /** 응모·등록 작업 증명 세기(연습은 가볍게, 서버는 규칙의 16MB) */
  readonly powParams: PowParams;
  /** 지금 시각(초, 장부 기준) */
  now(): number;
  /** 다음 회차 문제 값 */
  head(): Uint8Array;
  /** 지난 회차를 맞춘다(연습은 추첨, 서버는 받아 오기) */
  settle(): Promise<void>;
  status(): LedgerStatus;
  isRegistered(pub: Uint8Array): boolean | Promise<boolean>;
  /** 패스키 번호로 장부에 등록된 공개 열쇠를 찾는다(다른 기기에서 내 패스키 찾기) */
  passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null>;
  submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }>;
  closed(): { record: RoundRecord; tickets: readonly Ticket[] }[];
  record(round: number): RoundRecord | undefined;
  ticketsOf(round: number): readonly Ticket[];
  /** 장부 전체를 처음부터 다시 계산한다 */
  verify(mine?: readonly Uint8Array[]): Promise<VerifyReport>;
}
