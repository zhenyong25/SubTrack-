import type { PokerCashSession, PokerMttBankrollTransaction, PokerMttTournament } from '../types';
import { buyInPerEntry, inRange, isInTheMoney, rangeStart, sessionProfit, tournamentProfit, type PokerRange } from './pokerService';

export type PokerResultFilter = 'all' | 'winning' | 'losing' | 'even' | 'itm' | 'missed';
export type PokerSort = 'newest' | 'oldest' | 'profit-high' | 'profit-low';
export interface PokerFilters { search: string; result: PokerResultFilter; sort: PokerSort; format?: 'all' | 'bounty' | 'regular'; buyIn?: 'all' | 'micro' | 'low' | 'higher'; game?: string; venue?: string }
const text = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const matches = (query: string, fields: unknown[]) => { const combined=text(fields.filter(value=>value!==undefined&&value!==null).join(' ')); return text(query).split(/\s+/).filter(Boolean).every(word=>combined.includes(word)); };
const resultMatches = (profit: number, result: PokerResultFilter) => result === 'winning' ? profit > 0.005 : result === 'losing' ? profit < -0.005 : result === 'even' ? Math.abs(profit) <= 0.005 : true;
function sorter<T extends {id:string}>(sort: PokerSort, date: (item:T)=>string, profit:(item:T)=>number) { return (a:T,b:T) => (sort==='profit-high'?profit(b)-profit(a):sort==='profit-low'?profit(a)-profit(b):sort==='oldest'?date(a).localeCompare(date(b)):date(b).localeCompare(date(a))) || a.id.localeCompare(b.id); }
export function filterPokerTournaments(rows: PokerMttTournament[], range: PokerRange, today: string, filters: PokerFilters) {
  return rows.filter(row=> {
    const bounty=Boolean(row.isBounty||row.bountyUsd>0);const buyIn=buyInPerEntry(row);
    return inRange(row.tournamentDate,range,today) && matches(filters.search,[row.tournamentName,row.notes,row.tournamentDate]) && resultMatches(tournamentProfit(row),filters.result)
      && (filters.result!=='itm'||isInTheMoney(row)) && (filters.result!=='missed'||!isInTheMoney(row))
      && (!filters.format||filters.format==='all'||(filters.format==='bounty'?bounty:!bounty))
      && (!filters.buyIn||filters.buyIn==='all'||(filters.buyIn==='micro'?buyIn<=5:filters.buyIn==='low'?buyIn>5&&buyIn<=20:buyIn>20));
  }).sort(sorter(filters.sort,row=>row.tournamentDate,tournamentProfit));
}
export function filterPokerSessions(rows: PokerCashSession[], range: PokerRange, today: string, filters: PokerFilters) {
  return rows.filter(row=>inRange(row.sessionDate,range,today)&&matches(filters.search,[row.game,row.venue,row.notes,row.sessionDate])&&resultMatches(sessionProfit(row),filters.result)&&(!filters.game||row.game===filters.game)&&(!filters.venue||row.venue===filters.venue)).sort(sorter(filters.sort,row=>row.sessionDate,sessionProfit));
}
export function filterPokerEvents(rows: PokerMttBankrollTransaction[], range: PokerRange, today: string, search: string, type: string, sort: 'newest'|'oldest') {
  return rows.filter(row=>inRange(row.eventDate,range,today)&&(!type||row.eventType===type)&&matches(search,[row.eventType,row.notes,row.currency,row.amount,row.amountUsd,row.eventDate])).sort(sorter(sort,row=>row.eventDate,row=>row.amountUsd));
}

export interface BankrollPoint { date: string; balance: number; deposits: number; withdrawals: number; results: number }
/** A dated ledger balance. Filtering the window never drops money recorded before it. */
export function pokerBankrollHistory(events: PokerMttBankrollTransaction[], tournaments: PokerMttTournament[], sessions: PokerCashSession[], range: PokerRange, today: string) {
  const days=new Map<string,{deposits:number;withdrawals:number;results:number}>();const round=(value:number)=>Math.round(value*100)/100;
  const add=(date:string,kind:'deposits'|'withdrawals'|'results',amount:number)=>{const day=date.slice(0,10);if(day>today)return;const row=days.get(day)||{deposits:0,withdrawals:0,results:0};row[kind]=round(row[kind]+amount);days.set(day,row);};
  events.forEach(event=>add(event.eventDate,event.eventType==='Deposit'?'deposits':event.eventType==='Withdrawal'?'withdrawals':'results',event.amountUsd));
  tournaments.forEach(row=>add(row.tournamentDate,'results',tournamentProfit(row)));sessions.forEach(row=>add(row.sessionDate,'results',sessionProfit(row)));
  const start=rangeStart(range,today);let balance=0;let opening=0;const points:BankrollPoint[]=[];
  for(const [date,row] of [...days.entries()].sort(([a],[b])=>a.localeCompare(b))){balance=round(balance+row.deposits-row.withdrawals+row.results);if(start&&date<start){opening=balance;continue;}points.push({date,balance,...row});}
  if(start&&(!points.length||points[0].date>start))points.unshift({date:start,balance:opening,deposits:0,withdrawals:0,results:0});
  if(points.length&&points.at(-1)!.date<today)points.push({date:today,balance,deposits:0,withdrawals:0,results:0});
  return {opening,closing:balance,points};
}
