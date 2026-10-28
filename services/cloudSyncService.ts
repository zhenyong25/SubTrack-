export interface SyncIssue { id: number; table: string; message: string; retryable: boolean }
export interface SyncSnapshot {
  userId: string | null;
  active: number;
  retrying: boolean;
  lastSuccess: string | null;
  issues: SyncIssue[];
}
interface FailedWrite extends SyncIssue { request: Request; key: string; version: number }

// Observe actual REST writes, including callers that ignore PostgREST's error object.
// Requests and credentials remain in memory. Never replay a superseded write.
export class CloudSyncMonitor {
  private state: SyncSnapshot = { userId: null, active: 0, retrying: false, lastSuccess: null, issues: [] };
  private listeners = new Set<() => void>();
  private failures = new Map<number, FailedWrite>();
  private versions = new Map<string, number>();
  private sequence = 0;
  private generation = 0;
  private activeIds = new Set<number>();
  private retryBarrier: Promise<void> | null = null;
  constructor(private transport: typeof fetch = (...args) => fetch(...args)) {}
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getSnapshot = () => this.state;
  private emit() {
    this.state = { ...this.state, active: this.activeIds.size, issues: [...this.failures.values()].map(({ id, table, message, retryable }) => ({ id, table, message, retryable })) };
    this.listeners.forEach(callback => callback());
  }
  setAccount(userId: string | null) {
    if (userId === this.state.userId) return;
    this.generation++;
    this.failures.clear(); this.versions.clear(); this.activeIds.clear();
    let lastSuccess: string | null = null;
    try { if (userId) lastSuccess = localStorage.getItem(`subtrack_last_cloud_save_${userId}`); } catch { /* Optional metadata. */ }
    this.state = { userId, active: 0, retrying: false, lastSuccess, issues: [] };
    this.emit();
  }
  fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)$/)?.[1];
    if (!table || ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || !this.state.userId) return this.transport(request);
    const ownerAtStart = this.state.userId;
    if (this.retryBarrier) await this.retryBarrier;
    if (ownerAtStart !== this.state.userId) return this.transport(request);
    const generation = this.generation;
    // A later request to the same table can overlap an earlier write. Disable older retries
    // conservatively, even when their row filters differ, to avoid restoring stale data.
    const version = (this.versions.get(table) || 0) + 1;
    this.versions.set(table, version);
    for (const failure of this.failures.values()) if (failure.table === table) failure.retryable = false;
    let retryable = ['PATCH', 'DELETE', 'PUT'].includes(request.method)
      || (request.method === 'POST' && (request.headers.get('prefer') || '').includes('resolution=merge-duplicates'));
    const identityUrl = new URL(url);
    identityUrl.searchParams.delete('columns');
    identityUrl.searchParams.delete('select');
    let key = `${request.method}:${identityUrl.pathname}${identityUrl.search}`;
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        const rows = Array.isArray(body) ? body : [body];
        const columns = (url.searchParams.get('on_conflict') || (rows.every(row => row.id != null) ? 'id' : 'user_id')).split(',');
        if (!rows.length || !rows.every(row => columns.every(column => row[column] != null))) retryable = false;
        key += ':' + JSON.stringify(rows.map(row => columns.map(column => row[column])).sort());
      } catch { key += `:${version}`; retryable = false; }
    }
    if (generation !== this.generation) return this.transport(request);
    const id = ++this.sequence;
    const stored = request.clone();
    this.activeIds.add(id); this.emit();
    try {
      const response = await this.transport(request);
      if (generation === this.generation) {
        if (response.ok) this.success(key, version);
        else {
          const details = await this.errorMessage(response);
          if (generation === this.generation) this.failures.set(id, { id, table, key, version, request: stored, retryable: retryable && this.versions.get(table) === version, message: details });
        }
      }
      return response;
    } catch (error) {
      if (generation === this.generation) this.failures.set(id, { id, table, key, version, request: stored, retryable: retryable && this.versions.get(table) === version, message: 'Could not reach Supabase. Check your connection.' });
      throw error;
    } finally {
      if (generation === this.generation) { this.activeIds.delete(id); this.emit(); }
    }
  };
  private async errorMessage(response: Response) {
    try { const body = await response.clone().json(); return typeof body.message === 'string' ? body.message : `Database request failed (${response.status}).`; }
    catch { return `Database request failed (${response.status}).`; }
  }
  private success(key: string, version: number) {
    for (const [id, failure] of this.failures) if (failure.key === key && failure.version <= version) this.failures.delete(id);
    // A schema-compatibility fallback with the same rows resolves its original error.
    this.state = { ...this.state, lastSuccess: new Date().toISOString() };
    try { localStorage.setItem(`subtrack_last_cloud_save_${this.state.userId}`, this.state.lastSuccess!); } catch { /* Optional metadata. */ }
  }
  async retry(getCredentials: () => Promise<{ userId: string; token: string } | null>) {
    if (this.state.retrying || this.activeIds.size || this.retryBarrier) return;
    const generation = this.generation;
    const owner = this.state.userId;
    let release!: () => void;
    this.retryBarrier = new Promise<void>(resolve => { release = resolve; });
    this.state = { ...this.state, retrying: true }; this.emit();
    try {
      const credentials = await getCredentials();
      if (!credentials || credentials.userId !== owner || generation !== this.generation) throw new Error('Sign in to the same account before retrying.');
      for (const failure of [...this.failures.values()]) {
        if (generation !== this.generation) return;
        if (!failure.retryable || this.versions.get(failure.table) !== failure.version) continue;
        const headers = new Headers(failure.request.headers);
        headers.set('Authorization', `Bearer ${credentials.token}`);
        // A cancelled original request must not cancel an explicit retry.
        const request = new Request(failure.request.clone(), { headers, signal: new AbortController().signal });
        try {
          const response = await this.transport(request);
          if (generation !== this.generation) return;
          if (response.ok) this.success(failure.key, failure.version);
          else {
            const message = await this.errorMessage(response);
            if (generation !== this.generation) return;
            failure.message = message;
          }
        } catch { failure.message = 'Could not reach Supabase. Check your connection.'; }
        this.emit();
      }
    } finally {
      this.retryBarrier = null; release();
      if (generation === this.generation) { this.state = { ...this.state, retrying: false }; this.emit(); }
    }
  }
}

export const cloudSync = new CloudSyncMonitor();
