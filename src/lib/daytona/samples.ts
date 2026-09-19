// Preloaded SAMPLE opportunities so the demo UI is never empty.
// These are generic illustrative examples — NOT verified live listings.
import type { Opportunity } from "./types";

export const SAMPLE_OPPORTUNITIES: Opportunity[] = [
  {
    id: "sample-seoul-ai-startup",
    title: "Seoul AI Startup Support Program (샘플)",
    category: "정부지원사업",
    deadline: "상시 / 공고 확인 필요",
    organizer: "Seoul Startup Agency (예시)",
    location: "서울",
    matchScore: 92,
    why: "서울 소재 AI 스타트업 대상 R&D·사업화 지원 프로그램 예시. XrisP의 위치·업종·기업 규모 요건과 일치합니다.",
    url: "https://www.k-startup.go.kr/",
    sample: true,
  },
  {
    id: "sample-ai-impact-challenge",
    title: "AI Impact / AI for Good Challenge (샘플)",
    category: "공모전",
    deadline: "연간 공모 / 일정 확인 필요",
    organizer: "Global AI Impact Foundation (예시)",
    location: "온라인 / 글로벌",
    matchScore: 84,
    why: "사회적 임팩트를 만드는 AI 솔루션 공모전 예시. 교육·콘텐츠 분야 AI 프로덕트와 주제 적합도가 높습니다.",
    url: "https://ai.google/responsibility/social-good/",
    sample: true,
  },
  {
    id: "sample-global-ai-hackathon",
    title: "Global AI Builder Hackathon (샘플)",
    category: "해커톤",
    deadline: "라운드별 상시 / 일정 확인 필요",
    organizer: "Global Builder Community (예시)",
    location: "온라인",
    matchScore: 78,
    why: "AI 에이전트 프로토타입을 빠르게 검증할 수 있는 해커톤 예시. 팀 단위 참가 요건을 충족합니다.",
    url: "https://devpost.com/hackathons",
    sample: true,
  },
];
