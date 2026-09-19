"use client";

import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, firebaseConfigured } from "@/lib/firebase";

export interface AppUser {
  uid: string;
  nickname: string;
}

interface AuthState {
  user: AppUser | null;
  /** 로그인 상태를 아직 확인하는 중 */
  loading: boolean;
  enabled: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: false,
  enabled: false,
  signIn: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth(), async (u) => {
      if (!u) {
        setUser(null);
      } else {
        // 서버가 토큰 claim 에 넣어 둔 카카오 닉네임
        const claims = (await u.getIdTokenResult()).claims;
        setUser({ uid: u.uid, nickname: String(claims.nickname ?? "학부모") });
      }
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      enabled: firebaseConfigured,
      signIn: () => {
        window.location.href = "/api/auth/kakao/login";
      },
      signOut: () => fbSignOut(auth()),
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
