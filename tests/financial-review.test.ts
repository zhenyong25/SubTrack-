import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialReview, comparisonPeriod, reviewBalances, reviewPeriod, type ReviewInput } from '../services/financialReviewService';
const base = (): ReviewInput => ({ today: '2026-10-24', month: '2026-10', currency: 'SGD', cardCurrency: 'SGD', accounts: [], balances: [], incomes: [], expenses: [], subscriptions: [], holdings: [], valuations: [], funds: [], retirement: [], loans: [], payments: [], cards: [], convert: amount => amount });

test('current reviews compare equivalent elapsed days and full months compare full months', () => {
  assert.deepEqual(reviewPeriod('2026-10','2026-10-24'),{start:'2026-10-01',end:'2026-10-24',partial:true});
  assert.deepEqual(comparisonPeriod(reviewPeriod('2026-10','2026-10-24')),{start:'2026-09-01',end:'2026-09-24',partial:true});
  assert.equal(comparisonPeriod(reviewPeriod('2026-03','2026-03-31')).end,'2026-02-28');
  assert.equal(comparisonPeriod(reviewPeriod('2024-03','2024-03-31')).end,'2024-02-29');
  assert.equal(comparisonPeriod(reviewPeriod('2026-09','2026-10-24')).end,'2026-08-31');
  assert.throws(()=>reviewPeriod('2026-11','2026-10-24')); assert.throws(()=>reviewPeriod('2026-13','2026-10-24')); assert.throws(()=>reviewPeriod('','2026-10-24'));
});
test('review separates one-time income from scheduled income and caps all movements at the endpoint', () => {
  const input=base(); input.incomes=[{id:'salary',name:'Salary',amount:3000,currency:'SGD',incomeMode:'Recurring',incomeCycle:'Monthly',firstIncomeDate:'2026-01-15',nextIncomeDate:'2026-11-15',status:'Active'}, {id:'bonus',name:'Bonus',amount:100,currency:'SGD',incomeMode:'One-time',incomeDate:'2026-10-10'}, {id:'future',amount:9999,currency:'SGD',incomeMode:'One-time',incomeDate:'2026-10-30'}] as any;
  input.expenses=[{id:'a',name:'Food',amount:300,currency:'SGD',expenseDate:'2026-10-10',category:'Food'},{id:'future',amount:5000,currency:'SGD',expenseDate:'2026-10-30',category:'Food'}] as any;
  input.subscriptions=[{id:'s',name:'Bill',price:50,currency:'SGD',firstPaymentDate:'2026-01-01',billingCycle:'Monthly',status:'Active',category:'Bills'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.current.income,3100);assert.equal(result.current.recurringIncome,3000);assert.equal(result.current.loggedIncome,100);assert.equal(result.current.spending,350);assert.equal(result.current.surplus,2750);assert.equal(result.current.savingsRate,2750/3100*100);
});
test('historical cancellations, yearly charges and weekly schedules are respected', () => {
  const input=base(); input.month='2026-09';
  input.subscriptions=[{id:'s',name:'Annual',price:120,currency:'SGD',firstPaymentDate:'2025-09-01',billingCycle:'Yearly',status:'Past',cancellationDate:'2026-09-15',category:'Software'}, {id:'later',name:'Cancelled',price:50,currency:'SGD',firstPaymentDate:'2025-01-20',billingCycle:'Monthly',status:'Past',cancellationDate:'2026-09-10',category:'Software'}] as any;
  input.incomes=[{id:'weekly',name:'Weekly',amount:100,currency:'SGD',incomeMode:'Recurring',incomeCycle:'Weekly',firstIncomeDate:'2026-09-01',status:'Past',cancellationDate:'2026-09-15'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.current.subscriptions,120);assert.equal(result.current.recurringIncome,300);assert.equal(result.previous.subscriptions,50);
});
test('month-end recurring dates recover after short months instead of drifting', () => {
  const input=base();input.month='2026-03';input.subscriptions=[{id:'s',name:'Month end',price:10,currency:'SGD',firstPaymentDate:'2026-01-31',billingCycle:'Monthly',status:'Active',category:'Other'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.current.subscriptions,10);assert.equal(result.previous.subscriptions,10);
});
test('zero income has no savings rate, deficits remain negative, and zero baselines avoid infinity', () => {
  const input=base(); input.expenses=[{id:'e',amount:100,currency:'SGD',expenseDate:'2026-10-01',category:'Food'}] as any;
  let result=buildFinancialReview(input);assert.equal(result.current.savingsRate,null);assert.equal(result.current.surplus,-100);assert.equal(result.spendingChangePercent,null);
  input.incomes=[{id:'i',amount:50,currency:'SGD',incomeMode:'One-time',incomeDate:'2026-10-01'}] as any;result=buildFinancialReview(input);assert.equal(result.current.savingsRate,-100);
});
test('category changes compare the same elapsed window and retain categories no longer spent on', () => {
  const input=base();input.expenses=[{id:'now',amount:20,currency:'SGD',expenseDate:'2026-10-01',category:'Food'}, {id:'prior',amount:10,currency:'SGD',expenseDate:'2026-09-01',category:'Travel'}, {id:'excluded',amount:500,currency:'SGD',expenseDate:'2026-09-25',category:'Travel'}] as any;
  const result=buildFinancialReview(input);assert.deepEqual(result.categories,[{name:'Food',current:20,previous:0,delta:20},{name:'Travel',current:0,previous:10,delta:-10}]);assert.equal(result.spendingChange,10);
});
test('net-worth comparisons require both snapshots and never backfill current holding prices', () => {
  const input=base();input.accounts=[{id:'a',name:'Bank',currency:'SGD'}] as any;input.balances=[{id:'now',accountId:'a',balanceDate:'2026-10-24',balance:5000}] as any;
  let result=buildFinancialReview(input);assert.equal(result.end.netWorth,5000);assert.equal(result.netWorthChange,null);
  input.balances.push({id:'prior',accountId:'a',balanceDate:'2026-09-30',balance:4000} as any);result=buildFinancialReview(input);assert.equal(result.netWorthChange,1000);
  input.holdings=[{id:'stock',name:'Stock',kind:'Stocks',isActive:true,currentPrice:1000,units:100,currency:'SGD'}] as any;result=buildFinancialReview(input);assert.equal(result.netWorthChange,null);assert.equal(result.end.assets,5000);assert.equal(result.end.missing[0].id,'investment:stock');
});
test('asset snapshots use recorded valuation currencies and retirement sub-account coverage', () => {
  const input=base();input.holdings=[{id:'s',name:'Stock',kind:'Stocks',isActive:true,currency:'SGD'}] as any;
  input.valuations=[{id:'v',investmentId:'s',valuationDate:'2026-10-01',marketValue:100,currency:'USD'},{id:'future',investmentId:'s',valuationDate:'2026-11-01',marketValue:9999,currency:'USD'}] as any;
  input.funds=[{id:'f',name:'CPF',currency:'SGD'}] as any;input.retirement=[{id:'oa',fundId:'f',subAccount:'OA',balanceDate:'2026-09-01',balance:500},{id:'sa',fundId:'f',subAccount:'SA',balanceDate:'2026-10-01',balance:200}] as any;
  input.convert=(amount,from)=>from==='USD'?amount*1.35:amount;
  const end=reviewBalances(input,'2026-10-24');assert.equal(end.assets,835);assert.equal(end.complete,true);assert.equal(end.stale.length,3);
  const prior=reviewBalances(input,'2026-09-30');assert.equal(prior.complete,false);assert.equal(prior.missing.length,2);
});
test('future loan payments and statements cannot alter a historical debt snapshot', () => {
  const input=base();input.loans=[{id:'l',name:'Loan',principal:1000,annualRate:0,interestMethod:'Reducing',startDate:'2026-09-01',currency:'SGD'}] as any;
  input.payments=[{id:'p',loanId:'l',paymentDate:'2026-10-10',amount:100},{id:'future',loanId:'l',paymentDate:'2026-11-01',amount:100},{id:'statement',loanId:'l',entryType:'statement',paymentDate:'2026-11-02',amount:5000}] as any;
  const result=buildFinancialReview(input);assert.equal(result.before.debt,1000);assert.equal(result.end.debt,900);assert.equal(result.debtReduction,100);assert.equal(result.current.debtPaid,100);assert.equal(result.netWorthChange,100);
});
test('opening debt balances dated after the comparison point block guessed debt reductions', () => {
  const input=base();input.loans=[{id:'l',name:'Loan',principal:10000,annualRate:0,interestMethod:'Reducing',startDate:'2025-01-01',openingBalance:5000,openingBalanceDate:'2026-10-01',currency:'SGD'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.debtReduction,null);assert.equal(result.before.debtComplete,false);assert.equal(result.end.debt,5000);
});
test('new borrowing is a debt increase and is not confused with debt repayments', () => {
  const input=base();input.loans=[{id:'l',name:'New loan',principal:1000,annualRate:0,interestMethod:'Reducing',startDate:'2026-10-01',currency:'SGD'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.debtReduction,-1000);assert.equal(result.current.debtPaid,0);assert.equal(result.before.debt,0);
});
test('linked cards count through loans only; undated card balances block historical comparisons', () => {
  const input=base();input.loans=[{id:'l',name:'Card debt',kind:'Credit card',cardId:'linked',principal:100,annualRate:0,interestMethod:'Reducing',startDate:'2026-09-01',currency:'SGD'}] as any;
  input.cards=[{id:'linked',name:'Linked',kind:'Credit',currentDebt:100},{id:'unlinked',name:'Unlinked',kind:'Credit',currentDebt:200}] as any;
  input.currency='USD';input.cardCurrency='SGD';input.convert=(amount,from,to)=>from===to?amount:amount/2;
  const result=buildFinancialReview(input);assert.equal(result.end.debt,150);assert.equal(result.end.rows.filter(row=>row.kind==='Debt').length,2);assert.equal(result.before.debtComplete,false);assert.equal(result.netWorthChange,null);
});
test('empty reviews and excluded sources do not fabricate historical zero net worth', () => {
  const input=base();input.accounts=[{id:'a',isArchived:true}] as any;input.holdings=[{id:'inactive',isActive:false},{id:'poker',isActive:true,kind:'Poker (MTT)'}] as any;input.funds=[{id:'f',isArchived:true}] as any;
  const result=buildFinancialReview(input);assert.equal(result.netWorthChange,null);assert.equal(result.trend.length,6);assert.ok(result.trend.every(point=>point.netWorth===null));assert.equal(result.end.rows.length,0);
});
test('unknown historical end dates and free trial renewals are disclosed', () => {
  const input=base();input.subscriptions=[{id:'s',name:'Trial',status:'Active',billingCycle:'Free Trial'},{id:'past',name:'Past bill',status:'Past'}] as any;
  input.incomes=[{id:'past-income',name:'Past income',status:'Past',incomeMode:'Recurring'}] as any;
  const result=buildFinancialReview(input);assert.equal(result.current.spending,0);assert.equal(result.current.income,0);assert.equal(result.warnings.length,3);
});
test('the earliest supported month still renders a bounded trend',()=>{
  const input=base();input.month='1900-01';const result=buildFinancialReview(input);assert.equal(result.trend.length,1);assert.equal(result.trend[0].month,'1900-01');
});
