"use client";

import { useEffect, useRef, useState } from "react";
import { KAKAO_KEY, loadKakao, type Kakao } from "@/lib/kakao";
import { DONGJAK_CENTER } from "@/lib/places";
import type { Match } from "@/lib/types";

interface Props {
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  center: { lat: number; lng: number } | null;
  radiusM: number;
  pickMode: boolean;
  onPick: (pos: { lat: number; lng: number }) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function KakaoMap({ matches, selectedId, onSelect, center, radiusM, pickMode, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const kakaoRef = useRef<Kakao>(null);
  const mapRef = useRef<any>(null);
  const pins = useRef<any[]>([]);
  const area = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(KAKAO_KEY ? null : "no-key");

  // 지도 생성
  useEffect(() => {
    if (!KAKAO_KEY) return;
    let ro: ResizeObserver | undefined;
    loadKakao()
      .then((kakao) => {
        if (!box.current) return;
        kakaoRef.current = kakao;
        const map = new kakao.maps.Map(box.current, {
          center: new kakao.maps.LatLng(DONGJAK_CENTER.lat, DONGJAK_CENTER.lng),
          level: 6,
        });
        mapRef.current = map;
        // 필터 패널이 열리고 닫히며 컨테이너 크기가 바뀔 때 타일이 깨지지 않게
        ro = new ResizeObserver(() => map.relayout());
        ro.observe(box.current);
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    return () => ro?.disconnect();
  }, []);

  // 시설 핀
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!ready || !kakao || !map) return;

    pins.current.forEach((o) => o.setMap(null));
    pins.current = matches.map(({ facility: f }) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pin";
      el.dataset.selected = String(f.id === selectedId);
      el.setAttribute("aria-label", `${f.name}, 빈자리 ${f.vacancy}명`);
      el.innerHTML = `<span class="pin-count">${f.vacancy}</span>${
        f.id === selectedId ? `<span class="pin-name">${f.name.replace(/</g, "&lt;")}</span>` : ""
      }`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelect(f.id);
      });
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(f.lat, f.lng),
        content: el,
        yAnchor: 1,
        zIndex: f.id === selectedId ? 10 : 1,
      });
      overlay.setMap(map);
      return overlay;
    });
  }, [ready, matches, selectedId, onSelect]);

  // 선호 위치 + 반경
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!ready || !kakao || !map) return;

    area.current.forEach((o) => o.setMap(null));
    area.current = [];
    if (!center) return;

    const pos = new kakao.maps.LatLng(center.lat, center.lng);
    const circle = new kakao.maps.Circle({
      center: pos,
      radius: radiusM,
      strokeWeight: 2,
      strokeColor: "#059669",
      strokeOpacity: 0.9,
      fillColor: "#10b981",
      fillOpacity: 0.12,
    });
    const dot = document.createElement("div");
    dot.className = "here-dot";
    const marker = new kakao.maps.CustomOverlay({ position: pos, content: dot, zIndex: 0 });
    circle.setMap(map);
    marker.setMap(map);
    area.current = [circle, marker];
    map.setBounds(circle.getBounds(), 24, 24, 24, 24);
  }, [ready, center, radiusM]);

  // 선택한 시설로 이동
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!ready || !map || !selectedId) return;
    const hit = matches.find((m) => m.facility.id === selectedId);
    if (hit) map.panTo(new kakao.maps.LatLng(hit.facility.lat, hit.facility.lng));
    // matches 변화로 다시 이동하지 않도록 selectedId 에만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId]);

  // 지도에서 위치 찍기
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!pickMode) return;
    const handler = (e: any) => onPick({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
    kakao.maps.event.addListener(map, "click", handler);
    return () => kakao.maps.event.removeListener(map, "click", handler);
  }, [ready, pickMode, onPick]);

  if (error) {
    return (
      <div className="grid h-full place-items-center bg-stone-100 p-6 text-center text-sm text-stone-600">
        <div className="max-w-xs space-y-2">
          <p className="font-semibold text-stone-800">지도를 표시할 수 없어요</p>
          <p>
            {error === "no-key"
              ? ".env.local 에 NEXT_PUBLIC_KAKAO_MAP_KEY(카카오 JavaScript 키)를 설정하고 개발 서버를 다시 시작해 주세요."
              : error}
          </p>
          <p className="text-xs text-stone-500">지도 없이도 아래 목록에서 결과를 확인할 수 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={box}
      className="h-full w-full"
      style={{ cursor: pickMode ? "crosshair" : undefined }}
      onClick={() => !pickMode && onSelect(null)}
    />
  );
}
