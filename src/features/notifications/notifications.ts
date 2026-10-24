import { Character, PrivacySettings } from "../../types";
import { LS_NOTIFICATIONS_ENABLED } from "../../utils/constants";

// Browser notifications (#43). When a character reaches out on its own or a
// reply finishes while the tab is hidden, the user gets a notification that
// opens that chat. Off by default; the switch lives in Settings › Chat.
//
// The switch is kept in localStorage rather than the settings slice because
// it's only meaningful together with this browser's permission, so it isn't
// part of the settings export either: on another device the permission has
// to be granted again anyway.

export type NotificationStatus = NotificationPermission | "unsupported";

// Shown instead of the real content whenever privacy settings say the
// message itself mustn't be visible outside the app.
export const GENERIC_TITLE = "New message";

const PREVIEW_LENGTH = 120;

const appIcon = () => `${process.env.PUBLIC_URL || ""}/logo192.png`;

export const isNotificationSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export const getNotificationStatus = (): NotificationStatus =>
  isNotificationSupported() ? Notification.permission : "unsupported";

export const notificationsEnabled = (): boolean => {
  try {
    return localStorage.getItem(LS_NOTIFICATIONS_ENABLED) === "true";
  } catch {
    return false;
  }
};

export const setNotificationsEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(LS_NOTIFICATIONS_ENABLED, String(enabled));
  } catch {
    // Storage blocked (private mode): the switch just won't stick.
  }
};

// Asks the browser only while the user hasn't decided yet. Once they have
// allowed or blocked notifications, browsers ignore further prompts anyway,
// and re-asking would look like nagging.
export const requestNotificationPermission = async (): Promise<NotificationStatus> => {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Very old Safari only offers the callback form.
    return new Promise((resolve) => Notification.requestPermission(resolve));
  }
};

// One line of plain text: markdown emphasis and code marks are dropped and
// whitespace is collapsed, so the preview reads like a text message.
export const previewText = (text: string, max = PREVIEW_LENGTH): string => {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
};

// Only portraits a notification can load on its own: data URLs and web
// URLs. Pictures saved to a local folder ("local:") need a file handle the
// notification can't use, so those fall back to the app icon.
const usableAvatar = (src: string | undefined): string | undefined =>
  src && /^(data:image\/|https?:)/.test(src) ? src : undefined;

export interface ChatNotificationInput {
  chatId: number;
  speaker: Pick<Character, "name" | "appearanceImages">;
  text: string;
  hasImages?: boolean;
  // Any member of the chat is NSFW, as in the sidebar's discreet list.
  isNsfwChat: boolean;
  privacy: PrivacySettings;
  muted?: boolean; // a muted chat (#115) never alerts
}

export interface ChatNotificationContent {
  title: string;
  body?: string;
  icon: string;
  tag: string;
  chatId: number;
}

// Decides what a notification may show. The sidebar's rules apply, since a
// notification is just another place a chat's preview appears: with the app
// lock on, nothing is shown at all (a notification sits outside the lock
// screen, so it would give away what the PIN is guarding); discreet mode
// hides an NSFW chat's text and name; blurred media drops its portrait.
export const buildNotificationContent = (input: ChatNotificationInput): ChatNotificationContent => {
  const { chatId, speaker, text, hasImages, isNsfwChat, privacy } = input;
  // One notification per chat: a newer message replaces the older one
  // instead of piling up.
  const tag = `chat-${chatId}`;
  const locked = Boolean(privacy.pinHash && privacy.pinSalt);
  if (locked || (isNsfwChat && privacy.discreetMode)) {
    return { title: GENERIC_TITLE, icon: appIcon(), tag, chatId };
  }
  const preview = previewText(text) || (hasImages ? "Sent a photo" : "");
  const avatar = isNsfwChat && privacy.blurNsfwMedia ? undefined : usableAvatar(speaker.appearanceImages?.[0]);
  return {
    title: speaker.name || GENERIC_TITLE,
    body: preview || undefined,
    icon: avatar || appIcon(),
    tag,
    chatId,
  };
};

// Only when the user can't see the app: a reply landing in a visible tab
// is already on screen.
export const shouldNotify = (): boolean =>
  notificationsEnabled() &&
  getNotificationStatus() === "granted" &&
  typeof document !== "undefined" &&
  document.visibilityState === "hidden";

type OpenChatHandler = (chatId: number) => void;
let openChatHandler: OpenChatHandler | null = null;

// Set once by the app (useNotificationClicks) so a click on either kind of
// notification can route to the chat without this module knowing the router.
export const setOpenChatHandler = (handler: OpenChatHandler | null) => {
  openChatHandler = handler;
};

export const openChatFromNotification = (chatId: number) => {
  try {
    window.focus();
  } catch {
    // Some browsers refuse focus() outside a user gesture; navigating still helps.
  }
  openChatHandler?.(chatId);
};

// The service worker posts this when one of its notifications is clicked
// (see service-worker.ts).
export const OPEN_CHAT_MESSAGE = "OPEN_CHAT";

// A registration's showNotification works in an installed app and on
// Android, where `new Notification` throws; the constructor covers the dev
// server and any browser without an active service worker.
const getRegistration = async (): Promise<ServiceWorkerRegistration | undefined> => {
  try {
    if (!("serviceWorker" in navigator)) return undefined;
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active ? registration : undefined;
  } catch {
    return undefined;
  }
};

// Shows the notification if the user is away and has turned them on.
// Returns whether one was shown. Never throws: a notification is a nicety
// and must not break saving a reply.
export const notifyChatMessage = async (input: ChatNotificationInput): Promise<boolean> => {
  if (input.muted || !shouldNotify()) return false;
  const content = buildNotificationContent(input);
  const options: NotificationOptions & { renotify?: boolean } = {
    body: content.body,
    icon: content.icon,
    tag: content.tag,
    // Same tag, new message: alert again rather than replacing silently.
    renotify: true,
    data: { chatId: content.chatId },
  };
  try {
    const registration = await getRegistration();
    if (registration) {
      await registration.showNotification(content.title, options);
      return true;
    }
    const notification = new Notification(content.title, options);
    notification.onclick = () => {
      notification.close();
      openChatFromNotification(content.chatId);
    };
    return true;
  } catch (err) {
    console.warn("Couldn't show a notification:", err);
    return false;
  }
};
