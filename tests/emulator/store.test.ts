// 같은 저장소 계약을 메모리 구현과 Firestore(에뮬레이터) 구현에 똑같이 돌린다
import { beforeAll, describe, expect, it } from "vitest";
import { FirestoreStore } from "@/lib/server/firestoreStore";
import { resetStoreForTests, store, type DocStore } from "@/lib/server/store";

async function clear() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/demo-careos/databases/(default)/documents`, { method: "DELETE" });
}

const impls: [string, () => DocStore][] = [
  ["memory", () => (resetStoreForTests(), store())],
  ["firestore", () => new FirestoreStore()],
];

describe.each(impls)("DocStore 계약 (%s)", (_name, make) => {
  let s: DocStore;
  beforeAll(async () => {
    await clear();
    s = make();
    await s.setMany("t_items", [
      ["a", { uid: "u1", status: "active", n: 1, tags: ["x"], at: "2026-11-01", gone: null }],
      ["b", { uid: "u1", status: "cancelled", n: 2, tags: ["y"], at: "2026-11-02", gone: null }],
      ["c", { uid: "u2", status: "active", n: 3, tags: ["x", "y"], at: "2026-11-03", gone: "2026" }],
    ]);
  });

  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

  it("get / set / delete", async () => {
    expect(await s.get("t_items", "a")).toMatchObject({ uid: "u1", n: 1 });
    await s.set("t_tmp", "z", { v: 1 });
    expect(await s.get("t_tmp", "z")).toEqual({ v: 1 });
    await s.delete("t_tmp", "z");
    expect(await s.get("t_tmp", "z")).toBeNull();
  });

  it("== · in · array-contains · 범위 · null 조건이 Firestore 와 같은 결과", async () => {
    expect(ids(await s.list("t_items", [["uid", "==", "u1"], ["status", "==", "active"]]))).toEqual(["a"]);
    expect(ids(await s.list("t_items", [["status", "in", ["active", "cancelled"]]]))).toEqual(["a", "b", "c"]);
    expect(ids(await s.list("t_items", [["tags", "array-contains", "y"]]))).toEqual(["b", "c"]);
    expect(ids(await s.list("t_items", [["at", ">=", "2026-11-02"], ["at", "<", "2026-11-03~"]]))).toEqual(["b", "c"]);
    expect(ids(await s.list("t_items", [["gone", "==", null], ["at", "<=", "2026-11-02"]]))).toEqual(["a", "b"]);
  });

  it("increment 는 문서가 없으면 만들고 새 값을 돌려준다", async () => {
    expect(await s.increment("t_counter", "k", "n", 1, { kind: "x" })).toBe(1);
    expect(await s.increment("t_counter", "k", "n", 2)).toBe(3);
    expect(await s.get("t_counter", "k")).toMatchObject({ kind: "x", n: 3 });
  });
});
