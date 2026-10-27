import { loadRistretto255 } from "./ristretto";
import { GROUP_1024, type SraGroup } from "./sra";

/** 계산 시험을 돌릴 군: 예전 방의 곱셈군과 기본인 ristretto255 */
export const TEST_GROUPS: [string, SraGroup][] = [
  ["1024", GROUP_1024],
  ["r255", await loadRistretto255()],
];
