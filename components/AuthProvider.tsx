"use client";

import { onIdTokenChanged, signOut as fbSignOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, firebaseConfigured } from "@/lib/firebase";
import BottomNav, { TABBED_PATHS } from "./BottomNav";
import { FLAG_NAMES, type Flags } from "@/lib/flags";
import { guardRedirect } from "@/lib/guard";
import type { ProfileView } from "@/lib/profile";
import { api } from "@/lib/ui";

export interface AppUser {
  uid: string;
  nickname: string;
  isAdmin: boolean;
  onboarded: boolean;
}

interface AuthState {
  user: AppUser | null;
  profile: ProfileView | null;
  flags: Flags;
  /** 로그인 상태를 아직 확인하는 중 */
  loading: boolean;
  /** 프로필·플래그를 다시 받는다. 가입 직후에는 force 로 ID 토큰(onboarded 클레임)도 새로 받는다 */
  refresh: (force?: boolean) => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** 리뷰 기능용 Firebase 로그인 정보 (앱 로그인과 같다) */
  firebase: { enabled: boolean; user: { uid: string; nickname: string } | null };
}

const ALL_ON = Object.fromEntries(FLAG_NAMES.map((n) => [n, true])) as Flags;

const Ctx = createContext<AuthState>({
  user: null,
  profile: null,
  flags: ALL_ON,
  loading: true,
  refresh: async () => {},
  signIn: () => {},
  signOut: async () => {},
  firebase: { enabled: false, user: null },
});

export const useAuth = () => useContext(Ctx);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [flags, setFlags] = useState<Flags>(ALL_ON);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const j = await api<{ user: AppUser | null; profile: ProfileView | null; flags: Flags }>("/api/me", { cache: "no-store" });
      setUser(j.user);
      setProfile(j.profile);
      setFlags(j.flags);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    // ID 토큰이 바뀔 때(로그인·로그아웃·갱신)마다 서버에서 프로필을 다시 받는다
    return onIdTokenChanged(auth(), () => {
      void load();
    });
  }, [load]);

  const refresh = useCallback(
    async (force = false) => {
      if (force && firebaseConfigured) await auth().currentUser?.getIdToken(true);
      await load();
    },
    [load],
  );

  // 회원가입 필수: 로그인 전엔 /login, 가입 전엔 /signup
  const target = loading ? null : guardRedirect(pathname, { signedIn: Boolean(user), onboarded: Boolean(user?.onboarded) }, typeof window === "undefined" ? "" : window.location.search);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      flags,
      loading,
      refresh,
      signIn: () => router.push("/login"),
      signOut: async () => {
        if (firebaseConfigured) await fbSignOut(auth());
        router.replace("/login");
      },
      firebase: { enabled: firebaseConfigured, user: user ? { uid: user.uid, nickname: user.nickname } : null },
    }),
    [user, profile, flags, loading, refresh, router],
  );

  if (!firebaseConfigured) {
    return (
      <main className="grid h-dvh place-items-center bg-stone-50 p-6 text-center text-sm text-stone-600">
        Firebase 웹 설정(NEXT_PUBLIC_FIREBASE_*)이 없어요. 로컬에서는 NEXT_PUBLIC_USE_EMULATORS=true 로 에뮬레이터를 쓰세요.
      </main>
    );
  }

  const tabbed = Boolean(user?.onboarded) && TABBED_PATHS.includes(pathname.replace(/\/$/, "") || "/");
  return (
    <Ctx.Provider value={value}>
      {loading || target ? (
        <Splash />
      ) : tabbed ? (
        <div className="has-tabbar">
          {children}
          <BottomNav flags={flags} />
        </div>
      ) : (
        children
      )}
    </Ctx.Provider>
  );
}

function Splash() {
  return <p className="grid h-dvh place-items-center bg-stone-50 text-sm text-stone-500">불러오는 중…</p>;
}
