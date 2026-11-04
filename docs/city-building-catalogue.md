# My City building expansion

The catalogue contains 145 buildable types: the 25 original types and 120 additions. All new types support the existing placement, upgrade (levels 1–3), move, demolition, income and save systems. Unlocks span city levels 1–15.

| New category | Choices | Examples |
| --- | ---: | --- |
| Farming | 10 | Wheat field, rice paddy, dairy farm, vineyard |
| Harbour | 10 | Marina office, ferry terminal, container yard, harbour crane |
| Fishing | 10 | Angler hut, fishing jetty, oyster hatchery, trawler depot |
| High-rise | 10 | Loft apartments, twin towers, vertical garden homes, metropolis spire |
| Shopping | 10 | Bookshop, florist, antique arcade, city mall |
| Dining | 10 | Bakery, noodle shop, food court, seafront restaurant |
| Recreation | 10 | Playground, skate park, pool, city stadium |
| Culture | 10 | Library, museum, clock tower, observatory |
| Transport | 10 | Bus shelter, tram stop, railway station, interchange |
| Civic | 10 | Fire station, nursery school, university, hospital |
| Science | 10 | Weather station, recycling centre, research lab, energy institute |
| Nature | 10 | Bamboo grove, rose garden, wetland reserve, urban forest |

Harbour buildings and selected fisheries require dry land directly beside water. They do not occupy water tiles. Nature spaces work without roads. Residential high-rises house residents; commercial buildings provide jobs and income. Civic and recreational buildings support happiness. Solar canopies, water reclamation and the energy institute provide utilities. These additions use the existing coin economy; there are no separate crop, fish or cargo inventories.

Use All to browse the complete catalogue, or choose a category. Search matches names, descriptions and category IDs within the selected category. Unlocked and Within budget filters narrow the selection. Cards show footprint, cost, effects, utility demand and shoreline requirements.

Definitions are in `services/cityBuildingExpansion.ts`. The model dispatcher is in `components/city3d/expansionModels.ts`; the 120 individual architectural recipes are split across `ruralBuildings.ts`, `urbanBuildings.ts`, `publicBuildings.ts` and `infrastructureBuildings.ts`. They share construction primitives in `buildingKit.ts`, but each building chooses its own geometry, layout and defining equipment. Each design has a stable save ID. Existing buildings and saves retain their original IDs and settings. No database migration is required.

Validation: `npm run test:city` checks game rules, all 120 save round-trips, all upgrade stages and model geometry bounds. `npm run test:city:browser` checks categories, search, empty results, coastal guidance, placement selection, a live 3D scene and desktop/mobile layout. Screenshots go to `artifacts/city-expansion/`.

`npm run test:city:browser -- --gallery` renders 12 model contact sheets, one per new category. Geometry fingerprint tests compare normalized vertices without materials, so colour or facade changes alone cannot pass as a different building design.

## Resident recreation

Residents visit all ten recreation types. Basketball and tennis courts have animated players and balls; skate parks have riders and boards; pools have swimming strokes; playgrounds have children climbing, sliding, digging and using the swing seat. Football grounds and stadiums have running players and passes. Other recreation venues have exercise, bowling or visitor animations in their public areas.

Visitors come from the existing simulated residents, including short breaks for employed residents. They follow connected roads to an entrance, enter the facility, spend time there and return to their departure road or workplace. Empty cities, disconnected entrances and facilities with no utility service receive no visitors. Removing or moving a facility or removing roads releases its visitors. Activity capacity and a city-wide visit budget bound the animation work, and destination priority rotates so later-built facilities receive visitors too. Pause and reduced motion freeze both the actors and their equipment.

Visits are visual simulation state and are not persisted or rewarded with extra coins. Existing job assignments, financial records and building production are unchanged. Use `npm run test:city:browser -- --recreation` for the live-scene check and `artifacts/city-expansion/recreation-active.png` for its preview.

## Activities at other facilities

About 120 other building types also have outdoor activities, drawn from the same residents
and visit budget (`components/city3d/activities.ts`):

- **Waterfront:** each coastal facility gets a timber jetty into the water. Anglers fish from
  it, casting and now and then landing a fish. Harbour and fishing buildings run boat trips:
  rowing boats, sailing dinghies, motor launches, lifeboats, ferries, and fishing boats that
  stop offshore while the crew fish. Passengers wait on the jetty, board the moored boat, sail
  one loop and come ashore. The loop is fitted to the open water beside the jetty; where it
  doesn't fit, the boat stays moored.
- **Dining:** pairs at parasol tables, eating and talking.
- **Shopping and markets:** window shopping and browsing stalls with bags and baskets.
- **Farming:** hoeing, watering, rice planting, fruit picking, carrying hay and resident-driven
  tractors at wheat fields, barns, orchards, dairy farms, vineyards and grain cooperatives.
- **Nature:** strolls, park benches, picnics, ducks to feed, birdwatching, jogging, the fountain.
- **Culture:** a bandstand concert with an audience, cinema queues, painters at easels,
  reading on the library steps, looking up at the clock tower or observatory.
- **Transport:** waiting at stops with phones and suitcases, and riding hire bikes.
- **Civic:** fire drills with a hose, police patrols, school and nursery play, students on
  the lawn, chats outside halls and offices, patients resting outside clinics.
- **Work yards:** cargo handlers, ship repairers, weather readings and a workshop robot.

Residents choose facilities near them and walk up to 80 road tiles to reach one; sports venues
keep their 32-tile limit. Visitors walk around a building's plot edge rather than through it.

Residents coming out of shops and restaurants carry what they bought: bags, flowers, books, ice
cream, coffee or takeaway. People heading to the post office carry a parcel. Rods, hats and hand
items follow each resident's arm pose. Jetties and moored boats are always shown; other
furniture appears only while it is in use.

`npm run test:city` covers every activity type, boat trips and jetty placement.
`npm run test:city:activities:browser` builds a lakeside town and records close-ups to
`artifacts/city-expansion/activities-*.png`.

See [the building activity QA matrix](city-building-activity-qa.md) for all 145 building roles,
farm-specific checks and remaining visual review cases.

## Animals

Farms, gardens, ponds, forests, the fountain, homes and the waterfront have animals that live
on their plot (`components/city3d/animals.ts`). They stay there whether or not anyone visits.

| Where | Animals |
| --- | --- |
| Dairy farm | Cows and a calf grazing in the paddock; a farm dog by the gate |
| Red barn | Pigs and a horse in the pen; chickens in the side yard |
| Grain co-operative, vegetable patch | Chickens (and a barn cat) |
| Apple orchard, vineyard | Sheep under the trees; goats by the shed |
| Rice paddy, wetland reserve | Ducks paddling; herons wading |
| Wheat field, plaza fountain | Pigeons pecking that now and then flutter to a new spot |
| Park, picnic grove, pocket and rose gardens, allotment | Dogs, squirrels, rabbits, a cat |
| Urban forest, bamboo grove | Deer (some with antlers), squirrels, a panda eating bamboo |
| Duck pond | Geese on the lawn |
| Cottages and townhouses | A cat or a dog in the front yard |
| Harbour, fishing buildings, lighthouse | Gulls circling overhead |

Each animal walks, runs, grazes or pecks (head down), sits, lies down or flies, by species.
Herd mates keep a little apart. Animals pause with the city. An unchanged building keeps its
animals where they are when the city updates. Demolishing it removes them. They're drawn with
a few shared instanced shapes.

Validation: `node scripts/test-city-game.mjs --animals` and `npm run test:city:animals:browser`
(screenshots in `artifacts/city-expansion/animals-*.png`; add `--rotate` to view from the far side).

## Mountains, valleys and islands

The map is still 100×100 tiles, so every saved city keeps its tiles. All land that existed
before is unchanged, which a test compares tile by tile.

- **River valley:** the river runs down a valley between two mountain ridges. Grass gives way
  to bare rock and then snow on the highest peaks (about 40 m). Rolling hills lie south-east of
  the start.
- **Islands:** two new islands sit off the north-east and south-west corners, across a channel
  at least three tiles wide. The north-east island has a volcano. The south-west island is low
  and sandy, good for building. Their plots can be bought one step at a time from the coast.
- **Steep ground:** you can't build on or lay a road across ground more than about 2 m above
  the plain. The start plots stay level.
- **Bridges:** a road drawn over water becomes a bridge, with piers and railings along its
  pavements. It costs 20 extra coins per tile. Bridges may cross water in or beside a plot you
  own, which is how you reach the islands.
- **Older cities:** the ground is level under every road and building, so anything built
  before the mountains existed still stands on flat ground.

Terrain is defined in `services/cityGameService.ts` (`terrainMap`, `elevationAt`, `isSteep`).
The ground mesh heights come from `components/city3d/terrainShape.ts`. Validation:
`node scripts/test-city-game.mjs --terrain` and `npm run test:city:terrain:browser`.

## Levels and upgrades

City levels now go to **30**. Each level past 15 takes a little longer than the one before.
New titles run from Global city to Utopia prime, and more land plots open as you level up (up
to 91 at level 30). The new levels open two more upgrade tiers for every building: **level 4
at city level 16** and **level 5 at city level 22**. Income, residents, jobs and utility
figures scale ×3.7 and ×5. The upgrade button tells you when a tier is still locked.

Every upgrade changes how a building looks (`components/city3d/upgradeDressing.ts`). Each
model's own level 2 and 3 designs are kept, and every building also gains:

| Level | Main block | Around it |
| --- | --- | --- |
| 2 | Stone plinth, cream cornice | Flower planters at the front; vents on a flat roof |
| 3 | Bronze cornice and mid-height band | Street lamps by the entrance; rooftop solar panels (or a flagpole) |
| 4 | Silver cornice, band and corner pilasters | Bunting between the lamps; a rooftop garden |
| 5 | Glowing gold crown, pilasters and caps | A golden statue on a plinth; a beacon mast; gilded planters and lamps |

Trims wrap the building's main walls (not a pitched roof, dome or tree) and stay inside the
plot. Roof props avoid the helipad. A test checks that every building looks different at every
level. Validation: `node scripts/test-city-game.mjs --upgrades` and
`npm run test:city:upgrades:browser` (screenshots `artifacts/city-expansion/upgrades-*.png`).

## Turning buildings

Buildings can be turned in quarter turns. **Rotate** on a selected building turns it a quarter
clockwise for free. While placing or moving one, press **R** or the ⟳ button in the hint bar to
turn the preview before you tap. A building nobody has turned keeps facing the nearest road, as
before, so existing saves look the same.

The turn is saved as `rotation` (0 south, 1 east, 2 north, 3 west). Everything uses one rule
(`frontQuarter` and `doorTile` in `cityGameService.ts`): the model, its door, visitors'
routes, activities, animals, helipads and the window lights. The door opens onto the road the
building faces, or onto another road beside it, so a building turned away from its street
stays connected. Validation: `node scripts/test-city-game.mjs --rotation` and
`node scripts/test-city-expansion-browser.mjs --rotation`.
