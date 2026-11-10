// 알림 발송 추상화. 모든 알림은 앱 안 알림함(notifications)에 남기고,
// 수신 동의 + 인증 번호가 있으면 카카오 알림톡, 아니면 앱 푸시(FCM)로 바깥 발송을 시도한다.
import { isLocal } from "./env";
import { newId, store } from "./store";

export const NOTIFICATIONS = "notifications";
export const CONTACTS = "user_contacts";

export interface NotificationAction {
  id: string;
  label: string;
}

export interface AppNotification {
  uid: string;
  kind: "vacancy" | "vacancy_followup" | "alert_expiring" | "system";
  title: string;
  body: string;
  /** 원탭 응답 버튼 (빈자리 후속 질문 등) */
  actions?: NotificationAction[];
  /** 응답 대상 (alert_deliveries 문서 ID) */
  ref?: string;
  link?: string;
  channel: ChannelId | "inapp";
  created_at: string;
  read_at: string | null;
  answered: string | null;
  [k: string]: unknown;
}

export type ChannelId = "alimtalk" | "push";

export interface Message {
  title: string;
  body: string;
  link?: string;
}

export interface Channel {
  id: ChannelId;
  configured(): boolean;
  send(to: { uid: string; phone?: string }, msg: Message): Promise<void>;
}

/**
 * 카카오 알림톡.
 * TODO(질문): 발송 대행사(비즈메시지 딜러사)와 템플릿 코드·발신 프로필 키가 정해지면 구현한다.
 * 알림톡은 사전 승인된 템플릿 문구만 보낼 수 있으므로 Message → 템플릿 변수 매핑도 그때 정한다.
 */
const alimtalk: Channel = {
  id: "alimtalk",
  configured: () => Boolean(process.env.ALIMTALK_API_URL && process.env.ALIMTALK_API_KEY && process.env.ALIMTALK_SENDER_KEY),
  async send() {
    throw new Error("알림톡 발송 모듈이 아직 연결되지 않았습니다 (lib/server/notify.ts TODO)");
  },
};

/**
 * 앱 푸시 (FCM). Firebase 이전 단계에서 구현한다.
 * TODO: firebase-admin messaging 으로 users/{uid} 의 FCM 토큰에 보낸다.
 */
const push: Channel = {
  id: "push",
  configured: () => false,
  async send() {
    throw new Error("FCM 이 아직 연결되지 않았습니다");
  },
};

let channels: Channel[] = [alimtalk, push];

/** 테스트에서 발송 채널을 바꿔 끼운다 */
export function setChannelsForTests(list: Channel[]) {
  channels = list;
}

export async function notify(
  uid: string,
  kind: AppNotification["kind"],
  msg: Message,
  extra: Pick<AppNotification, "actions" | "ref"> = {},
): Promise<{ id: string; channel: AppNotification["channel"] }> {
  const user = await store().get<{ consents?: { notify?: { agreed?: boolean } } }>("users", uid);
  const contact = await store().get<{ phone?: string }>(CONTACTS, uid);
  const wantsAlimtalk = Boolean(user?.consents?.notify?.agreed && contact?.phone);

  const order: ChannelId[] = wantsAlimtalk ? ["alimtalk", "push"] : ["push"];
  let used: AppNotification["channel"] = "inapp";
  for (const id of order) {
    const ch = channels.find((c) => c.id === id);
    if (!ch?.configured()) continue;
    try {
      await ch.send({ uid, phone: id === "alimtalk" ? contact?.phone : undefined }, msg);
      used = id;
      break;
    } catch (e) {
      console.error(`notify via ${id} failed`, e);
    }
  }
  if (used === "inapp" && isLocal()) {
    console.info(`[careos notify:${kind}] ${uid} ${msg.title} — ${msg.body}`);
  }

  const id = newId();
  const doc: AppNotification = {
    uid,
    kind,
    title: msg.title,
    body: msg.body,
    link: msg.link,
    channel: used,
    created_at: new Date().toISOString(),
    read_at: null,
    answered: null,
    ...extra,
  };
  await store().set(NOTIFICATIONS, id, doc);
  return { id, channel: used };
}
