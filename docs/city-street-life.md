# City street life

Residents now commute to their existing workplaces and visit operating shops, markets,
restaurants and public buildings. They approach the road-facing entrance, walk inside,
spend a short time indoors, emerge through the entrance and return home. Indoor residents
are hidden rather than drawn as an extra copy. Recreation visits use the same population
and street network.

Crossings are added automatically near junctions and building entrances. Residents use
pavements and marked crossings. Each crossing has vehicle red/amber/green lamps and a
separate pedestrian red/green light. A pedestrian request ends the vehicle green phase
after a minimum interval, allows committed vehicles to clear, then grants a walk phase.
Vehicles remain stopped until all pedestrians have finished crossing. Cars also queue
behind stopped cars and yield to pedestrians in their immediate path.

Crossing zones are spaced apart so a car can leave one before reaching the next.
Routes use only connected roads; isolated or unavailable buildings do not attract visits.
Pavements have continuous corner pieces at bends and junctions. Two passing lanes and
shared personal-space checks keep walkers apart on streets, crossings and entrance paths.
Residents wait for space before leaving a building, queue behind a stopped person and
step aside on walkable ground when meeting someone coming the other way. Junctions
reserve space for one vehicle at a time, so queued traffic can clear before a walk phase.
Each stopped car records what it waits for: a light, a pedestrian, or another car. When those
waits form a loop (around a block, on two-lane-wide roads, in road plazas, at dead ends), the
car that has waited longest drives through the other cars for about a second, which breaks the
loop. Cars caught inside a junction when its light turns red are let out the same way, since
the walk phase waits for them. Cars queueing at a red light or for a pedestrian are never let
through, and released cars still stop for signals and pedestrians.
Road edits, moved buildings, demolition and population changes release affected visits.
Pause and reduced motion freeze the simulation clock, visits and signal phases together.
These animations do not change saved city finances or building production.

Outdoor life also includes farmers working and driving compact tractors, cafe diners,
shopping, fishing, boat trips, schoolyards, concerts, maintenance and deliveries. See
[the building activity QA matrix](city-building-activity-qa.md) for coverage and checks.

Roadside bus and taxi pickups, passenger drop-offs and rubbish collection now use the
existing traffic and residents. See [roadside life](city-roadside-life.md) for stop placement,
the collection crew and regression checks.

Implementation:

- `components/city3d/streets.ts`: sidewalk graph, route trees, crossing reservations,
  signal phases and vehicle clearance checks.
- `components/city3d/buildingVisits.ts`: building visit lifecycle for existing residents.
- `components/city3d/trafficSignals.ts`: instanced signal models and lamp colours.
- `components/city3d/people.ts`, `recreation.ts`, `traffic.ts`: shared movement integration.
- `components/city3d/traffic.ts` (`resolveDeadlocks`): wait chains and deadlock release.

Validation: `npm run test:city`, `npm run build`, then
`npm run test:city:movement:browser`. The browser test needs Chrome/Chromium and uses a
temporary isolated profile. It captures desktop/mobile images under
`artifacts/city-expansion` and checks visits, crossings, stopping traffic, pause and removal.

## Road types and vehicles

The road tool has five kinds of road. Pick one, then drag. Dragging over an existing road
converts it: you pay the new kind's price less what the old surface is worth.

| Road | Cost | Unlocks | Traffic speed | Look |
| --- | ---: | ---: | ---: | --- |
| Street | 5 | 1 | 1× | Asphalt, centre line |
| Country lane | 3 | 1 | 0.8× | Gravel, grass verges |
| Cobbled lane | 12 | 3 | 0.6× | Setts, warm stone pavement |
| Avenue | 14 | 4 | 1.3× | Planted median with hedge and trees on straight stretches |
| Tram line | 20 | 5 | 1× | Rails in both lanes, curving with the track |

Saves store only non-street kinds, in `roadTypes` (tile index → kind). Older saves load
unchanged, and no database migration is needed.

Traffic is a mix of sedans, hatchbacks, SUVs, pickups, vans, taxis and buses
(`components/city3d/vehicleModels.ts`). Each model is two instanced meshes: per-vehicle paint
and fixed details. Buses call at bus stops, bus depots, interchanges and railway stations.
Taxis wait at taxi ranks and drop off at shops. Articulated two-section trams run only on
connected tram lines: one tram per 14 tiles of line, up to 6. They call at tram stops,
interchanges and railway stations. Vehicles pull in short of any junction box, so a waiting
bus never holds a light. Street rules take each vehicle's length and width into account, so a
bus stops further back from a crossing and keeps a bus-length gap.

Validation: `node scripts/test-city-game.mjs --vehicles` and
`npm run test:city:vehicles:browser`, which saves screenshots to
`artifacts/city-expansion/roads-*.png`.

## Airport, planes and helicopters

The **Airport** (Transport, level 8, 2,400 coins) fills a 4×4 plot. It has a runway with
edge lights, a taxiway, an apron with two gates, a glass terminal facing the road, a control
tower, a hangar, a helipad and a car park. Passengers queue outside with tickets, and residents
leave carrying suitcases. Its two airliners take turns. One taxis from its gate, accelerates
down the runway and lifts off. It climbs, turns back over the city, flies downwind, turns onto
final, lands, rolls out and taxis back to its gate. Wingtip lights and the beacon blink.

When a model is built, the game measures its roof. Rays are cast down over the roof of
every building taller than 14 m, looking for the highest spot that is flat for a rotor's width.
Each spot found gets a painted yellow ring and **H**. Spires, domes, cranes and the control
tower are left out. Helicopters (medical, police, news and a white-teal one) start their
rotors and lift straight up. They cruise above the tallest roof to a free helipad, descend
gently and land. After a short wait they fly on. There is one helicopter for every three
helipads, up to six, once there are two places to fly between. A high airliner also crosses
the sky every 75 seconds or so on a different line, over any city.

Planes follow a timetable of the animation clock, so pausing freezes them mid-air.
Helicopters pause too. See `components/city3d/aviation.ts`; roof measurement is
`findRoofPad` in `models.ts`. Validation: `node scripts/test-city-game.mjs --aviation` and
`npm run test:city:aviation:browser`.

### Flying passengers

Passengers are existing residents on ordinary visits, borrowed for the journey
(`components/city3d/flights.ts`), the same way bus and taxi riders are.

- **Helicopter:** each building with a rooftop helipad is a destination. A resident walks to
  its front door and takes the lift (out of sight for a few seconds). They come up through the
  grey roof hatch beside the **H** and wait there, checking their phone. A helicopter heading
  out picks a roof where someone is waiting. When it lands, the rotors slow and it holds on
  the pad while up to two people walk over and climb in. They ride out of sight. At the next
  pad they climb out and go down that building's hatch. They come out of its front door onto
  its street and carry on. If no helicopter comes within about 75 seconds, they take the lift
  back down and go home.
- **Airport:** residents queue outside the terminal with tickets. When the plane whose turn it
  is waits at its gate (now 16 seconds), up to four of them go through the terminal. They come
  out of its apron door, cross to the plane and climb the airstairs. Anyone still walking when
  the doors close hurries aboard. They ride the full circuit. After the plane is back at its
  gate they come down the stairs and go back through the terminal. They leave with their
  luggage.

Pausing freezes passengers mid-step. Validation: `node scripts/test-city-game.mjs --flights`.

## Bus stops and taxi stands on the pavement

The **Stops** tool in the Build bar puts a stop on a road's pavement, so it takes no land.
Pick **Bus stop** (45 coins) or **Taxi stand** (35 coins), both from level 2, then tap a road
tile. The stop goes on that tile's first free pavement side. Tap again to put one on the other
side of the street. Bulldozing a tile removes its stop before the road. Removing the road
takes its stops with it, with refunds.

- **Bus stop:** a glass shelter with a roof and bench, and a blue sign.
- **Taxi stand:** a yellow sign, a bench and yellow kerb markings on the road edge.

Residents walk along the pavement to a stop and queue under the shelter, checking their
phones, with the odd suitcase. Each stop is served by traffic driving with that kerb on its
left, as cars drive on the left. Buses call at bus stops on their routes; taxis wait at
stands for a fare. When one pulls in, the people waiting walk to its door and get in. They
ride out of sight and get out at another stop, using the same passenger system as bus and taxi
stop buildings (`roadside.ts`).

Stops are saved as `stops` (road tile, kind and side); older saves load unchanged. See
`components/city3d/streetStops.ts`. Validation: `node scripts/test-city-game.mjs --stops` and
`npm run test:city:stops:browser`.

## Lit windows follow who is inside

At night a building's windows light up according to the people actually inside it
(`components/city3d/windowLights.ts`, and `Pedestrians.occupancy` in `people.ts`). A building
is lit roughly in proportion to its residents and staff (plus a few visitors) who are inside;
anyone inside lights at least a few windows, and an empty building is dark.

- **Homes:** a resident counts as home unless they are out walking, at a facility, in a shop or
  travelling. When they leave, their windows go dark; when they come back, they light again.
- **Workplaces:** by day everyone with a job counts at work. At night most of them go home and
  one in five works the night shift, so offices show a few lit floors.
- **Visitors** inside a shop, office or public building count there.

Each building has its own random order of windows, so windows switch on one by one as people
arrive rather than whole floors at once. Windows are refreshed twice a second.

This also fixes windows that never lit when the city was opened at night: building materials
created after night fell now glow as well. Validation: `node scripts/test-city-game.mjs
--windows` and `npm run test:city:windows:browser` (screenshots `windows-night-*.png`).

Helicopter passengers now finish their trip at street level. After the lift down, they step
out of the building's front door (the terminal's front door at the airport) and walk down to
the pavement before going on their way.
