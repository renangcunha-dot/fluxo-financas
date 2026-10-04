import { registerSW } from 'virtual:pwa-register';

export type NotificationAction = 'block' | 'continue' | 'open';

let registration: ServiceWorkerRegistration | undefined;

export function initNotifications(onAction: (action: NotificationAction, data: unknown) => void) {
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, reg) => {
      registration = reg;
    },
  });
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'notification-action') onAction(e.data.action, e.data.data);
  });
}

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'denied');

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

interface PushOptions {
  tag?: string;
  actions?: { action: NotificationAction; title: string }[];
  data?: unknown;
  requireInteraction?: boolean;
}

/** Envia um push do sistema. Usa o service worker (que suporta botões de ação) e cai para a API simples. */
export async function push(title: string, body: string, opts: PushOptions = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const options = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: opts.tag,
    data: opts.data,
    requireInteraction: opts.requireInteraction,
    actions: opts.actions,
  } as NotificationOptions;
  try {
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration());
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* cai para a API simples */
  }
  try {
    const { actions: _a, ...simple } = options as NotificationOptions & { actions?: unknown };
    new Notification(title, simple);
    return true;
  } catch {
    return false;
  }
}
