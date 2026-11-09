// 서버 전용 문서 저장소. 운영은 Firestore(firestoreStore.ts), 로컬·테스트는 같은 인터페이스의 파일/메모리 구현을 쓴다.
// 조회 조건은 Firestore 쿼리로 바로 옮길 수 있는 형태([필드, 연산자, 값])로만 받는다.
// 파일 저장소는 단일 서버 프로세스 전제다. 운영에서는 쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { FirestoreStore } from "./firestoreStore";

export type Doc = Record<string, unknown>;
export type WithId<T> = T & { id: string };

export type Op = "==" | "in" | "array-contains" | "<" | "<=" | ">" | ">=";
export type Where = [field: string, op: Op, value: unknown];

export interface DocStore {
  get<T extends Doc>(col: string, id: string): Promise<T | null>;
  set<T extends Doc>(col: string, id: string, data: T): Promise<void>;
  setMany<T extends Doc>(col: string, entries: [string, T][]): Promise<void>;
  delete(col: string, id: string): Promise<void>;
  list<T extends Doc>(col: string, where?: Where[]): Promise<WithId<T>[]>;
  /** 숫자 필드를 원자적으로 더하고 새 값을 돌려준다. 문서가 없으면 extra 와 함께 만든다. */
  increment(col: string, id: string, field: string, by: number, extra?: Doc): Promise<number>;
}

/** 메모리 저장소와 테스트가 쓰는 조건 판정 (Firestore 의미와 같게) */
export function matches(doc: Doc, where: Where[]): boolean {
  return where.every(([field, op, value]) => {
    const v = doc[field] ?? null;
    switch (op) {
      case "==":
        return v === value;
      case "in":
        return (value as unknown[]).includes(v);
      case "array-contains":
        return Array.isArray(v) && v.includes(value);
      case "<":
        return v !== null && (v as never) < (value as never);
      case "<=":
        return v !== null && (v as never) <= (value as never);
      case ">":
        return v !== null && (v as never) > (value as never);
      case ">=":
        return v !== null && (v as never) >= (value as never);
    }
  });
}

class JsonStore implements DocStore {
  private cols = new Map<string, Map<string, Doc>>();
  constructor(private dir: string | null) {}

  private load(col: string): Map<string, Doc> {
    let m = this.cols.get(col);
    if (m) return m;
    m = new Map();
    if (this.dir) {
      const file = path.join(this.dir, `${col}.json`);
      if (fs.existsSync(file)) {
        for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) m.set(id, v as Doc);
      }
    }
    this.cols.set(col, m);
    return m;
  }

  private flush(col: string) {
    if (!this.dir) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `${col}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.load(col))));
    fs.renameSync(tmp, file);
  }

  async get<T extends Doc>(col: string, id: string) {
    const v = this.load(col).get(id);
    return v ? (structuredClone(v) as T) : null;
  }
  async set<T extends Doc>(col: string, id: string, data: T) {
    this.load(col).set(id, structuredClone(data));
    this.flush(col);
  }
  async setMany<T extends Doc>(col: string, entries: [string, T][]) {
    const m = this.load(col);
    for (const [id, data] of entries) m.set(id, structuredClone(data));
    this.flush(col);
  }
  async delete(col: string, id: string) {
    if (this.load(col).delete(id)) this.flush(col);
  }
  async list<T extends Doc>(col: string, where: Where[] = []) {
    const out: WithId<T>[] = [];
    for (const [id, v] of this.load(col)) {
      if (matches(v, where)) out.push({ ...(structuredClone(v) as T), id });
    }
    return out;
  }
  async increment(col: string, id: string, field: string, by: number, extra: Doc = {}) {
    const m = this.load(col);
    const cur = m.get(id) ?? { ...extra };
    const next = Number(cur[field] ?? 0) + by;
    m.set(id, { ...cur, [field]: next });
    this.flush(col);
    return next;
  }
}

// 개발 서버의 모듈 재로딩에도 같은 인스턴스를 쓰도록 globalThis 에 둔다
const g = globalThis as unknown as { __careosStore?: DocStore };

/** Functions(에뮬레이터 포함) 안이거나 STORE=firestore 면 Firestore, 아니면 파일·메모리(DATA_DIR, 기본 .data/) */
export const useFirestore = () =>
  process.env.STORE === "firestore" ||
  (process.env.STORE !== "file" && Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.FUNCTIONS_EMULATOR));

export function store(): DocStore {
  if (!g.__careosStore) {
    if (useFirestore()) {
      g.__careosStore = new FirestoreStore();
    } else {
      const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
      g.__careosStore = new JsonStore(dir === ":memory:" ? null : dir);
    }
  }
  return g.__careosStore;
}

/** 테스트용: 빈 메모리 저장소로 바꾸거나, 주어진 저장소를 쓴다 */
export function resetStoreForTests(s?: DocStore) {
  g.__careosStore = s ?? new JsonStore(null);
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
