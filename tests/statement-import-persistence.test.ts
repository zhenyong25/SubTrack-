import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCsvRows, parseCsv, suggestMapping, type ImportDraft } from '../services/statementCsvService';
import { saveStatementImport } from '../services/statementImportService';
const store = new Map<string, string>();
const setItem = (key: string, value: string) => { store.set(key, value); };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null, setItem } });
const source = { kind: 'Card' as const, id: 'card-a', name: 'Visa' };
const drafts = (): ImportDraft[] => { const table = parseCsv('Date,Description,Amount\n2026-10-01,Coffee,-5\n2026-10-02,Salary,3000'); return mapCsvRows(table, suggestMapping(table.headers, 'SGD')).map(row => ({ transaction: row, action: row.direction === 'debit' ? 'expense' : 'income', category: row.direction === 'debit' ? 'Food' : 'Salary' })); };
test('local import persists only selected ledgers, is idempotent, and preserves later edits', async () => {
  (globalThis as any).__importCloud = false; store.clear(); store.set('subtrack_cash_balance_entries_v1','untouched');
  let result = await saveStatementImport(source, drafts(), 'bank.csv'); assert.equal(result.error, undefined); assert.deepEqual(result.completedRows, [2,3]); assert.equal(result.expenses[0].linkedCardId, 'card-a'); assert.equal(result.incomes[0].incomeMode, 'One-time');
  const expenses = JSON.parse(store.get('subtrack_expenses_v1')!); expenses[0].name = 'Edited merchant'; store.set('subtrack_expenses_v1',JSON.stringify(expenses));
  result = await saveStatementImport(source, drafts(), 'renamed.csv'); assert.equal(result.expenses[0].name, 'Edited merchant'); assert.equal(JSON.parse(store.get('subtrack_expenses_v1')!).length,1); assert.equal(JSON.parse(store.get('subtrack_income_v1')!).length,1); assert.equal(store.get('subtrack_cash_balance_entries_v1'),'untouched');
});
test('local failures report only successful writes and retries do not duplicate the completed ledger', async () => {
  store.clear(); localStorage.setItem = (key, value) => { if (key === 'subtrack_income_v1') throw new Error('Storage full'); setItem(key,value); };
  let result = await saveStatementImport(source,drafts(),'bank.csv'); assert.match(result.error!, /Storage full/); assert.deepEqual(result.completedRows,[2]); assert.equal(result.incomes.length,0);
  localStorage.setItem = setItem; result = await saveStatementImport(source,drafts(),'bank.csv'); assert.equal(result.error,undefined); assert.equal(JSON.parse(store.get('subtrack_expenses_v1')!).length,1);
});
test('invalid drafts, empty selection and corrupt ledgers never report success', async () => {
  store.clear(); const invalid = drafts(); invalid[0].transaction.amount = -5; let result = await saveStatementImport(source,invalid,'x.csv'); assert.ok(result.error); assert.equal(store.size,0);
  result = await saveStatementImport(source,[],'x.csv'); assert.ok(result.error);
  store.set('subtrack_expenses_v1','{}'); result = await saveStatementImport(source,drafts(),'x.csv'); assert.match(result.error!, /could not be read/); assert.equal(result.completedRows.length,0);
});
test('cloud mode requires authentication and never falls back to local storage', async () => {
  (globalThis as any).__importCloud = true; (globalThis as any).__importUser = null; const before = new Map(store);
  const result = await saveStatementImport(source,drafts(),'x.csv'); assert.match(result.error!, /sign in again/); assert.deepEqual(store,before);
});
test('cloud inserts ignore duplicate IDs, verify owner-scoped records and expose partial failures', async () => {
  (globalThis as any).__importUser = 'owner-a'; const tables = new Map<string, Map<string, any>>(); let failIncome = true; const calls: any[] = [];
  (globalThis as any).__importClient = { from(table: string) { tables.set(table,tables.get(table) || new Map()); return { async upsert(rows: any[], options: any) { calls.push({ table, rows, options }); if(table === 'incomes' && failIncome) return {error:{message:'Database unavailable'}}; for(const row of rows) if(!tables.get(table)!.has(row.id)) tables.get(table)!.set(row.id,row); return {error:null}; }, select(){return this;}, eq(column: string,value: string){assert.equal(column,'user_id'); assert.equal(value,'owner-a'); return this;}, async in(column: string,ids: string[]){assert.equal(column,'id'); return {error:null,data:ids.map(id=>tables.get(table)!.get(id))};} }; } };
  let result = await saveStatementImport(source,drafts(),'x.csv'); assert.match(result.error!, /Database unavailable/); assert.deepEqual(result.completedRows,[2]); assert.equal(result.expenses.length,1); assert.equal(calls[0].options.ignoreDuplicates,true); assert.equal(calls[0].rows[0].user_id,'owner-a');
  const saved = [...tables.get('expenses')!.values()][0]; saved.name = 'Later edit'; failIncome = false;
  result = await saveStatementImport(source,drafts(),'x.csv'); assert.equal(result.error,undefined); assert.equal(result.expenses[0].name,'Later edit'); assert.equal(tables.get('expenses')!.size,1); assert.equal(result.incomes.length,1);
});
test('cloud chunk failures report verified rows and unverified writes remain safe to retry', async () => {
  const table = parseCsv('Date,Description,Amount\n' + Array.from({length:101},(_,index)=>`2026-10-01,Shop ${index},-1`).join('\n'));
  const selected: ImportDraft[] = mapCsvRows(table,suggestMapping(table.headers,'SGD')).map(transaction=>({transaction,action:'expense',category:'Other'}));
  const stored = new Map<string, any>(); let upserts=0; let failRead=false;
  (globalThis as any).__importClient = { from(){return { async upsert(rows:any[]){upserts++; if(upserts===2)return {error:{message:'Second chunk failed'}}; for(const row of rows)if(!stored.has(row.id))stored.set(row.id,row);return {error:null};}, select(){return this;}, eq(){return this;}, async in(_column:string,ids:string[]){return failRead?{error:{message:'Verification unavailable'},data:null}:{error:null,data:ids.map(id=>stored.get(id))};} };} };
  let result = await saveStatementImport(source,selected,'large.csv'); assert.equal(result.completedRows.length,100); assert.equal(result.expenses.length,100); assert.match(result.error!,/Second chunk/);
  failRead=true; result=await saveStatementImport(source,selected.slice(100),'large.csv'); assert.equal(result.completedRows.length,0); assert.equal(stored.size,101); assert.match(result.error!,/Verification/);
  failRead=false; result=await saveStatementImport(source,selected.slice(100),'large.csv'); assert.equal(result.error,undefined); assert.deepEqual(result.completedRows,[102]); assert.equal(stored.size,101);
});
