import React, { useEffect, useState } from 'react';
import type { PokemonTrackedCard } from '../services/pokemonCardService';
import { POKEMON_LANGUAGES, fetchPokemonSets, fetchPokemonSet, searchCatalogCards, exactCardNumberMatches, cardThumbnail, fetchEnglishSpeciesName, type CatalogSet, type CatalogSetDetail, type CatalogCard } from '../services/pokemonCatalogService';
import { CHINESE_CATALOG_SOURCE } from '../services/chinesePokemonCatalog';

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain disabled:opacity-50';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="grid gap-1 text-xs font-bold text-secondary">{label}{children}</label>;
interface Props { card: PokemonTrackedCard; onChange: (patch: Partial<PokemonTrackedCard>) => void }
const PokemonCardPicker: React.FC<Props> = ({ card, onChange }) => {
  const [manual, setManual] = useState(Boolean(card.name && !card.catalogSetId));
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [detail, setDetail] = useState<CatalogSetDetail | null>(null);
  const [setQuery, setSetQuery] = useState('');
  const [numberQuery, setNumberQuery] = useState(card.number);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const language = POKEMON_LANGUAGES.find(([, name]) => name === card.language)?.[0] || '';
  useEffect(() => {
    if (manual || !language) return;
    const controller = new AbortController();
    setLoading(language === 'zh-cn' ? 'Loading Chinese card names and variants. The first download may take a minute…' : 'Loading sets…'); setError(''); setSets([]);
    fetchPokemonSets(language, controller.signal).then(data => { if (!controller.signal.aborted) setSets(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(''); });
    return () => controller.abort();
  }, [language, manual, retry]);
  useEffect(() => {
    setDetail(null);
    if (manual || !language || !card.catalogSetId) return;
    const controller = new AbortController();
    setLoading('Loading cards…'); setError('');
    fetchPokemonSet(language, card.catalogSetId, controller.signal).then(data => { if (!controller.signal.aborted) setDetail(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(''); });
    return () => controller.abort();
  }, [language, card.catalogSetId, manual, retry]);
  useEffect(() => {
    if (!card.catalogId || !card.pokedexNumber || card.englishSpeciesName) return;
    const controller = new AbortController();
    fetchEnglishSpeciesName(card.pokedexNumber, controller.signal).then(name => { if (name && !controller.signal.aborted) onChange({ englishSpeciesName: name }); }).catch(() => { /* The original printed name remains authoritative. */ });
    return () => controller.abort();
  }, [card.catalogId, card.pokedexNumber]);
  const choose = (match: CatalogCard, set: CatalogSetDetail) => onChange({ name: match.name, number: match.localId, set: set.name, catalogId: match.id, imageUrl: cardThumbnail(match), rarity: match.rarity, catalogSourceUrl: match.sourceUrl || set.sourceUrl, pokedexNumber: match.pokedexNumber, englishSpeciesName: card.catalogId === match.id ? card.englishSpeciesName : undefined });
  const resetIdentity = { name: '', number: '', set: '', catalogId: undefined, catalogSetId: undefined, imageUrl: undefined, rarity: undefined, catalogSourceUrl: undefined, pokedexNumber: undefined, englishSpeciesName: undefined };
  const matchingSets = sets.filter(set => `${set.name} ${set.id}`.toLowerCase().includes(setQuery.trim().toLowerCase()));
  const matchingCards = detail ? searchCatalogCards(detail.cards, numberQuery) : [];
  const missingCardList = Boolean(detail && detail.cards.length === 0);
  const enterManually = () => {
    setManual(true); setError(''); setLoading('');
    onChange({ set: card.set || setQuery.trim(), number: numberQuery.trim() || card.number, catalogId: undefined, catalogSetId: undefined, imageUrl: undefined, rarity: undefined, catalogSourceUrl: undefined, pokedexNumber: undefined, englishSpeciesName: undefined });
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-bold text-secondary">1. Language → 2. Set → 3. Card number</span><button type="button" className="font-bold text-primary" onClick={() => { if (!manual) enterManually(); else { setManual(false); setError(''); setLoading(''); } }}>{manual ? 'Use catalog search' : 'Card missing? Enter manually'}</button></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Language"><select required className={input} value={card.language} onChange={e => { onChange({ ...resetIdentity, language: e.target.value }); setSets([]); setDetail(null); setSetQuery(''); setNumberQuery(''); setError(''); setLoading(''); }}><option value="">Select language</option>{POKEMON_LANGUAGES.map(([code, name]) => <option key={code}>{name}</option>)}{card.language && !language && <option>{card.language}</option>}</select></Field>
      {manual ? <>
        <Field label="Set / edition"><input required className={input} maxLength={160} value={card.set} onChange={e => onChange({ set: e.target.value })} /></Field>
        <Field label="Card number"><input className={input} value={card.number} onChange={e => onChange({ number: e.target.value })} /></Field>
      </> : <>
        <Field label="Find set by name or code"><input disabled={!language} className={input} value={setQuery} onChange={e => setSetQuery(e.target.value)} placeholder="e.g. 151, Base Set, SV2a" /></Field>
        <Field label="Card number or name"><input disabled={!detail} className={input} value={numberQuery} placeholder="e.g. 004, 4/102 or Charizard" onChange={e => {
          const query = e.target.value; setNumberQuery(query);
          const exact = detail ? exactCardNumberMatches(detail.cards, query) : [];
          if (query.trim() && exact.length === 1 && detail) choose(exact[0], detail);
          else onChange({ name: missingCardList ? card.name : '', number: query.trim(), catalogId: undefined, imageUrl: undefined, rarity: undefined, catalogSourceUrl: undefined, pokedexNumber: undefined, englishSpeciesName: undefined });
        }} /></Field>
      </>}
    </div>
    {!manual && <>
      {loading && <p className="text-xs text-secondary" role="status">{loading}</p>}
      {error && <div role="alert" className="text-sm text-red-500">{error} <button type="button" className="underline" onClick={() => setRetry(retry + 1)}>Retry</button></div>}
      {language && !loading && !error && !sets.length && <p className="text-xs text-secondary">No sets available for this language. Use manual entry for missing cards.</p>}
      {sets.length > 0 && <Field label={`Select set (${matchingSets.length} matches)`}><select required aria-label="Select Pokémon set" size={5} className={input} value={card.catalogSetId || ''} onChange={e => {
        const selected = sets.find(s => s.id === e.target.value);
        onChange({ ...resetIdentity, catalogSetId: selected?.id, set: selected?.name || '' }); setDetail(null); setNumberQuery('');
      }}><option value="" disabled>Select a set</option>{matchingSets.map(s => <option key={s.id} value={s.id}>{s.name} · {s.id} · {s.cardCount.total} catalog entries</option>)}</select></Field>}
      {sets.length > 0 && !matchingSets.length && <div className="text-xs text-secondary">This set is missing from the catalog. <button type="button" className="font-bold text-primary underline" onClick={enterManually}>Use {setQuery || 'this set'} and enter card details</button></div>}
      {missingCardList && <div className="rounded-xl border border-border bg-background p-3 text-sm" role="status">{detail?.verifiedPrintings ? `${detail.name} has ${detail.verifiedPrintings} checklist printings. ` : ''}Card names are unavailable from the connected catalog. You can still save a raw or graded card: enter its full printed number above and its name below.{detail?.referenceUrl && <a className="ml-1 text-primary underline" href={detail.referenceUrl} target="_blank" rel="noopener noreferrer">View checklist</a>}</div>}
      {detail && !missingCardList && <div className="space-y-2"><p className="text-xs text-secondary">{matchingCards.length} matches in {detail.cards.length} available catalog entries for {detail.name}. Enter the full printed number to fill the name automatically. If several printings share a number, select the correct image and rarity.</p><div className="max-h-64 overflow-y-auto rounded-xl border border-border">{matchingCards.map(match => <button key={match.id} type="button" aria-pressed={card.catalogId === match.id} className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm hover:bg-primary/10 ${card.catalogId === match.id ? 'bg-primary/10 text-primary font-bold' : ''}`} onClick={() => { choose(match, detail); setNumberQuery(match.localId); }}>{cardThumbnail(match) && numberQuery.trim() && <img src={cardThumbnail(match)} alt="" className="h-16 w-12 object-contain" loading="lazy" />}<span className="min-w-16 whitespace-nowrap font-mono">#{match.localId}</span><span>{match.name}{match.rarity && <span className="ml-2 text-secondary">{match.rarity}</span>}</span></button>)}{!matchingCards.length && <p className="p-3 text-sm text-secondary">No catalog match. <button type="button" className="text-primary underline font-bold" onClick={enterManually}>Keep this number and enter the card name</button></p>}</div></div>}
    </>}
    <div className="flex items-center gap-4">
      {card.imageUrl && <img key={card.imageUrl} src={card.imageUrl} alt={card.name} className="h-28 w-20 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />}
      <div className="flex-1"><Field label={manual || missingCardList ? 'Card name' : 'Card name (from catalog)'}><input required readOnly={!manual && !missingCardList} className={input} maxLength={160} value={card.name} placeholder={manual || missingCardList ? 'Enter card name' : 'Select a set and find your card'} onChange={e => onChange({ name: e.target.value })} /></Field>{card.englishSpeciesName && <p className="mt-1 text-sm font-bold">English Pokémon name: {card.englishSpeciesName}</p>}{card.catalogId && <p className="mt-1 text-xs text-secondary">#{card.number} · {card.set} · {card.language}{card.rarity && ` · ${card.rarity}`}</p>}</div>
    </div>
    {!manual && <p className="text-xs text-secondary">{language === 'zh-cn' ? <>Chinese card data from Pokémon Shanghai via <a className="underline" href={CHINESE_CATALOG_SOURCE} target="_blank" rel="noopener noreferrer">PTCG-CHS-Datasets</a>.</> : <>Catalog by <a className="underline" href="https://tcgdex.dev" target="_blank" rel="noopener noreferrer">TCGdex</a>.</>} Language coverage varies; some sets or cards may be missing.</p>}
  </div>;
};
export default PokemonCardPicker;
