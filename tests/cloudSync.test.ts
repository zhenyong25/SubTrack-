import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSyncMonitor } from '../services/cloudSyncService';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) } });
const upsert = (name = 'incomes', amount = 100, extra = '') => new Request(`https://example.supabase.co/rest/v1/${name}?on_conflict=id${extra}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates', Authorization: 'Bearer old-token' }, body: JSON.stringify([{ id: 'record-1', amount }]),
});
const credentials = async () => ({ userId: 'owner', token: 'fresh-token' });
const failed = () => new Response(JSON.stringify({ message: 'Database refused the save.' }), { status: 500 });

test('tracks actual writes; reads and storage uploads do not imply saved database data', async () => {
  let complete!: (response: Response) => void;
  const monitor = new CloudSyncMonitor(async () => new Promise(resolve => { complete = resolve; }));
  monitor.setAccount('write-owner');
  const saving = monitor.fetch(upsert());
  while (!monitor.getSnapshot().active) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(monitor.getSnapshot().active, 1);
  assert.equal(monitor.getSnapshot().lastSuccess, null);
  complete(new Response(null, { status: 204 }));
  await saving;
  assert.equal(monitor.getSnapshot().active, 0);
  assert.ok(monitor.getSnapshot().lastSuccess);
  const observer = new CloudSyncMonitor(async () => new Response('{}'));
  observer.setAccount('read-owner');
  await observer.fetch('https://example.supabase.co/rest/v1/incomes');
  await observer.fetch('https://example.supabase.co/storage/v1/object/account-statements/file', { method: 'POST', body: 'file' });
  assert.equal(observer.getSnapshot().lastSuccess, null);
});

test('failed upserts retry with fresh credentials, retain body and clear only on success', async () => {
  let shouldFail = true;
  let retryRequest: Request | undefined;
  const monitor = new CloudSyncMonitor(async input => {
    retryRequest = input as Request;
    return shouldFail ? failed() : new Response(null, { status: 204 });
  });
  monitor.setAccount('owner');
  await monitor.fetch(upsert());
  assert.equal(monitor.getSnapshot().issues.length, 1);
  assert.equal(monitor.getSnapshot().lastSuccess, null);
  await monitor.retry(credentials);
  assert.equal(monitor.getSnapshot().issues.length, 1);
  shouldFail = false;
  await monitor.retry(credentials);
  assert.equal(retryRequest!.headers.get('authorization'), 'Bearer fresh-token');
  assert.deepEqual(await retryRequest!.clone().json(), [{ id: 'record-1', amount: 100 }]);
  assert.equal(monitor.getSnapshot().issues.length, 0);
});

test('network errors remain visible and transport errors still reach the caller', async () => {
  const monitor = new CloudSyncMonitor(async () => { throw new TypeError('Failed to fetch'); });
  monitor.setAccount('network-owner');
  await assert.rejects(() => monitor.fetch(upsert()));
  assert.equal(monitor.getSnapshot().issues.length, 1);
  assert.equal(monitor.getSnapshot().active, 0);
});

test('schema fallback for the same rows resolves the original failure', async () => {
  let fail = true;
  const monitor = new CloudSyncMonitor(async () => fail ? failed() : new Response('{}'));
  monitor.setAccount('schema-owner');
  await monitor.fetch(upsert('incomes', 100, '&columns=id,amount,tags'));
  fail = false;
  await monitor.fetch(upsert('incomes', 100, '&columns=id,amount'));
  assert.equal(monitor.getSnapshot().issues.length, 0);
});

test('newer writes cannot be overwritten by retrying older failures', async () => {
  let calls = 0;
  const monitor = new CloudSyncMonitor(async () => { calls++; return calls === 1 ? failed() : new Response('{}'); });
  monitor.setAccount('owner');
  await monitor.fetch(upsert());
  await monitor.fetch(upsert('incomes', 200));
  await monitor.retry(credentials);
  assert.equal(calls, 2);
  assert.equal(monitor.getSnapshot().issues.length, 0);
});

test('non-idempotent inserts and upserts missing a stable key require a manual save', async () => {
  let calls = 0;
  const monitor = new CloudSyncMonitor(async () => { calls++; return failed(); });
  monitor.setAccount('owner');
  await monitor.fetch('https://example.supabase.co/rest/v1/account_statements', { method: 'POST', body: JSON.stringify({ file_name: 'payslip.pdf' }) });
  await monitor.fetch('https://example.supabase.co/rest/v1/incomes', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ amount: 100 }) });
  assert.ok(monitor.getSnapshot().issues.every(issue => !issue.retryable));
  await monitor.retry(credentials);
  assert.equal(calls, 2);
});

test('account changes clear activity and ignore late completions from the old account', async () => {
  let complete!: (response: Response) => void;
  const monitor = new CloudSyncMonitor(async () => new Promise(resolve => { complete = resolve; }));
  monitor.setAccount('old-owner');
  const saving = monitor.fetch(upsert());
  while (!monitor.getSnapshot().active) await new Promise(resolve => setTimeout(resolve, 0));
  monitor.setAccount('new-owner');
  complete(failed());
  await saving;
  assert.equal(monitor.getSnapshot().issues.length, 0);
  assert.equal(monitor.getSnapshot().active, 0);
  assert.equal(monitor.getSnapshot().lastSuccess, null);
});

test('retry refuses a different signed-in account', async () => {
  const monitor = new CloudSyncMonitor(async () => failed());
  monitor.setAccount('owner');
  await monitor.fetch(upsert());
  await assert.rejects(() => monitor.retry(async () => ({ userId: 'someone-else', token: 'token' })), /same account/);
  assert.equal(monitor.getSnapshot().retrying, false);
  assert.equal(monitor.getSnapshot().issues.length, 1);
});
