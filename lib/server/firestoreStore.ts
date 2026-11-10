// DocStore 의 Firestore 구현. 컬렉션·문서 ID·필드는 메모리 구현과 같다.
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { Doc, DocStore, WithId, Where } from "./store";

const BATCH = 400;

export class FirestoreStore implements DocStore {
  private db = adminDb();

  async get<T extends Doc>(col: string, id: string) {
    const snap = await this.db.collection(col).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async set<T extends Doc>(col: string, id: string, data: T) {
    await this.db.collection(col).doc(id).set(data);
  }

  async setMany<T extends Doc>(col: string, entries: [string, T][]) {
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = this.db.batch();
      for (const [id, data] of entries.slice(i, i + BATCH)) batch.set(this.db.collection(col).doc(id), data);
      await batch.commit();
    }
  }

  async delete(col: string, id: string) {
    await this.db.collection(col).doc(id).delete();
  }

  async list<T extends Doc>(col: string, where: Where[] = []) {
    let q: FirebaseFirestore.Query = this.db.collection(col);
    for (const [field, op, value] of where) q = q.where(field, op, value);
    const snap = await q.get();
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }) as WithId<T>);
  }

  async increment(col: string, id: string, field: string, by: number, extra: Doc = {}) {
    const ref = this.db.collection(col).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = Number(snap.get(field) ?? 0) + by;
      if (snap.exists) tx.update(ref, { [field]: FieldValue.increment(by) });
      else tx.set(ref, { ...extra, [field]: next });
      return next;
    });
  }
}
