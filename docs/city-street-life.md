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
Road edits, moved buildings, demolition and population changes release affected visits.
Pause and reduced motion freeze the simulation clock, visits and signal phases together.
These animations do not change saved city finances or building production.

Implementation:

- `components/city3d/streets.ts`: sidewalk graph, route trees, crossing reservations,
  signal phases and vehicle clearance checks.
- `components/city3d/buildingVisits.ts`: building visit lifecycle for existing residents.
- `components/city3d/trafficSignals.ts`: instanced signal models and lamp colours.
- `components/city3d/people.ts`, `recreation.ts`, `traffic.ts`: shared movement integration.

Validation: `npm run test:city`, `npm run build`, then
`npm run test:city:movement:browser`. The browser test needs Chrome/Chromium and uses a
temporary isolated profile. It captures desktop/mobile images under
`artifacts/city-expansion` and checks visits, crossings, stopping traffic, pause and removal.
