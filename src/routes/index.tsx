import { createFileRoute } from "@tanstack/react-router";
import { ContextChat } from "@/components/keyp/ContextChat";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "KeyP — 새 정보가 생길 때만 알려드려요" },
      { name: "description", content: "찾고 싶은 내용을 한 문장으로 등록하면, KeyP가 공개 웹과 소스를 계속 확인해 새 정보가 생길 때만 알려드립니다." },
      { property: "og:title", content: "KeyP — 새 정보가 생길 때만 알려드려요" },
      { property: "og:description", content: "한 문장으로 등록하고, 가장 가까운 정보와 이후 새 알림만 받아보세요." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://keyp.info/" },
      { property: "og:image", content: "https://keyp.info/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://keyp.info/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://keyp.info/" }],
  }),
  component: ContextChat,
});
