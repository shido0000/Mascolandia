import { LocalNotifications } from "@capacitor/local-notifications";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { t } from "./i18n.js";

export async function requestNotificationPermission() {
  try {
    const status = await LocalNotifications.requestPermissions();
    return status.display === "granted";
  } catch {
    return false;
  }
}

export async function scheduleRoutineReminder(routine) {
  if (!routine.time) return;
  const [hours, minutes] = routine.time.split(":").map(Number);
  const days = routine.days.length ? routine.days : [0, 1, 2, 3, 4, 5, 6];
  try {
    await LocalNotifications.schedule({
      notifications: days.map((weekday) => ({
        id: hashId(routine.id + weekday),
        title: t("appName"),
        body: `${routine.icon || "🐾"} ${routine.name}`,
        schedule: { on: { weekday: weekday + 1, hour: hours, minute: minutes }, allowWhileIdle: true },
      })),
    });
  } catch {
    /* web fallback: no scheduling */
  }
}

export async function cancelRoutineReminder(routineId) {
  try {
    const ids = [];
    for (let d = 0; d < 7; d++) ids.push(hashId(routineId + d));
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* noop */
  }
}

export async function haptic() {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* noop */
  }
}

function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483000 + 1000;
}
