"use client";

// 브라우저 음성 인식(Web Speech API, 한국어). Chrome·Edge·Android·Safari(iOS 14.5+)에서 된다. 지원하지 않으면 supported=false.
// 녹음 파일은 CareOS 서버로 보내지 않는다. 글자로 바뀐 문장만 입력칸에 들어간다(변환은 브라우저 제공사가 한다).
import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

const ERRORS: Record<string, string> = {
  "not-allowed": "마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요.",
  "service-not-allowed": "이 브라우저에서는 음성 인식을 쓸 수 없어요.",
  "audio-capture": "마이크를 찾지 못했어요.",
  network: "음성 인식 연결이 끊겼어요. 다시 눌러 주세요.",
};

export function useSpeechInput(onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as any;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => rec.current?.abort?.();
  }, []);

  const start = () => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setError(null);
    const r: Recognition = new Ctor();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      const final = e.results[e.results.length - 1].isFinal;
      cb.current(text.trim(), final && text.trim().length > 0);
    };
    r.onerror = (e: any) => {
      if (e.error === "aborted") return;
      setError(e.error === "no-speech" ? "말씀이 들리지 않았어요. 다시 눌러 주세요." : (ERRORS[e.error] ?? "음성을 알아듣지 못했어요. 다시 눌러 주세요."));
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("음성 인식을 시작하지 못했어요.");
    }
  };

  const stop = () => rec.current?.stop?.();

  return { supported, listening, error, start, stop };
}
