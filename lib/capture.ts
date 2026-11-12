"use client";
// 화면 캡처를 AI 에게 보낼 이미지로 만든다. 긴 변 1600px 이하 JPEG, base64 70만 자 이하가 되도록 화질을 낮춘다.
// 이미지는 답을 만들 때 Gemini 로만 보내고 CareOS 서버에 저장하지 않는다(대화 기록은 이 브라우저 탭에만).

export const MAX_B64 = 700_000;

export interface Shot {
  mimeType: "image/jpeg";
  data: string; // base64 (data: 접두사 없음)
  preview: string; // data URL
}

function fromCanvas(canvas: HTMLCanvasElement): Shot {
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", q);
    const data = url.slice(url.indexOf(",") + 1);
    if (data.length <= MAX_B64) return { mimeType: "image/jpeg", data, preview: url };
  }
  throw new Error("이미지가 너무 커요. 화면 일부만 캡처해 주세요");
}

function draw(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** 사진·캡처 파일 */
export async function shotFromFile(file: File): Promise<Shot> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 보낼 수 있어요");
  const bmp = await createImageBitmap(file);
  try {
    return fromCanvas(draw(bmp, bmp.width, bmp.height));
  } finally {
    bmp.close();
  }
}

export const canCaptureScreen = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

/** 화면 공유 창에서 아이사랑 탭(또는 창)을 고르면 그 순간 한 장만 찍고 공유를 바로 끈다 */
export async function shotFromScreen(): Promise<Shot> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 300));
    return fromCanvas(draw(video, video.videoWidth, video.videoHeight));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** 확장 프로그램이 찍어 보낸 data URL(JPEG) → 크기 제한에 맞춘 Shot */
export async function shotFromDataUrl(url: string): Promise<Shot> {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(url)) throw new Error("이미지 형식이 올바르지 않아요");
  const img = new Image();
  img.src = url;
  await img.decode();
  return fromCanvas(draw(img, img.naturalWidth, img.naturalHeight));
}
