import test from 'node:test';import assert from 'node:assert/strict';
import {filterPokerEvents,filterPokerSessions,filterPokerTournaments,pokerBankrollHistory,type PokerFilters} from '../services/pokerDashboardService';
import type {PokerCashSession,PokerMttBankrollTransaction,PokerMttTournament} from '../types';
const filters:PokerFilters={search:'',result:'all',sort:'newest',format:'all',buyIn:'all'};
const tournaments:PokerMttTournament[]=[
 {id:'a',investmentId:'p',tournamentDate:'2026-10-01',tournamentName:'Sunday Bounty',entries:2,buyInUsd:20,cashoutUsd:5,bountyUsd:5,isBounty:true},
 {id:'b',investmentId:'p',tournamentDate:'2026-10-02',tournamentName:'Daily Micro',entries:2,buyInUsd:8,cashoutUsd:0,bountyUsd:20,isBounty:true,notes:'Online table'},
 {id:'c',investmentId:'p',tournamentDate:'2026-10-03',tournamentName:'Sunday Regular',entries:1,buyInUsd:30,cashoutUsd:30,bountyUsd:0},
];
const sessions:PokerCashSession[]=[{id:'s1',investmentId:'p',sessionDate:'2026-10-01',game:'NLH 1/2',venue:'Club',buyInUsd:100,cashOutUsd:150,durationHours:2},{id:'s2',investmentId:'p',sessionDate:'2026-10-02',game:'PLO',venue:'Online',buyInUsd:100,cashOutUsd:80,durationHours:1}];
const events:PokerMttBankrollTransaction[]=[{id:'deposit',investmentId:'p',eventDate:'2026-09-01',eventType:'Deposit',amountUsd:200},{id:'withdrawal',investmentId:'p',eventDate:'2026-10-04',eventType:'Withdrawal',amountUsd:25},{id:'adjustment',investmentId:'p',eventDate:'2026-10-05',eventType:'Adjustment',amountUsd:-2,notes:'Fee correction'}];
test('tournament result and ITM filters remain distinct; bounty-only winnings are not ITM',()=>{
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,result:'winning'}).map(row=>row.id),['b']);
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,result:'itm'}).map(row=>row.id),['c','a']);
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,result:'missed'}).map(row=>row.id),['b']);
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,result:'even'}).map(row=>row.id),['c']);
});
test('format, per-entry buy-in, and search filters combine without modifying source data',()=>{
 const original=tournaments.map(row=>row.id);const result=filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,format:'bounty',buyIn:'micro',search:'daily online'});assert.deepEqual(result.map(row=>row.id),['b']);assert.deepEqual(tournaments.map(row=>row.id),original);
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,buyIn:'low'}).map(row=>row.id),['a']);assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,format:'regular'}).map(row=>row.id),['c']);
});
test('result sorting uses actual profit, with stable ordering',()=>{
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,sort:'profit-high'}).map(row=>row.id),['b','c','a']);
 assert.deepEqual(filterPokerTournaments(tournaments,'all','2026-10-25',{...filters,sort:'profit-low'}).map(row=>row.id),['a','c','b']);
});
test('cash filters use game, venue, search and outcomes together',()=>{
 assert.deepEqual(filterPokerSessions(sessions,'all','2026-10-25',{...filters,game:'PLO',venue:'Online',result:'losing',search:'plo online'}).map(row=>row.id),['s2']);
 assert.equal(filterPokerSessions(sessions,'all','2026-10-25',{...filters,game:'PLO',venue:'Club'}).length,0);
});
test('date windows exclude old and future results while retaining their endpoints',()=>{
 const rows=[...sessions,{...sessions[0],id:'old',sessionDate:'2026-09-25'},{...sessions[0],id:'boundary',sessionDate:'2026-09-26'},{...sessions[0],id:'future',sessionDate:'2026-10-26'}];
 assert.deepEqual(filterPokerSessions(rows,'30d','2026-10-25',filters).map(row=>row.id),['s2','s1','boundary']);
});
test('bankroll ledger includes opening money from before the selected window',()=>{
 const result=pokerBankrollHistory(events,tournaments,sessions,'30d','2026-10-25');assert.equal(result.opening,200);assert.equal(result.closing,205);assert.equal(result.points[0].balance,200);assert.equal(result.points.at(-1)!.balance,205);assert.equal(result.points.at(-1)!.date,'2026-10-25');
 const all=pokerBankrollHistory(events,tournaments,sessions,'all','2026-10-25');assert.equal(all.opening,0);assert.equal(all.closing,result.closing);
});
test('bankroll log filtering cannot change the actual balance series',()=>{
 const filtered=filterPokerEvents(events,'all','2026-10-25','fee','Adjustment','newest');assert.deepEqual(filtered.map(row=>row.id),['adjustment']);
 const result=pokerBankrollHistory(events,tournaments,sessions,'all','2026-10-25');assert.equal(result.closing,205);
});
test('ledger ignores future activity and carries a prior balance across an empty window',()=>{
 const result=pokerBankrollHistory([...events,{...events[0],id:'future',eventDate:'2027-01-01',amountUsd:9999}],[],[],'30d','2026-12-01');assert.equal(result.opening,173);assert.equal(result.closing,173);assert.equal(result.points.length,2);assert.ok(result.points.every(point=>point.balance===173));
});
test('daily ledger arithmetic is rounded to cents and deterministic for same-day entries',()=>{
 const small=[{...events[0],amountUsd:0.1},{...events[0],id:'other',amountUsd:0.2}];assert.equal(pokerBankrollHistory(small,[],[],'all','2026-10-25').closing,0.3);
 assert.deepEqual(pokerBankrollHistory([],[],[],'all','2026-10-25').points,[]);
});
