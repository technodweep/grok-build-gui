import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionChecked = false;
let granted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return granted;
  try {
    granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
  } catch {
    granted = false;
  }
  permissionChecked = true;
  return granted;
}

/** Fire a desktop notification if permission allows. Never throws. */
export async function notify(title: string, body: string) {
  try {
    if (!(await ensurePermission())) return;
    sendNotification({ title, body });
  } catch {
    /* ignore — notifications are best-effort */
  }
}

export function appProbablyBackground(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden || !document.hasFocus();
}
