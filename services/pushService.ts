import { getSupabaseClient, isSupabaseConfigured } from './appDataService';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  Boolean(VAPID_PUBLIC_KEY) &&
  isSupabaseConfigured();

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
};

export const getPushPermission = (): NotificationPermission | 'unsupported' => {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
};

export const getActivePushSubscription = async () => {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

const saveSubscription = async (subscription: PushSubscription) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
};

export const enableDailyReminder = async () => {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not supported on this device/browser');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await saveSubscription(subscription);
  return subscription;
};

export const disableDailyReminder = async () => {
  const subscription = await getActivePushSubscription();
  if (!subscription) return;

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  }
  await subscription.unsubscribe();
};
