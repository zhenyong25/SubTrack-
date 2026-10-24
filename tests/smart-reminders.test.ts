import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartReminders, reminderDayOffset, type ReminderInput } from '../services/smartReminderService';
import { readReminderActions, reminderIsHidden, reminderStorageKey, restoreReminderActions, saveReminderAction } from '../services/reminderPreferenceService';
const base = (): ReminderInput => ({ today:'2026-10-24',days:3,subscriptions:[],loans:[],payments:[],goals:[],entries:[] });
const bill = {id:'bill',name:'Bill',price:10,currency:'SGD',status:'Active',billingCycle:'Monthly',firstPaymentDate:'2026-01-24',nextPaymentDate:'2026-11-24'} as any;
const store=new Map<string,string>();const setItem=(key:string,value:string)=>{store.set(key,value);};
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>store.get(key)??null,setItem,removeItem:(key:string)=>store.delete(key)}});
test('same-day bills remain visible even when the next date has already rolled forward',()=>{
 const input=base();input.subscriptions=[bill];const result=buildSmartReminders(input);assert.equal(result.reminders[0].dueDate,input.today);assert.equal(result.reminders[0].days,0);assert.equal(result.reminders[0].amount,10);
});
test('monthly dates clamp correctly and only the next occurrence is shown per subscription',()=>{
 const input=base();input.today='2026-02-27';input.days=30;input.subscriptions=[{...bill,firstPaymentDate:'2026-01-31'},{...bill,id:'daily',billingCycle:'Daily',firstPaymentDate:'2026-02-01'}];
 const result=buildSmartReminders(input);assert.equal(result.reminders.length,2);assert.equal(result.reminders.find(item=>item.sourceId==='bill')?.dueDate,'2026-02-28');
});
test('trial expiry stays visible after its date and never appears twice as a paid bill',()=>{
 const input=base();input.subscriptions=[{...bill,id:'trial',billingCycle:'Free Trial',firstPaymentDate:'2026-10-22',nextPaymentDate:'2026-10-22'}];const result=buildSmartReminders(input);assert.equal(result.reminders.length,1);assert.equal(result.reminders[0].kind,'trial');assert.equal(result.reminders[0].days,-2);
});
test('past, cancelled, free and out-of-window subscriptions do not create bill reminders',()=>{
 const input=base();input.subscriptions=[{...bill,status:'Past'},{...bill,id:'cancelled',cancellationDate:'2026-10-20'},{...bill,id:'free',price:0},{...bill,id:'outside',firstPaymentDate:'2026-01-30'}];assert.equal(buildSmartReminders(input).reminders.length,0);
});
test('debt reminders ignore future payments and statements and include overdue amounts',()=>{
 const input=base();input.loans=[{id:'loan',name:'Loan',principal:1000,annualRate:0,interestMethod:'Reducing',startDate:'2026-09-01',paymentDay:15,instalment:100,currency:'SGD'}] as any;input.payments=[{id:'future',loanId:'loan',paymentDate:'2026-10-25',amount:1000},{id:'statement',loanId:'loan',paymentDate:'2026-10-26',entryType:'statement',amount:0}] as any;
 const result=buildSmartReminders(input);assert.equal(result.reminders.length,1);assert.equal(result.reminders[0].days,-39);assert.equal(result.reminders[0].amount,200);
 input.payments.push({id:'paid',loanId:'loan',paymentDate:'2026-10-24',amount:1000} as any);assert.equal(buildSmartReminders(input).reminders.length,0);
});
test('goal reminders use remaining funding and disappear when funded or undated',()=>{
 const input=base();input.goals=[{id:'g',name:'Goal',targetAmount:100,openingBalance:20,currency:'SGD',targetDate:'2026-10-23',kind:'Savings'},{id:'funded',name:'Funded',targetAmount:100,openingBalance:100,targetDate:'2026-10-24'},{id:'undated',targetAmount:100,openingBalance:0}] as any;
 let result=buildSmartReminders(input);assert.equal(result.reminders.length,1);assert.equal(result.reminders[0].amount,80);input.entries=[{goalId:'g',amount:80,direction:'Contribution'}] as any;result=buildSmartReminders(input);assert.equal(result.reminders.length,0);
});
test('reminders sort by actual due date and malformed records do not hide good records',()=>{
 const input=base();input.subscriptions=[bill,{...bill,id:'bad',name:'Bad bill',firstPaymentDate:'bad',nextPaymentDate:'bad'}];input.loans=[{id:'bad',name:'Bad loan',startDate:'bad'}] as any;input.goals=[{id:'g',name:'Older goal',targetAmount:100,openingBalance:0,targetDate:'2026-10-01',currency:'SGD'}] as any;
 const result=buildSmartReminders(input);assert.equal(result.reminders[0].sourceId,'g');assert.equal(result.reminders.length,2);assert.equal(result.warnings.length,2);
});
test('occurrence IDs change on the next billing or funding cycle',()=>{
 const input=base();input.subscriptions=[bill];const first=buildSmartReminders(input).reminders[0].id;input.today='2026-11-24';const second=buildSmartReminders(input).reminders[0].id;assert.notEqual(first,second);
 input.goals=[{id:'g',name:'Fund',targetAmount:100,openingBalance:0,currency:'SGD',kind:'Sinking fund',targetDate:'2026-11-24'}] as any;const goalId=buildSmartReminders(input).reminders.find(item=>item.kind==='goal')!.id;input.goals[0].targetDate='2026-11-25';assert.notEqual(buildSmartReminders(input).reminders.find(item=>item.kind==='goal')!.id,goalId);
});
test('snoozes survive reload and expire on the requested local-calendar day',()=>{
 store.clear();let actions=saveReminderAction('owner-a','bill:a:2026-10-24',{action:'snooze',until:'2026-10-25',updatedAt:'2026-10-24'});assert.equal(reminderIsHidden('bill:a:2026-10-24',actions,'2026-10-24'),true);actions=readReminderActions('owner-a');assert.equal(reminderIsHidden('bill:a:2026-10-24',actions,'2026-10-25'),false);assert.equal(reminderDayOffset('2026-12-31',1),'2027-01-01');assert.equal(reminderDayOffset('2024-02-28',1),'2024-02-29');
});
test('dismissals are owner-scoped, occurrence-scoped and reversible',()=>{
 store.clear();let actions=saveReminderAction('owner-a','bill:a:2026-10-24',{action:'dismiss',updatedAt:'2026-10-24'});assert.equal(reminderIsHidden('bill:a:2026-10-24',actions,'2026-10-24'),true);assert.equal(reminderIsHidden('bill:a:2026-11-24',actions,'2026-11-24'),false);assert.equal(reminderIsHidden('bill:a:2026-10-24',readReminderActions('owner-b'),'2026-10-24'),false);
 actions=saveReminderAction('owner-a','bill:a:2026-10-24',null);assert.equal(reminderIsHidden('bill:a:2026-10-24',actions,'2026-10-24'),false);saveReminderAction('owner-a','trial:t:2026-10-24',{action:'dismiss',updatedAt:'2026-10-24'});restoreReminderActions('owner-a');assert.equal(Object.keys(readReminderActions('owner-a')).length,0);
});
test('storage and validation failures never report a hidden reminder as saved',()=>{
 store.clear();saveReminderAction('a','original',{action:'dismiss',updatedAt:'2026-10-24'});const before=store.get(reminderStorageKey('a'));localStorage.setItem=()=>{throw new Error('Storage full');};assert.throws(()=>saveReminderAction('a','new',{action:'dismiss',updatedAt:'2026-10-24'}),/Storage full/);assert.equal(store.get(reminderStorageKey('a')),before);localStorage.setItem=setItem;
 assert.throws(()=>saveReminderAction('a','new',{action:'snooze',until:'2026-10-24',updatedAt:'2026-10-24'}));store.set(reminderStorageKey('bad'),'not json');assert.throws(()=>readReminderActions('bad'));assert.throws(()=>readReminderActions(''));
});
test('sequential actions preserve other tabs changes and bounded storage retains the newest action',()=>{
 store.clear();saveReminderAction('a','one',{action:'dismiss',updatedAt:'2026-10-24'});saveReminderAction('a','two',{action:'dismiss',updatedAt:'2026-10-24'});assert.equal(Object.keys(readReminderActions('a')).length,2);
 const actions=Object.fromEntries(Array.from({length:500},(_,index)=>[`old:${index}`,{action:'dismiss',updatedAt:'2026-10-24'}]));store.set(reminderStorageKey('a'),JSON.stringify({version:1,actions}));const saved=saveReminderAction('a','newest',{action:'dismiss',updatedAt:'2026-10-24'});assert.equal(Object.keys(saved).length,500);assert.equal(saved.newest.action,'dismiss');
});
