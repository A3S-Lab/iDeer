import type { ConfigData, UserProfile } from "./types";
import type { LanguagePreference, ThemePreference } from "./copy";

// Pure-web build: the facade keeps the same exports so AppShell / desktopViews
// don't need touching, but every formerly Tauri-only operation is now a no-op
// or its closest browser equivalent. Server-side state (config, history,
// health) flows through the normal FastAPI endpoints in `./api`.

export function isTauriDesktop() {
  return false;
}

export async function startManagedBackend() {
  return "browser-preview";
}

export async function stopManagedBackend() {}

export async function readManagedBackendLog() {
  return "";
}

export async function testSmtpConnection(_host: string, _port: number): Promise<string> {
  throw new Error("SMTP 连通性测试仅支持桌面客户端。");
}

export async function minimizeWindow() {}

export async function toggleWindowMaximize() {}

export async function isWindowMaximized() {
  return false;
}

export async function openControlPanelWindow(
  _tab: "profile" | "preferences" | "subscriptions" | "mail" | "info" = "profile",
) {
  return null;
}

export async function closeWindow() {}

export function openExternalUrl(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function loadDesktopConfig(): Promise<ConfigData | null> {
  return null;
}

export async function saveDesktopConfig(_config: ConfigData) {}

export async function emitPreferenceChange(_payload: {
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}) {}

export async function emitConfigChange(_config: ConfigData) {}

export async function emitUserProfileChange(_profile: UserProfile) {}

export async function listenPreferenceChange(
  _handler: (payload: { languagePreference: LanguagePreference; themePreference: ThemePreference }) => void,
): Promise<() => void> {
  return () => {};
}

export async function listenConfigChange(
  _handler: (config: ConfigData) => void,
): Promise<() => void> {
  return () => {};
}

export async function listenUserProfileChange(
  _handler: (profile: UserProfile) => void,
): Promise<() => void> {
  return () => {};
}
