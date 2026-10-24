import test from 'node:test';
import assert from 'node:assert/strict';
import { importRecordId, mapCsvRows, parseCsv, parseCsvMoney, reconcileCsv, recordedExpensesNotInCsv, suggestMapping } from '../services/statementCsvService';
const source = { kind: 'Card' as const, id: 'card-a', name: 'Visa' };
const parse = (text: string) => { const table = parseCsv(text); return mapCsvRows(table, suggestMapping(table.headers, 'SGD')); };
const fixture = 'Date,Description,Amount,Currency\n2026-10-01,Coffee,-5.50,SGD\n2026-10-02,Salary,3000,SGD';
test('CSV quoting supports BOM, CRLF, escaped quotes and multiline descriptions', () => {
  const table = parseCsv('\uFEFFDate,Description,Amount\r\n2026-10-01,"Coffee, \"\"shop\"\"\nbranch",-5.50\r\n');
  assert.deepEqual(table.headers, ['Date', 'Description', 'Amount']); assert.equal(table.rows[0][1], 'Coffee, "shop"\nbranch'); assert.equal(table.rows.length, 1);
  assert.equal(parseCsv('Date;Description;Amount\n2026-10-01;Cafe;-5', ';').rows.length, 1);
  assert.equal(parseCsv('Date\tDescription\tAmount\n2026-10-01\tCafe\t-5', '\t').rows.length, 1);
});
test('invalid CSV quoting, missing data and oversize inputs reject', () => {
  for (const text of ['Date,Description\n"unfinished', 'Date,Description\n"done"x,y', 'Date,Description', 'OnlyOne\nValue']) assert.throws(() => parseCsv(text));
  assert.throws(() => parseCsv('x'.repeat(2_000_001)), /2 MB/);
  assert.throws(() => parseCsv('Date,Description\n' + 'x,y\n'.repeat(501)), /500 transactions/);
});
test('money formats reject ambiguous punctuation and fractional cents', () => {
  assert.equal(parseCsvMoney('(1,234.56)', '.'), -1234.56); assert.equal(parseCsvMoney('1.234,56', ','), 1234.56);
  for (const text of ['1,23', '$50', '1.005', 'NaN', '1e3', '--5', '(-5)']) assert.throws(() => parseCsvMoney(text, '.'));
});
test('signed amount mapping requires explicit date formats and supports card signs', () => {
  const rows = parse(fixture); assert.equal(rows[0].direction, 'debit'); assert.equal(rows[1].direction, 'credit');
  const table = parseCsv('Date,Description,Amount\n01/02/2026,Card,50'); const mapping = suggestMapping(table.headers, 'SGD');
  assert.match(mapCsvRows(table, mapping)[0].error!, /date/i);
  mapping.dateFormat = 'DMY'; mapping.expenseSign = 'positive'; const row = mapCsvRows(table, mapping)[0]; assert.equal(row.date, '2026-02-01'); assert.equal(row.direction, 'debit');
  mapping.dateFormat = 'MDY'; assert.equal(mapCsvRows(table, mapping)[0].date, '2026-01-02');
});
test('split debits and credits reject both-sided rows, negative columns and malformed dates', () => {
  const table = parseCsv('Date,Description,Debit,Credit\n2026-10-01,Cafe,5,\n2026-10-02,Pay,,50\n2026-10-03,Both,5,6\n2026-10-04,Negative,-5,\n2026-02-30,Bad date,5,');
  const rows = mapCsvRows(table, suggestMapping(table.headers, 'SGD')); assert.equal(rows[0].direction, 'debit'); assert.equal(rows[1].direction, 'credit'); assert.ok(rows.slice(2).every(row => row.error));
});
test('mapping rejects overlapping columns and flags invalid row shape and currencies', () => {
  const table = parseCsv(fixture); const mapping = suggestMapping(table.headers, 'SGD'); assert.throws(() => mapCsvRows(table, { ...mapping, date: mapping.amount }), /different column/);
  table.rows.push(['2026-10-01','Cafe','-5','XYZ'], ['2026-10-01','Cafe']); const rows = mapCsvRows(table, mapping); assert.match(rows[2].error!, /currency/); assert.match(rows[3].error!, /Column count/);
});
test('reconciliation defaults exact records to matched and credits to skip', () => {
  const rows = parse(fixture); const expense = { id: 'e', name: 'Coffee', expenseDate: '2026-10-01', amount: 5.5, currency: 'SGD', linkedCardId: source.id } as any;
  let result = reconcileCsv(rows, source, [expense], [], []); assert.equal(result[0].defaultAction, 'match'); assert.equal(result[1].defaultAction, 'skip');
  expense.name = 'Different shop'; result = reconcileCsv(rows, source, [expense], [], []); assert.equal(result[0].defaultAction, 'skip'); assert.equal(result[0].candidates[0].exact, false);
});
test('different cards, currencies and source markers cannot produce false exact matches', () => {
  const rows = parse(fixture); const expense = { id: 'e', name: 'Coffee', expenseDate: rows[0].date, amount: 5.5, currency: 'SGD', linkedCardId: 'other' } as any;
  assert.equal(reconcileCsv(rows, source, [expense], [], [])[0].defaultAction, 'expense');
  expense.linkedCardId = undefined; expense.notes = '[statement:Cash:other]'; assert.equal(reconcileCsv(rows, source, [expense], [], [])[0].candidates.length, 0);
  expense.notes = ''; expense.currency = 'USD'; assert.equal(reconcileCsv(rows, source, [expense], [], [])[0].candidates.length, 0);
});
test('file duplicates keep occurrences and one existing record is not matched twice automatically', () => {
  const rows = parse('Date,Description,Amount\n2026-10-01,Coffee,-5\n2026-10-01,Coffee,-5');
  const expense = { id: 'e', name: 'Coffee', amount: 5, currency: 'SGD', expenseDate: rows[0].date } as any;
  const result = reconcileCsv(rows, source, [expense], [], []); assert.equal(result[0].defaultAction, 'match'); assert.equal(result[1].defaultAction, 'skip'); assert.equal(rows[1].occurrence, 1); assert.equal(result[1].duplicate, true);
});
test('subscriptions suggest matches only near an actual renewal and in the correct currency', () => {
  const row = parse('Date,Description,Amount\n2026-10-01,Netflix billing,-15')[0];
  const sub = { id: 's', name: 'Netflix', status: 'Active', price: 15, currency: 'SGD', firstPaymentDate: '2026-01-01', billingCycle: 'Monthly', cardId: source.id } as any;
  assert.equal(reconcileCsv([row], source, [], [], [sub])[0].candidates[0].kind, 'Subscription');
  row.date = '2026-10-15'; assert.equal(reconcileCsv([row], source, [], [], [sub])[0].candidates.length, 0);
});
test('record IDs survive retries and filenames, but differ for owners, sources and occurrences', async () => {
  const row = parse(fixture)[0]; const id = await importRecordId('owner', source, row);
  assert.equal(await importRecordId('owner', { ...source, name: 'Renamed' }, row), id);
  assert.notEqual(await importRecordId('other-owner', source, row), id); assert.notEqual(await importRecordId('owner', { ...source, id: 'other' }, row), id); assert.notEqual(await importRecordId('owner', source, { ...row, occurrence: 1 }), id);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('historical subscriptions can be reconciled before cancellation, not afterwards', () => {
  const sub = { id: 's', name: 'Netflix', status: 'Past', price: 15, currency: 'SGD', firstPaymentDate: '2026-01-01', cancellationDate: '2026-10-15', billingCycle: 'Monthly', cardId: source.id } as any;
  const rows = parse('Date,Description,Amount\n2026-10-01,Netflix billing,-15\n2026-11-01,Netflix billing,-15');
  const result = reconcileCsv(rows,source,[],[],[sub]); assert.equal(result[0].candidates.length,1); assert.equal(result[1].candidates.length,0);
});
test('extra recorded expenses are source-scoped and limited to the file date range', () => {
  const rows = parse(fixture);
  const expenses = [{id:'matched',name:'Coffee',expenseDate:'2026-10-01',amount:5.5,currency:'SGD',linkedCardId:source.id},{id:'extra',name:'Other',expenseDate:'2026-10-02',amount:30,currency:'SGD',linkedCardId:source.id},{id:'outside',name:'Outside',expenseDate:'2026-09-01',linkedCardId:source.id},{id:'different-card',expenseDate:'2026-10-01',linkedCardId:'other'}] as any;
  const result = reconcileCsv(rows,source,expenses,[],[]); assert.deepEqual(recordedExpensesNotInCsv(result,source,expenses).map(expense=>expense.id),['extra']);
  assert.deepEqual(recordedExpensesNotInCsv([],source,expenses),[]);
});
