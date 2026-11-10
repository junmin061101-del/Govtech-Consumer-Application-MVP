import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// 홈 화면에 설치하면 앱처럼 열리고, 아이콘을 길게 누르면 'AI 상담' 바로가기가 나온다
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareOS 돌봄지도",
    short_name: "CareOS",
    description: "우리 동네 어린이집·유치원·돌봄센터 찾기와 AI 상담",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "ko",
    background_color: "#fafaf9",
    theme_color: "#059669",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "AI 상담", short_name: "AI 상담", url: "/agent", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "지도", url: "/" },
    ],
  };
}
