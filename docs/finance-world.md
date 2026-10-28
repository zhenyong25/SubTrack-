# My City

My City ("My City" in the navigation) is a city builder that grows with money habits. It rewards recording and reviewing, never spending amounts, income amounts, trading or market returns. Coins have no cash value.

## The map

A 100×100 tile map, the same for everyone: a coastline, a river and a lake from seeded noise (`terrainMap`). Land is owned in 10×10 plots. A new city owns the four centre plots (20×20), with a starter street grid around the Town Hall. More plots are bought next to owned land: 250 coins, ×1.35 for each one after, and level allows `4 + 3 × (level − 1)` plots.

## How it plays

- **Roads**: dragged out in an L shape (5 coins a tile, 2 back when bulldozed). Buildings must touch a road to work - without one they earn nothing and house nobody. Trees, parks, plazas and the lighthouse don't need one.
- **Power and water**: most buildings use some; power plants, wind turbines and solar farms supply power, water towers and pumping stations supply water (the hall supplies 10 of each). When demand outruns supply, everything that needs it runs at the supplied share.
- **People and jobs**: residents are exactly the people living in the homes you've built (each home's residents × its level multiplier) - roads and utilities don't change the count, but homes without them make people unhappy (−3 each when fully cut off). Businesses and industry need workers and earn in proportion to how many jobs are filled; the Town Hall houses nobody.
- **Street lights**: dragged along roads (10 coins each, 4 back when removed). Every 4 lit road tiles add 1 happiness, up to +12, and at night they cast warm pools of light.
- **Wild trees** grow on grass (thick in forests). Bulldozing them on your land pays 4 coins a tree; building or laying road over them clears them and pays the same.
- **Happiness** (0-100) multiplies income from 0.75× to 1.25×. Greenery, schools, clinics and landmarks raise it; workshops, factories and power plants lower it, and so do many homes without parks or services.
- **Income** fills each building for up to 8 hours; collect per building or all at once (whole coins; the fraction keeps filling). Upgrades go to level 3 (1.5× then 2.5× the build cost; 1.7× and 2.6× output). Removing returns half of everything spent.
- **Levels** (1-15) come from XP: a quarter of what's spent on buildings, a point per road tile, 20 per plot, plus missions. They unlock buildings and more land.
- **Buildings**: homes (cottage, townhouse, apartments 2×2, residential tower 2×2), business (café, corner shop, market hall, office block, bank), industry (workshop, factory), utilities (power plant, wind turbine, solar farm, water tower, pumping station), services (trees, park, plaza fountain, school, clinic, lighthouse - by the water).

## Missions

Daily (reset at local midnight): *Visit your city* and *Record an expense* every day, one of *Keep a full record* (3 expenses) / *Pay yourself first* (a savings contribution) / *Track what comes in* (income dated today), and one of *Run the city* (collect) / *Build something* (building, upgrade or road). All four open an 80-coin bonus. Weekly (Monday-Sunday): expenses on three days, a savings contribution, and the three review steps.

## Saving

Saved on the device immediately (`subtrack_city_v1:<user-id>`) and to Supabase `city_saves` (`supabase_city_game_schema.sql`, which accepts save versions 1 and 2) when signed in; the most recently changed copy wins on load. Version-1 saves (the earlier 11×11 island) are refunded in full and start on the new map with their coins, XP and quests. Damaged saves are refused rather than overwritten.

## 3D

`CityScene3D.tsx` with modules in `components/city3d/`:

- `textures.ts` - procedural canvas textures: grass, asphalt, pavement, roof tiles, brick, facades with framed windows (and a matching night map where windows glow), and a seamless water normal map.
- `models.ts` - every building modelled from smooth primitives (rounded boxes, lathed towers and fountains, extruded roofs, 16-48 segment curves), baked into one merged geometry per material so all copies render as InstancedMeshes. Turbine rotors and the lighthouse beam animate; chimneys and cooling towers emit smoke.
- `people.ts` - the residents, at real-world scale (a tile is about 10 m, a person about 1.75 m). Everyone lives in one of your homes. Residents with a job are inside their workplace and out of sight; everyone else walks the streets, starting from their front door - so the people you see are exactly residents minus filled jobs (the Residents card shows the split). Near the camera each is a jointed human (shaped torso and hips, neck, hair, thighs, shins and shoes with bending knees, upper arms and forearms with hands and bending elbows, some in dresses) walking at about 1.4 m/s; further away a two-piece figure is used. The building panel lists each workplace's staff by name and role and each home's household (`staffRoster`, `household`).
- `traffic.ts` - cars at real size (about 4.5 × 1.8 m) on the road graph (driving on the left), chimney smoke, and the road-walking helpers.

Lighting comes from a physical sky model (also used for image-based lighting) with filmic tone mapping and a shadow-casting sun that follows the camera. Water is reflective with animated ripples. Night mode follows the local clock (19:00-06:00) and can be toggled; windows, streetlights, car lights and the lighthouse light up.

Controls: drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom; buttons rotate, zoom and return to the Town Hall, and the minimap jumps the camera. Without WebGL the minimap becomes the playable map.

Validation: `npm run test:city` (rules, including the map, roads, utilities, land and save migration), `npm run test:world`, TypeScript check, and headless browser play-throughs (drawing roads, building, buying land, collecting).

## Advisors

Advisors are residents with a job reviewing part of your money, like Jules the Accountant at the Town Hall. Each works from an advisor building (Build → Advisors); the first person on its staff is the advisor, so the building needs residents nearby to hire from. The advisors strip at the top of My City shows each one and how many things they've flagged; selecting their building or the strip opens their office.

| Advisor | Building | Reviews |
|---|---|---|
| Subscription Auditor | Post Office (level 2) | monthly cost per currency, overlapping services (music, video, cloud storage, AI, office suites), trials ending within 14 days, renewal dates in the past, yearly renewals in the next 30 days, the priciest subscriptions |
| Savings Coach | Savings Vault (level 2) | the monthly amount each dated goal needs, whether you've contributed this month, goals past their date, goals without a date, funded goals |
| Debt Advisor | Credit Union (level 3) | overdue and upcoming payments, which debt to pay first (highest real rate - flat loans compared at their equivalent rate), what 10% more a month does to the largest loan, flat-rate loans' real cost, card balances carried over |

The rules live in `services/cityAgents.ts` (pure, tested by `npm run test:agents`); the office is `components/CityAgentOffice.tsx`. A review runs when you visit and your records have changed since the last one, or on demand; the steps are paced so you can watch. Reports are saved with the city (`agents` in the save). Advisors never change your records. When an issue they flagged is gone at the next review - you fixed it - it earns 40 coins and 15 XP, once per issue ever (`recordAgentReport`).
