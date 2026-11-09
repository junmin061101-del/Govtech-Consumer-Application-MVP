import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // 에뮬레이터가 필요한 테스트는 npm run test:emulator / test:stack 으로 따로 돌린다
    exclude: ["tests/emulator/**", "tests/emulator-stack/**", "node_modules/**"],
    // 테스트는 파일을 쓰지 않는 메모리 저장소로 돌린다
    env: { DATA_DIR: ":memory:", FEATURE_FLAGS: "" },
  },
});
