import { defineConfig } from "vitest/config";
import path from "node:path";

// firebase emulators:exec 안에서 실행한다 (npm run test:emulator)
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      GCLOUD_PROJECT: "demo-careos",
      STORE: "firestore",
      FEATURE_FLAGS: "",
      // emulators:exec 가 넣어 주지만, 이미 띄운 에뮬레이터에 직접 돌릴 때를 위한 기본값
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
    },
  },
});
