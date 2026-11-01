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
