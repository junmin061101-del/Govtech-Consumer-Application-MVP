import type { NextConfig } from "next";

// 배포는 정적 내보내기(out/) → Firebase Hosting. /api/** 는 Hosting 이 Functions api 로 넘긴다(firebase.json).
// 개발 서버(next dev)에서는 /api 를 Functions 에뮬레이터로 넘긴다.
const FUNCTIONS_EMULATOR =
  process.env.FUNCTIONS_EMULATOR_URL ?? `http://127.0.0.1:5001/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-careos"}/asia-northeast3/api`;

const isDev = process.env.NODE_ENV === "development";

const AUTH_EMULATOR = "http://127.0.0.1:9099";

const nextConfig: NextConfig = isDev
  ? {
      // Codespaces 등 포워딩 주소에서 개발 서버를 열 때
      allowedDevOrigins: ["*.app.github.dev"],
      async rewrites() {
        return [
          { source: "/api/:path*", destination: `${FUNCTIONS_EMULATOR}/api/:path*` },
          // NEXT_PUBLIC_AUTH_EMULATOR_URL=same-origin 일 때 Auth 에뮬레이터 중계
          { source: "/identitytoolkit.googleapis.com/:path*", destination: `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/:path*` },
          { source: "/securetoken.googleapis.com/:path*", destination: `${AUTH_EMULATOR}/securetoken.googleapis.com/:path*` },
          { source: "/emulator/:path*", destination: `${AUTH_EMULATOR}/emulator/:path*` },
        ];
      },
    }
  : { output: "export", images: { unoptimized: true } };

export default nextConfig;
