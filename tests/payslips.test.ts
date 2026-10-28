import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePayslip, listPayslips, readPayslip, uploadPayslip, validatePayslip } from '../services/payslipService';
import { state } from './payslipStorageMock';

test('rejects unsupported, empty, oversized files and invalid months', () => {
  for (const [file, month] of [
    [{ type: 'text/html', size: 100 }, '2026-10'],
    [{ type: 'application/pdf', size: 0 }, '2026-10'],
    [{ type: 'application/pdf', size: 10485761 }, '2026-10'],
    [{ type: 'application/pdf', size: 100 }, '2026-13'],
  ] as const) assert.throws(() => validatePayslip(file, month));
  assert.doesNotThrow(() => validatePayslip({ type: 'application/pdf', size: 10485760 }, '2026-10'));
});
test('uploads, reloads and removes an owner-scoped payslip', async () => {
  const file = new File(['salary'], 'October payslip.pdf', { type: 'application/pdf' });
  const slip = await uploadPayslip(file, '2026-10');
  assert.ok(slip.path.startsWith('owner/payslips/2026-10_'));
  assert.deepEqual(await listPayslips(), [slip]);
  assert.equal(await (await readPayslip(slip)).text(), 'salary');
  await assert.rejects(() => readPayslip({ ...slip, path: 'someone-else/payslips/file' }));
  await assert.rejects(() => deletePayslip({ ...slip, path: 'someone-else/payslips/file' }));
  state.failDelete = true;
  await assert.rejects(() => deletePayslip(slip), /Could not delete/);
  assert.equal((await listPayslips()).length, 1);
  state.failDelete = false;
  await deletePayslip(slip);
  assert.deepEqual(await listPayslips(), []);
});
