import {
  buildNotificationContent,
  ChatNotificationInput,
  GENERIC_TITLE,
  getNotificationStatus,
  notificationsEnabled,
  notifyChatMessage,
  previewText,
  requestNotificationPermission,
  setNotificationsEnabled,
  setOpenChatHandler,
  shouldNotify,
} from "./notifications";
import { DEFAULT_PRIVACY, LS_NOTIFICATIONS_ENABLED } from "../../utils/constants";

// jsdom has no Notification API, so each test installs this stand-in, which
// records every notification it's asked to show.
class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = jest.fn(async () => FakeNotification.permission);
  static shown: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = jest.fn();
  constructor(public title: string, public options: NotificationOptions = {}) {
    FakeNotification.shown.push(this);
  }
}

let visibility: DocumentVisibilityState = "hidden";

const AVATAR = "data:image/png;base64,AAAA";

const input = (overrides: Partial<ChatNotificationInput> = {}): ChatNotificationInput => ({
  chatId: 7,
  speaker: { name: "Aria", appearanceImages: [AVATAR] },
  text: "Hey, are you still there?",
  isNsfwChat: false,
  privacy: DEFAULT_PRIVACY,
  ...overrides,
});

const setServiceWorker = (registration: Partial<ServiceWorkerRegistration> | undefined) => {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn(async () => registration) },
  });
};

beforeEach(() => {
  localStorage.clear();
  FakeNotification.permission = "granted";
  FakeNotification.shown = [];
  FakeNotification.requestPermission.mockClear();
  (window as any).Notification = FakeNotification;
  visibility = "hidden";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  setServiceWorker(undefined);
  setOpenChatHandler(null);
});

afterAll(() => {
  delete (window as any).Notification;
  delete (navigator as any).serviceWorker;
});

describe("permission and the switch", () => {
  it("reports unsupported when the browser has no Notification API", () => {
    delete (window as any).Notification;
    expect(getNotificationStatus()).toBe("unsupported");
  });

  it("is off until turned on, and remembers the switch", () => {
    expect(notificationsEnabled()).toBe(false);
    setNotificationsEnabled(true);
    expect(localStorage.getItem(LS_NOTIFICATIONS_ENABLED)).toBe("true");
    expect(notificationsEnabled()).toBe(true);
  });

  it("asks the browser only while the user hasn't decided", async () => {
    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockImplementationOnce(async () => "granted");
    expect(await requestNotificationPermission()).toBe("granted");
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);

    FakeNotification.permission = "denied";
    expect(await requestNotificationPermission()).toBe("denied");
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("previewText", () => {
  it("flattens markdown and whitespace into one line", () => {
    expect(previewText("*smiles*  Hi\n\n**there** `you`")).toBe("smiles Hi there you");
  });

  it("cuts long text with an ellipsis", () => {
    const out = previewText("word ".repeat(100), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildNotificationContent", () => {
  it("shows the name, a preview and the avatar", () => {
    expect(buildNotificationContent(input())).toEqual({
      title: "Aria",
      body: "Hey, are you still there?",
      icon: AVATAR,
      tag: "chat-7",
      chatId: 7,
    });
  });

  it("says a picture was sent when there's no text", () => {
    expect(buildNotificationContent(input({ text: "", hasImages: true })).body).toBe("Sent a photo");
  });

  it("uses the app icon for portraits saved to a local folder", () => {
    const content = buildNotificationContent(input({ speaker: { name: "Aria", appearanceImages: ["local:aria.png"] } }));
    expect(content.icon).toMatch(/logo192\.png$/);
  });

  it("shows only a generic message while the app lock is on", () => {
    const content = buildNotificationContent(input({ privacy: { ...DEFAULT_PRIVACY, pinHash: "h", pinSalt: "s" } }));
    expect(content.title).toBe(GENERIC_TITLE);
    expect(content.body).toBeUndefined();
    expect(content.icon).toMatch(/logo192\.png$/);
    expect(content.chatId).toBe(7);
  });

  it("hides an NSFW chat's message in discreet mode", () => {
    const privacy = { ...DEFAULT_PRIVACY, discreetMode: true };
    expect(buildNotificationContent(input({ isNsfwChat: true, privacy })).title).toBe(GENERIC_TITLE);
    // Discreet mode leaves other chats alone.
    expect(buildNotificationContent(input({ isNsfwChat: false, privacy })).title).toBe("Aria");
  });

  it("drops an NSFW chat's portrait when media is blurred, but keeps the text", () => {
    const content = buildNotificationContent(input({ isNsfwChat: true, privacy: { ...DEFAULT_PRIVACY, blurNsfwMedia: true } }));
    expect(content.title).toBe("Aria");
    expect(content.body).toBe("Hey, are you still there?");
    expect(content.icon).toMatch(/logo192\.png$/);
  });
});

describe("notifyChatMessage", () => {
  beforeEach(() => setNotificationsEnabled(true));

  it("does nothing while the switch is off", async () => {
    setNotificationsEnabled(false);
    expect(shouldNotify()).toBe(false);
    expect(await notifyChatMessage(input())).toBe(false);
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("does nothing without permission", async () => {
    FakeNotification.permission = "denied";
    expect(await notifyChatMessage(input())).toBe(false);
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("does nothing while the tab is visible", async () => {
    visibility = "visible";
    expect(await notifyChatMessage(input())).toBe(false);
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("falls back to a page notification that opens the chat when clicked", async () => {
    const openChat = jest.fn();
    setOpenChatHandler(openChat);
    const focus = jest.spyOn(window, "focus").mockImplementation(() => undefined);

    expect(await notifyChatMessage(input())).toBe(true);
    expect(FakeNotification.shown).toHaveLength(1);
    const [shown] = FakeNotification.shown;
    expect(shown.title).toBe("Aria");
    expect(shown.options).toMatchObject({ body: "Hey, are you still there?", icon: AVATAR, tag: "chat-7", data: { chatId: 7 } });

    shown.onclick?.();
    expect(shown.close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(openChat).toHaveBeenCalledWith(7);
    focus.mockRestore();
  });

  it("uses the service worker's showNotification when one is active", async () => {
    const showNotification = jest.fn(async () => undefined);
    setServiceWorker({ active: {} as ServiceWorker, showNotification });

    expect(await notifyChatMessage(input())).toBe(true);
    expect(showNotification).toHaveBeenCalledWith("Aria", expect.objectContaining({ tag: "chat-7", data: { chatId: 7 } }));
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("swallows a browser that refuses to show one", async () => {
    // Android Chrome throws on `new Notification` when there's no worker.
    (window as any).Notification = class extends FakeNotification {
      constructor(title: string) {
        super(title);
        throw new TypeError("Illegal constructor");
      }
    };
    (window as any).Notification.permission = "granted";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await notifyChatMessage(input())).toBe(false);
    warn.mockRestore();
  });
});
