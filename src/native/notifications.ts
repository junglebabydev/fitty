// Local notifications via the Web Notifications API. On iOS this only works
// for a home-screen PWA (16.4+) and, like everywhere else, only after the user
// grants permission from a tap. Reminders are shown while the app is open;
// scheduled delivery needs the native shell.
//
// Capacitor swap: @capacitor/local-notifications — LocalNotifications
// .requestPermissions() / .schedule({ notifications: [{ title, body, schedule: { at } }] }).

export type NotificationState = NotificationPermission | 'unsupported'

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined'
}

export function notificationPermission(): NotificationState {
  if (!supported()) return 'unsupported'
  return Notification.permission
}

/** Must be called from a user gesture. Resolves the resulting state. */
export async function requestNotificationPermission(): Promise<NotificationState> {
  if (!supported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    // Older Safari only supports the callback form.
    const result = await new Promise<NotificationPermission>((resolve) => {
      const maybePromise = Notification.requestPermission((p) => resolve(p))
      if (maybePromise && typeof (maybePromise as Promise<NotificationPermission>).then === 'function') {
        ;(maybePromise as Promise<NotificationPermission>).then(resolve, () => resolve(Notification.permission))
      }
    })
    return result
  } catch {
    return Notification.permission
  }
}

/** Shows a notification now. Returns false when unsupported, denied, or the platform refused. */
export async function showLocalNotification(title: string, body: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  const options: NotificationOptions = { body, tag: 'coach-local', icon: '/icon.svg' }
  // Prefer the service-worker path: required on Android Chrome and iOS PWA,
  // where `new Notification()` throws.
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options)
        return true
      }
    }
  } catch {
    /* fall through to the page-level constructor */
  }
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
