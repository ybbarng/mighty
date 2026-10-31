import {
  fromBase64Url,
  fromHex,
  judgeRound,
  newOpsState,
  type QualInfo,
  type Rank,
  type Schedule,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";

/**
 * 당첨 응모권 한 장의 소속 표시(2026-10-31 보안 검토 B1). 규칙 패키지 judgeRound로 도장·자격 서명·기간·소속을
 * 모두 확인한다(같은 회차에 같은 증서가 두 장 이상이면 둘 다 빠진다). 예전 화면은 증서가 붙었는지와 중복만 봐서,
 * 증서 없는 응모권이나 남의 증서를 몰래 쓴 응모권도 초록불로 보였다
 */
export type QualMark =
  | { kind: "yes"; affiliation: string }
  /** 같은 증서가 이 회차에 두 장 이상 */
  | { kind: "dup"; affiliation: string }
  /** 증서를 붙이지 않은 응모권 */
  | { kind: "none" }
  /** 증서가 있지만 이 회차에 쓸 수 없다(기간 밖·도장이나 서명이 틀림) */
  | { kind: "invalid" };

/** 장부가 내준 기간 정보로 judgeRound가 읽는 운영 상태(기간·소속만)를 만든다 */
function opsFrom(schedule: Schedule, info: QualInfo) {
  const state = newOpsState(schedule);
  for (const p of info.periods) {
    state.periods.push({
      id: fromHex(p.id),
      affiliation: fromHex(p.affiliation),
      number: p.number,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      issuerKey: fromBase64Url(p.issuerKey),
      from: p.from,
      issued: p.issued,
    });
    if (!state.affiliations.some((a) => toHex(a.id) === p.affiliation))
      state.affiliations.push({
        id: fromHex(p.affiliation),
        fields: {
          name: p.affiliationName,
          badge: p.badge,
          method: p.method,
          issuerKey: new Uint8Array(0),
          issued: 0,
        },
        from: 0,
        until: null,
      });
  }
  return state;
}

/** 회차 하나의 판정: 응모권 id(hex) → 소속 표시 */
export function qualMarks(
  schedule: Schedule,
  info: QualInfo,
  round: number,
  closesAt: number,
  tickets: readonly Ticket[],
): Map<string, QualMark> {
  const ids = tickets.map((t) => ticketId(t));
  const none: Record<Rank, Uint8Array[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  const { results } = judgeRound(
    opsFrom(schedule, info),
    round,
    closesAt,
    tickets,
    ids,
    none,
  );
  const marks = new Map<string, QualMark>();
  for (const [k, t] of tickets.entries()) {
    const id = toHex(ids[k] as Uint8Array);
    if (!t.qual) {
      marks.set(id, { kind: "none" });
      continue;
    }
    const period = toHex(t.qual.cert.periodId);
    const r = results.find((x) => x.period === period);
    if (r?.eligible.some((e) => toHex(e) === id)) {
      marks.set(id, { kind: "yes", affiliation: r.affiliationName });
      continue;
    }
    // 도장·서명이 맞는데 빠졌으면 중복, 아니면 쓸 수 없는 증서
    const sameCert = tickets.filter(
      (o) =>
        o.qual &&
        toHex(o.qual.cert.periodId) === period &&
        toHex(o.qual.cert.qualPub) ===
          toHex(t.qual?.cert.qualPub ?? new Uint8Array()),
    ).length;
    marks.set(
      id,
      r && sameCert > 1
        ? { kind: "dup", affiliation: r.affiliationName }
        : { kind: "invalid" },
    );
  }
  return marks;
}

/** 화면에 보일 한 줄 */
export function qualMarkText(m: QualMark): string {
  switch (m.kind) {
    case "yes":
      return `소속 표시: 있음(${m.affiliation})`;
    case "dup":
      return `소속 표시: 없음(같은 ${m.affiliation} 증서로 낸 응모권이 둘 이상)`;
    case "none":
      return "소속 표시: 없음(증서를 붙이지 않은 응모권)";
    case "invalid":
      return "소속 표시: 없음(이 회차에 쓸 수 없는 증서)";
  }
}
