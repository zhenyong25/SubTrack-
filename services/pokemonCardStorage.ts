import { getSupabaseClient } from './appDataService';
import type { PokemonTrackedCard } from './pokemonCardService';

export async function openPokemonCardStore() {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  if (session?.error) throw session.error;
  const userId = session?.data.session?.user.id;
  const key = `subtrack_pokemon_watchlist_v1:${userId || 'guest'}`;
  const pendingKey = `${key}:pending`;
  let cards: PokemonTrackedCard[] = [];
  const stored = localStorage.getItem(key);
  if (stored) {
    try { cards = JSON.parse(stored); if (!Array.isArray(cards)) throw new Error(); }
    catch { throw new Error('The saved card tracker could not be read. Your saved data has been preserved.'); }
  }
  let notice = 'Saved on this device.';
  let cloudAvailable = false;
  if (client && userId) {
    const { data, error } = await client.from('pokemon_card_watchlists').select('cards').eq('user_id', userId).maybeSingle();
    if (!error) {
      cloudAvailable = true;
      if (localStorage.getItem(pendingKey)) {
        notice = 'This device has changes waiting to sync. Save a card or price to retry account sync.';
      } else {
        if (data && Array.isArray(data.cards)) cards = data.cards;
        notice = 'Synced to your account.';
      }
    } else {
      notice = 'Saved on this device. Account sync is currently unavailable.';
    }
  }
  return {
    cards, notice,
    async save(next: PokemonTrackedCard[]) {
      // Do not let a stale session write another user's local or cloud data.
      if (client) {
        const current = await client.auth.getSession();
        if (current.error || current.data.session?.user.id !== userId) throw new Error('Your session changed. Reload before saving cards.');
      }
      localStorage.setItem(key, JSON.stringify(next));
      if (userId) localStorage.setItem(pendingKey, 'true');
      if (client && userId && cloudAvailable) {
        try {
          const { error } = await client.from('pokemon_card_watchlists').upsert({ user_id: userId, cards: next, updated_at: new Date().toISOString() });
          if (error) return 'Saved on this device; account sync failed. Keep a JSON backup before switching devices.';
        } catch {
          return 'Saved on this device; account sync failed. Keep a JSON backup before switching devices.';
        }
        localStorage.removeItem(pendingKey);
        return 'Synced to your account.';
      }
      return notice;
    },
  };
}
