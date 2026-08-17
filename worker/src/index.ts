import webpush from 'web-push';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Asia/Singapore is a fixed UTC+8 offset with no daylight saving.
const SGT_OFFSET_MINUTES = 8 * 60;

function getSingaporeDayRangeUtc(now: Date) {
  const sgtNow = new Date(now.getTime() + SGT_OFFSET_MINUTES * 60 * 1000);
  const startSgt = Date.UTC(sgtNow.getUTCFullYear(), sgtNow.getUTCMonth(), sgtNow.getUTCDate(), 0, 0, 0);
  const endSgt = startSgt + 24 * 60 * 60 * 1000;
  return {
    startUtc: new Date(startSgt - SGT_OFFSET_MINUTES * 60 * 1000),
    endUtc: new Date(endSgt - SGT_OFFSET_MINUTES * 60 * 1000),
  };
}

async function supabaseFetch(env: Env, path: string, init?: RequestInit) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase request to ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function hasTransactionToday(env: Env, userId: string, startUtc: Date, endUtc: Date) {
  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();
  const filter = `user_id=eq.${userId}&created_at=gte.${startIso}&created_at=lt.${endIso}&limit=1&select=id`;

  const [expenses, incomes] = await Promise.all([
    supabaseFetch(env, `expenses?${filter}`) as Promise<unknown[]>,
    supabaseFetch(env, `incomes?${filter}`) as Promise<unknown[]>,
  ]);

  return expenses.length > 0 || incomes.length > 0;
}

async function deleteSubscription(env: Env, id: string) {
  await supabaseFetch(env, `push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
}

async function runDailyReminderCheck(env: Env) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const subscriptions = (await supabaseFetch(
    env,
    'push_subscriptions?select=id,user_id,endpoint,p256dh,auth',
  )) as PushSubscriptionRow[];

  if (subscriptions.length === 0) return;

  const { startUtc, endUtc } = getSingaporeDayRangeUtc(new Date());

  const userIds = [...new Set(subscriptions.map(sub => sub.user_id))];
  const activityByUser = new Map<string, boolean>();
  await Promise.all(
    userIds.map(async userId => {
      activityByUser.set(userId, await hasTransactionToday(env, userId, startUtc, endUtc));
    }),
  );

  const dueSubscriptions = subscriptions.filter(sub => !activityByUser.get(sub.user_id));

  await Promise.all(
    dueSubscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'SubTrack',
            body: "You haven't logged any expenses or income today.",
            url: '/',
          }),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(env, sub.id);
        } else {
          console.error('Push failed for subscription', sub.id, err);
        }
      }
    }),
  );
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyReminderCheck(env));
  },
};
