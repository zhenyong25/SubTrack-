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

Definitions are in `services/cityBuildingExpansion.ts`. The model dispatcher is in `components/city3d/expansionModels.ts`; the 120 individual architectural recipes are split across `ruralBuildings.ts`, `urbanBuildings.ts`, `publicBuildings.ts` and `infrastructureBuildings.ts`. They share construction primitives in `buildingKit.ts`, but each building chooses its own geometry, layout and defining equipment. Each design has a stable save ID. Existing buildings and saves retain their original IDs and settings. No database migration is required.

Run `npm run test:city` to check building rules, saved-city compatibility, model bounds, and architectural uniqueness.
