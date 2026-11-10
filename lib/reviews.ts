import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const REVIEW_TAGS = [
  { id: "kind", label: "선생님이 친절해요" },
  { id: "clean", label: "시설이 깨끗해요" },
  { id: "food", label: "급식·간식이 좋아요" },
  { id: "program", label: "프로그램이 다양해요" },
  { id: "flex", label: "시간 조정이 잘 돼요" },
  { id: "access", label: "오가기 편해요" },
] as const;

export const MAX_TEXT = 500;

export interface Review {
  id: string;
  facilityId: string;
  uid: string;
  nickname: string;
  rating: number;
  text: string;
  tags: string[];
  updatedAt: Date | null;
}

/** 시설당 1인 1리뷰. 문서 ID 로 보장하고 Firestore 규칙이 같은 조건을 검사한다. */
export const reviewId = (facilityId: string, uid: string) => `${facilityId}_${uid}`;

/** 카카오 닉네임이 실명일 수 있어 첫 글자만 보여준다. */
export function maskNickname(nickname: string): string {
  const chars = [...nickname.trim()];
  if (chars.length <= 1) return chars[0] ?? "익명";
  return chars[0] + "*".repeat(Math.min(chars.length - 1, 3));
}

export function summarize(reviews: Pick<Review, "rating">[]) {
  const count = reviews.length;
  const avg = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
  return { count, avg };
}

export function subscribeReviews(
  facilityId: string,
  onData: (reviews: Review[]) => void,
  onError: (e: Error) => void,
) {
  // where 하나만 쓰면 복합 색인 없이 동작한다. 정렬은 클라이언트에서 한다.
  const q = query(collection(db(), "reviews"), where("facilityId", "==", facilityId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d): Review => {
        const v = d.data();
        return {
          id: d.id,
          facilityId: v.facilityId,
          uid: v.uid,
          nickname: v.nickname,
          rating: v.rating,
          text: v.text ?? "",
          tags: v.tags ?? [],
          updatedAt: (v.updatedAt as Timestamp | null)?.toDate() ?? null,
        };
      });
      list.sort((a, b) => (b.updatedAt?.getTime() ?? Date.now()) - (a.updatedAt?.getTime() ?? Date.now()));
      onData(list);
    },
    onError,
  );
}

export function saveReview(input: {
  facilityId: string;
  uid: string;
  nickname: string;
  rating: number;
  text: string;
  tags: string[];
}) {
  return setDoc(doc(db(), "reviews", reviewId(input.facilityId, input.uid)), {
    facilityId: input.facilityId,
    uid: input.uid,
    nickname: input.nickname,
    rating: input.rating,
    text: input.text.trim().slice(0, MAX_TEXT),
    tags: input.tags,
    updatedAt: serverTimestamp(),
  });
}

export const deleteReview = (facilityId: string, uid: string) =>
  deleteDoc(doc(db(), "reviews", reviewId(facilityId, uid)));
