/**
 * 추첨보다 정답이 먼저 보이지 않게: 내가 응모한 회차의 결과가 나왔는데 이 기기에서 아직 그 추첨을 열어 보지 않았으면
 * 그 회차의 당첨 번호·보너스·내 등수·당첨 수를 어디서도 보이지 않는다(영수증까지). 가린 자리에는 「추첨 보기」만 둔다.
 * 열어 봄 기록은 추첨 화면을 여는 순간 남는다(wallet.markOpened). 다른 기기에서는 기록이 없으니 가려진다.
 * 내가 응모하지 않은 회차는 그대로 보인다. 모든 화면이 이 판정 하나만 쓴다
 */
export function isSealedForMe(
  round: number,
  myRounds: ReadonlySet<number>,
  opened: ReadonlySet<number>,
  hasRecord: boolean,
): boolean {
  return hasRecord && myRounds.has(round) && !opened.has(round);
}

/** 회차 → 가렸는지. 화면에 넘기는 판정 함수 */
export type Sealed = (round: number) => boolean;

/** 이 기기의 응모권·열어 본 회차·장부로 판정 함수를 만든다 */
export function sealedFor(
  mine: readonly { ticket: { round: number } }[],
  opened: ReadonlySet<number>,
  ledger: { record(round: number): unknown },
): Sealed {
  const myRounds = new Set(mine.map((m) => m.ticket.round));
  return (round) =>
    isSealedForMe(round, myRounds, opened, ledger.record(round) !== undefined);
}

/** 가리지 않는다(데모 둘러보기처럼 결과를 보여 주려고 만든 화면) */
export const NOTHING_SEALED: Sealed = () => false;
