import type { Metadata } from "next";

import { LearnPage } from "@/components/learn/LearnPage";

export const metadata: Metadata = {
  title: "보안 배우기",
  description:
    "서버 없는 카드 게임이 엿보기·섞기 조작·거짓말을 어떻게 막고 잡는지, 13단원 체험과 퀴즈로 배운다",
};

export default function Learn() {
  return <LearnPage />;
}
