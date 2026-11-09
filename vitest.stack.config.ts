import { defineConfig } from "vitest/config";
import path from "node:path";

// npm run test:stack — Functions·Auth·Firestore 에뮬레이터를 띄운 상태에서 HTTP 로 확인한다
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/emulator-stack/**/*.test.ts"], testTimeout: 60_000, fileParallelism: false },
});
