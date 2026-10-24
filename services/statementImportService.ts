import type { Expense, Income } from '../types';
import { CURRENCIES } from '../types';
import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { isValidDate, moneyInCents } from './savingsGoalMath';
import { importRecordId, sourceMarker, type ImportDraft, type ImportSource } from './statementCsvService';

export interface ImportResult { expenses: Expense[]; incomes: Income[]; completedRows: number[]; error?: string }
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The import could not be saved.';
export async function saveStatementImport(source: ImportSource, drafts: ImportDraft[], fileName: string): Promise<ImportResult> {
  const result: ImportResult = { expenses: [], incomes: [], completedRows: [] };
  try {
    if (!['Cash', 'Card'].includes(source.kind) || !source.id || !source.name) throw new Error('Choose the statement account or card.');
    if (!drafts.length || drafts.length > 500) throw new Error('Select between 1 and 500 transactions.');
    const unique = new Set<string>();
    for (const { transaction: row, action, category } of drafts) {
      if (row.error || !isValidDate(row.date) || !row.description.trim() || row.description.length > 240 || moneyInCents(row.amount) <= 0 || !CURRENCIES.includes(row.currency) || !row.fingerprint || !Number.isInteger(row.occurrence) || row.occurrence < 0 || row.occurrence > 499) throw new Error('Correct invalid transaction rows before importing.');
      if ((action === 'expense' && row.direction !== 'debit') || (action === 'income' && row.direction !== 'credit') || !['expense', 'income'].includes(action)) throw new Error('Confirm the correct transaction direction.');
      if (!category.trim() || category.length > 80) throw new Error('Choose a category for every new transaction.');
      const identity = `${row.fingerprint}:${row.occurrence}`; if (unique.has(identity)) throw new Error('A transaction was selected more than once.'); unique.add(identity);
    }
    const cloud = isSupabaseConfigured(); const client = cloud ? getSupabaseClient() : null;
    const session = cloud ? await getSupabaseSession() : null; const userId = session?.user.id;
    if (cloud && (!client || !userId)) throw new Error('Please sign in again before importing.');
    const expenses: Expense[] = []; const incomes: Income[] = []; const rowById = new Map<string, number>();
    for (const { transaction: row, action, category } of drafts) {
      const id = await importRecordId(userId || 'local', source, row);
      rowById.set(id, row.row);
      const notes = `${sourceMarker(source)} Imported from ${fileName.slice(0, 120)} · ${source.name.slice(0, 120)}${row.reference ? ` · Reference: ${row.reference}` : ''}`;
      if (action === 'expense') expenses.push({ id, name: row.description, amount: row.amount, currency: row.currency, expenseDate: row.date, category: category.trim(), color: '#f97316', notes, ...(source.kind === 'Card' ? { linkedCardId: source.id, linkedCardName: source.name } : {}) });
      else incomes.push({ id, name: row.description, amount: row.amount, currency: row.currency, incomeDate: row.date, firstIncomeDate: row.date, nextIncomeDate: row.date, incomeMode: 'One-time', incomeType: 'Active', incomeCycle: 'Monthly', category: category.trim(), color: '#10b981', notes, status: 'Active' });
    }
    if (!cloud) {
      // Each ledger is one atomic localStorage write. Report completed ledgers if the next fails.
      for (const [key, records, completed] of [['subtrack_expenses_v1', expenses, result.expenses], ['subtrack_income_v1', incomes, result.incomes]] as const) {
        if (!records.length) continue;
        const stored = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(stored)) throw new Error('Existing ledger data could not be read. Restore it before importing.');
        const ids = new Set(stored.map(record => record.id)); const fresh = records.filter(record => !ids.has(record.id));
        localStorage.setItem(key, JSON.stringify([...stored, ...fresh]));
        (completed as Array<Expense | Income>).push(...records.map(record => stored.find(item => item.id === record.id) || record));
        result.completedRows.push(...records.map(record => rowById.get(record.id)!));
      }
      return result;
    }
    // Ignore duplicate IDs so retries never overwrite later edits to imported transactions.
    for (const [table, records, completed] of [['expenses', expenses, result.expenses], ['incomes', incomes, result.incomes]] as const) {
      for (let offset = 0; offset < records.length; offset += 100) {
        const chunk = records.slice(offset, offset + 100);
        const rows = chunk.map(record => table === 'expenses' ? {
          id: record.id, user_id: userId, name: record.name, amount: record.amount, currency: record.currency, category: record.category, color: record.color, notes: record.notes,
          expense_date: (record as Expense).expenseDate, linked_card_id: (record as Expense).linkedCardId || null, linked_card_name: (record as Expense).linkedCardName || null,
        } : {
          id: record.id, user_id: userId, name: record.name, amount: record.amount, currency: record.currency, category: record.category, color: record.color, notes: record.notes,
          income_type: 'Active', income_mode: 'One-time', income_cycle: null, income_date: (record as Income).incomeDate, first_income_date: (record as Income).firstIncomeDate, next_income_date: (record as Income).nextIncomeDate, status: 'Active',
        });
        const { error } = await client!.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
        const verified = await client!.from(table).select('*').eq('user_id', userId!).in('id', chunk.map(record => record.id));
        if (verified.error) throw verified.error;
        if (verified.data?.length !== chunk.length) throw new Error('Some imported records could not be verified. Refresh and retry; saved rows will not be duplicated.');
        const saved = verified.data.map((row: any) => table === 'expenses' ? {
          id: row.id, name: row.name, amount: Number(row.amount), currency: row.currency, category: row.category, color: row.color, notes: row.notes || undefined, expenseDate: row.expense_date,
          linkedCardId: row.linked_card_id || undefined, linkedCardName: row.linked_card_name || undefined, cashbackCategoryId: row.cashback_category_id || undefined, tags: row.tags || undefined,
        } : {
          id: row.id, name: row.name, amount: Number(row.amount), currency: row.currency, category: row.category, color: row.color, notes: row.notes || undefined,
          incomeType: row.income_type, incomeMode: row.income_mode, incomeCycle: row.income_cycle || 'Monthly', incomeDate: row.income_date || undefined, firstIncomeDate: row.first_income_date, nextIncomeDate: row.next_income_date, status: row.status,
        });
        (completed as Array<Expense | Income>).push(...saved);
        result.completedRows.push(...chunk.map(record => rowById.get(record.id)!));
      }
    }
  } catch (error) { result.error = message(error); }
  return result;
}
