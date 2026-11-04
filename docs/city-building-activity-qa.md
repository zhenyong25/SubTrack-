# My City activity coverage and QA

All 145 buildable types are accounted for: 122 outdoor activity types, 10 sports/recreation
types, 10 residential types and three explicit indoor/scenery cases. The catalogue coverage
test fails if a new non-residential type has no assigned role.

Residents use existing population, connected roads and operational facilities. Activities
and equipment are visual only; they do not change income, saved finances or production.
Equipment uses shared instanced geometry. A tractor only appears while its resident driver
is at the farm; a vacant farm does not run a driverless vehicle.

## Plantation and farm checks

| Building | Activity | Check visually |
| --- | --- | --- |
| Wheat field | Tractor driver, hoeing and watering | Wheels and driver move together along the front lane; tools stay out of the fence |
| Vegetable patch | Hoeing and watering by hand | Farmers reach the beds and tools follow their hands |
| Rice paddy | Planting in flooded beds | Farmers bend to plant; no tractor in the water |
| Red barn | Tractor driver and hay delivery | Tractor stays in the front access strip, away from the barn |
| Apple orchard | Tractor driver and fruit picking | Pickers reach up with baskets; tractor clears trees and packing shed |
| Dairy farm | Tractor driver and feed delivery | Tractor clears livestock pens; feed follows its carrier |
| Flower farm | Hoeing and watering | Farmers work among the flower rows with hand tools |
| Glass greenhouse | Watering and tending plants | Farmers use the forecourt without walking through glass |
| Vineyard | Tractor driver and picking | Tractor clears the trellises and shed |
| Grain cooperative | Tractor driver and hay delivery | Tractor clears the silo/storage building |
| Community allotment | Shared gardening by hand | Neighbours tend the beds; no tractor in the small allotment |

All six tractor types share a narrow access-lane route. They reverse at each end to stay
inside the footprint, including on one-tile plots. Existing residents occupy driver slot
zero; the remaining activity slots retain farm work.

## Other buildings and interaction checks

| Group | Expected behavior | Checks |
| --- | --- | --- |
| Cafes and all dining venues | Eat, drink and chat at outdoor tables | Cups, food, seats and parasols align; diners leave and return |
| Shops and markets | Browse windows/stalls and carry purchases | Bags, books, flowers and produce match the destination |
| Harbour and fishing buildings | Cast lines, board boats, sail, move cargo or repair equipment | Floats and routes stay on water; empty boats stay moored; passengers return ashore |
| Parks and nature spaces | Stroll, picnic, garden, feed ducks and watch birds | Props match attendance; duck and bird movement pauses with residents |
| Culture venues | Read, paint, queue, observe landmarks and perform music | Brushes face easels; instruments and queue spacing remain readable |
| Transport | Wait, cycle and gather at entrances | Bikes follow riders; visitors reach the road-facing side |
| Schools and civic venues | Schoolyard play, campus reading, patrols, fire drills and waiting | People stay in public areas; hose/water and uniforms follow the activity |
| Science and utilities | Inspect instruments, maintain equipment, tinker and move recycling | Staff remain outside machinery; offline facilities receive no activity visitors |
| Offices, banks and advisory offices | Commute, enter buildings and talk outside | Indoor residents disappear; people re-emerge without duplication |
| Homes and residential high-rises | Supply residents for visits and commutes | Population matches homes; a resident appears only once |
| Post office | Indoor visits; carry a parcel on arrival | Parcel disappears after delivery; existing advisor selection still opens |
| Public toilets | Indoor public visits | Entry/exit works and residents are hidden indoors |
| Trees | Scenery | No invented activity slots; existing clearing behavior still works |

## Automated regression coverage

See [automatic boat outings](city-boat-trips.md) for the complete boarding, offshore fishing,
sightseeing and return lifecycle and its dedicated checks.

`npm run test:city` covers the full city: catalogue, placement, upgrades, moving, saves,
economy, roads, crossings, traffic and resident activities. `npm run test:city:activities`
runs the activity checks alone:

- Every outdoor type has valid finite poses for every slot, and every land activity
  receives residents who take part and return.
- Waterfront activities require adjacent water; routes, boarding and return trips are checked.
- Tractor equipment remains inside every farm footprint at all four building orientations,
  and the resident stays at the wheel.
- Pause/reduced-motion simulation freezes the clock, poses and equipment exactly.
- Demolition, relocation, rotation, service loss, road removal and population removal
  release farm visits and remove abandoned tractors.
- Held purchases, fishing rods, cafe furniture and equipment cleanup follow attendance.

After `npm run build`, run `npm run test:city:activities:browser`. It builds a real town
with all ten farming buildings and representative waterfront, shopping, dining, civic,
culture, transport and nature venues. It requires observed farm work, a resident-operated
tractor and representative activities before passing. It also checks pause/resume, mobile
overflow and tractor removal after demolition. Screenshots are saved to
`artifacts/city-expansion/activities-*.png`.

The browser runner defaults to SwiftShader for machines without a GPU. On a desktop with
hardware graphics, set `CITY_BROWSER_GPU=hardware` to avoid slow software rendering
(PowerShell: `$env:CITY_BROWSER_GPU = 'hardware'` before running the command).

Use `npm run test:city:movement:browser` for building entries/exits, signal phases,
pedestrian crossings and traffic stopping. The browser smoke tests exercise representative
buildings; inspect the visual checks above for the remaining individual models, all three
upgrade levels, night lighting, rotated entrances and crowded towns. These are visual QA
items, not claims that every individual model has been reviewed in a browser.

Also smoke-test Town Hall selection/collection and the post office, savings vault and
credit union advisor panels: moving people and equipment must not interfere with their
existing building clicks or financial workflows.
