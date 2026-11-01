import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventPage, resolveDate } from '../server/pokemonEvents';
import { eventGroup, eventIcs, filterEvents, mergeEvents, whenRange } from '../services/pokemonEventService';
import { matchSellers, nextStatus, normaliseExtras, submissionSummary, submissionTiming, type CardSubmission, type FlaggedSeller } from '../services/pokemonExtrasService';

const item = (id: string, date: string, time: string, title: string, organizer: string, place: string, tagClass = 'bg-yellow ') => `
  <a class="eventLink" href="/sg/event-search/${id}/"> <li class="event"> <div class="leftColumn"> <time class="eventDate">${date}</time>
  <p class="eventTime">${time}</p> <p class="eventTag ${tagClass}">Earnest Battle</p> </div> <div class="rightColumn">
  <p class="formatAndLeague"> / Open</p> <p class="eventTitle">${title} </p> <div class="eventImage"><img src="x" alt=""></div>
  <p class="organizer"><object><a href="/sg/event-search/search/?keyword=${organizer}">${organizer}</a></object></p> <p class="place">${place}</p> </div> </li> </a>`;
const page = (items: string, pages = 15, total = 295) => `<p class="resultNumber">${total}</p><p class="resultTotalPages">&nbsp;/ ${pages}pages</p><ul class="eventList">${items}</ul>`;

test('works out the year of MM-DD dates from the list start', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  assert.equal(resolveDate('11-01', start), '2026-11-01');
  assert.equal(resolveDate('12-31', start), '2026-12-31');
  assert.equal(resolveDate('01-15', start), '2027-01-15'); // after New Year
  assert.equal(resolveDate('13-01', start), null);
  assert.equal(resolveDate('soon', start), null);
});

test('reads official events from a search page', () => {
  const { events, pages, total } = parseEventPage(page([
    item('8876', '11-01', '14:00-16:00', 'Pokémon TCG GYM Battle - November 2026', 'Carito trading', 'Blk 254A serangoon center Dr #01-177'),
    item('8512', '11-01', '10:00-18:00', '2026-27 Singapore Ultra Ball League', 'Maxsoft', 'Refer to venue address', 'bg-yellow official'),
    item('9000', '01-03', '15:00-19:00', 'ME06 Build &amp; Battle Box Pre-Release', 'KouritenSG', 'Fook Hai Building, #B1-22'),
    '<a class="eventLink" href="/sg/event-search/1/"><li class="event"><p class="eventTitle">No date</p></li></a>',
  ].join('')), new Date('2026-11-01T00:00:00Z'));
  assert.equal(pages, 15);
  assert.equal(total, 295);
  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    id: '8876', date: '2026-11-01', time: '14:00-16:00', category: 'Earnest Battle', official: false, format: 'Open',
    title: 'Pokémon TCG GYM Battle - November 2026', organizer: 'Carito trading', place: 'Blk 254A serangoon center Dr #01-177',
    url: 'https://asia.pokemon-card.com/sg/event-search/8876/',
  });
  assert.equal(events[1].official, true);
  assert.equal(events[2].title, 'ME06 Build & Battle Box Pre-Release');
  assert.equal(events[2].date, '2027-01-03');
});

test('groups events by title', () => {
  assert.equal(eventGroup('Pokémon TCG GYM Battle - November 2026'), 'GYM Battle');
  assert.equal(eventGroup('ME06 Build & Battle Box Pre-Release'), 'Release events');
  assert.equal(eventGroup('ME06 New Expansion'), 'Release events');
  assert.equal(eventGroup('2026-27 Singapore Great Ball League Season 2'), 'League');
  assert.equal(eventGroup("Beginner's Session - November 2026"), 'Beginners');
  assert.equal(eventGroup('Something else'), 'Other');
});

test('date ranges for the when filters', () => {
  assert.deepEqual(whenRange('today', '2026-11-04'), ['2026-11-04', '2026-11-04']);
  assert.deepEqual(whenRange('week', '2026-11-04'), ['2026-11-04', '2026-11-10']);
  assert.deepEqual(whenRange('weekend', '2026-11-04'), ['2026-11-07', '2026-11-08']); // Wednesday → Sat–Sun
  assert.deepEqual(whenRange('weekend', '2026-11-07'), ['2026-11-07', '2026-11-08']); // Saturday
  assert.deepEqual(whenRange('weekend', '2026-11-08'), ['2026-11-08', '2026-11-08']); // Sunday
});

test('merges your events with the official ones and filters them', () => {
  const official = [
    { id: '1', date: '2026-11-07', time: '14:00-16:00', category: 'Earnest Battle', official: false, format: 'Open', title: 'Pokémon TCG GYM Battle - November 2026', organizer: 'Rowell TCG', place: '*SCAPE', url: 'https://x/1' },
    { id: '2', date: '2026-11-20', time: '15:00-19:00', category: 'Earnest Battle', official: false, format: 'Standard / Open', title: 'ME06 New Expansion', organizer: 'KouritenSG', place: 'Fook Hai', url: 'https://x/2' },
  ];
  const mine = [{ id: 'a', kind: 'Card show' as const, title: 'Singapore Card Show', date: '2026-11-07', time: '10:00-18:00', place: 'Suntec', url: '', notes: 'S$5 entry' }];
  const all = mergeEvents(official, mine);
  assert.deepEqual(all.map(event => event.title), ['Singapore Card Show', 'Pokémon TCG GYM Battle - November 2026', 'ME06 New Expansion']);
  assert.equal(all[0].group, 'Your events');
  assert.equal(all[0].label, 'Card show');
  const base = { query: '', groups: [], when: 'all' as const, today: '2026-11-04' };
  assert.equal(filterEvents(all, { ...base, when: 'weekend' }).length, 2);
  assert.deepEqual(filterEvents(all, { ...base, groups: ['Release events'] }).map(event => event.id), ['2']);
  assert.deepEqual(filterEvents(all, { ...base, query: 'rowell' }).map(event => event.id), ['1']);
  assert.equal(filterEvents(all, { ...base, today: '2026-11-08' }).length, 1); // past events drop off
});

test('calendar files use Singapore time converted to UTC', () => {
  const [event] = mergeEvents([{ id: '8876', date: '2026-11-01', time: '14:00-16:00', category: '', official: false, format: 'Open', title: 'GYM Battle, November', organizer: 'Carito trading', place: 'Blk 254A; Serangoon', url: 'https://x/8876' }], []);
  const ics = eventIcs(event, new Date('2026-10-31T12:00:00Z'));
  assert.match(ics, /DTSTART:20261101T060000Z\r\n/);
  assert.match(ics, /DTEND:20261101T080000Z\r\n/);
  assert.match(ics, /SUMMARY:GYM Battle\\, November @ Carito trading\r\n/);
  assert.match(ics, /LOCATION:Blk 254A\\; Serangoon\r\n/);
  const [allDay] = mergeEvents([], [{ id: 'b', kind: 'Meetup', title: 'Trade night', date: '2026-12-31', time: '', place: '', url: '', notes: '' }]);
  assert.match(eventIcs(allDay), /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
});

const submission = (extra: Partial<CardSubmission>): CardSubmission => ({
  id: crypto.randomUUID(), card: 'Charizard', service: 'Grading', provider: 'PSA', sentDate: '', expectedDate: '', returnedDate: '', status: 'Preparing',
  cost: null, currency: 'SGD', tracking: '', result: '', notes: '', ...extra,
});

test('grading & repair summary and timing', () => {
  const items = [
    submission({ status: 'In progress', sentDate: '2026-09-01', expectedDate: '2026-10-15', cost: 40 }),
    submission({ status: 'Returned', sentDate: '2026-06-01', returnedDate: '2026-07-01', cost: 60 }),
    submission({ status: 'Returned', sentDate: '2026-07-01', returnedDate: '2026-07-21', cost: 20, currency: 'USD' }),
  ];
  const summary = submissionSummary(items);
  assert.equal(summary.active, 1);
  assert.equal(summary.returned, 2);
  assert.equal(summary.averageDays, 25);
  assert.deepEqual(summary.spent, [{ currency: 'SGD', amount: 100 }, { currency: 'USD', amount: 20 }]);
  assert.deepEqual(submissionTiming(items[0], '2026-11-01'), { out: 61, overdue: 17 });
  assert.equal(submissionTiming(items[1], '2026-11-01'), null);
  assert.equal(nextStatus('Preparing'), 'Sent');
  assert.equal(nextStatus('Shipped back'), 'Returned');
  assert.equal(nextStatus('Returned'), null);
});

test('scam watch matches names, handles, links and phone numbers', () => {
  const sellers: FlaggedSeller[] = [
    { id: '1', name: 'Ah Beng Cards', platform: 'Carousell', handle: '@benG_tcg', contact: '+65 9123 4567', reason: 'Took deposit', date: '2026-10-01', amountLost: 200, currency: 'SGD', evidenceUrl: '', reportRef: '' },
    { id: '2', name: '', platform: 'Facebook', handle: 'https://www.facebook.com/fake.seller', contact: '', reason: '', date: '2026-09-01', amountLost: null, currency: 'SGD', evidenceUrl: '', reportRef: '' },
  ];
  assert.deepEqual(matchSellers(sellers, 'beng_tcg').map(s => s.id), ['1']);
  assert.deepEqual(matchSellers(sellers, '9123 4567').map(s => s.id), ['1']);
  assert.deepEqual(matchSellers(sellers, '91234567').map(s => s.id), ['1']);
  assert.deepEqual(matchSellers(sellers, 'facebook.com/fake.seller').map(s => s.id), ['2']);
  assert.deepEqual(matchSellers(sellers, 'ab'), []); // too short to be meaningful
  assert.deepEqual(matchSellers(sellers, 'nobody here'), []);
});

test('saved records are normalised', () => {
  assert.deepEqual(normaliseExtras(null), { submissions: [], sellers: [], events: [] });
  assert.deepEqual(normaliseExtras({ submissions: 'x', sellers: [{ id: 'a' }] }), { submissions: [], sellers: [{ id: 'a' }], events: [] });
});
