"use client";

import { useCallback, useEffect, useState } from "react";
import { dongLabel, loadRegions } from "@/lib/regions";
import { api } from "@/lib/ui";

// 현재 위치 (지도·AI 상담 공용). 좌표 → 행정동 변환은 서버(/api/regions/locate)에서 하고 좌표는 저장하지 않는다.
// '현재 위치 사용' 을 켜 두면(브라우저 localStorage) 다음 방문에도 자동으로 다시 켠다.
const PREF_KEY = "careos:useLocation";

export interface Here {
  emdCode: string;
  /** 예: "동작구 노량진1동" */
  label: string;
  lat: number;
  lng: number;
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1" || localStorage.getItem("careos:agent:useLocation") === "1";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, "1");
    else {
      localStorage.removeItem(PREF_KEY);
      localStorage.removeItem("careos:agent:useLocation");
    }
  } catch {
    /* 저장 못 해도 이번 화면에서는 동작한다 */
  }
}

export function locateOnce(): Promise<Here> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("이 브라우저에서는 위치를 쓸 수 없어요"));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const r = await api<{ emdCode: string }>(`/api/regions/locate?lat=${lat}&lng=${lng}`);
          resolve({ emdCode: r.emdCode, label: dongLabel(await loadRegions(), r.emdCode), lat, lng });
        } catch {
          reject(new Error("현재 위치가 서비스 지역(서울) 밖이에요"));
        }
      },
      () => reject(new Error("위치 권한이 필요해요. 브라우저 설정에서 위치 접근을 허용해 주세요")),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

export function useCurrentLocation() {
  const [here, setHere] = useState<Here | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 저장된 설정으로 자동 확인까지 끝났는지 (지도 첫 위치를 정할 때 기다린다) */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!readPref()) {
      setSettled(true);
      return;
    }
    setBusy(true);
    locateOnce()
      .then(setHere)
      .catch(() => {})
      .finally(() => {
        setBusy(false);
        setSettled(true);
      });
  }, []);

  /** 위치를 다시 확인하고 설정을 켠다. 성공하면 위치를 돌려준다 */
  const enable = useCallback(async (): Promise<Here | null> => {
    setBusy(true);
    setError(null);
    try {
      const h = await locateOnce();
      setHere(h);
      writePref(true);
      return h;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(() => {
    setHere(null);
    writePref(false);
  }, []);

  return { here, busy, error, settled, enable, disable };
}
