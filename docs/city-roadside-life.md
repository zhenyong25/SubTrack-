# Roadside passengers and rubbish collection

Bus shelters and taxi stands sit at the road-facing edge of their plots. Roadside signs
mark the pickup kerb. Build these from **Build → Transport**, on land immediately next to a
road connected to homes. Existing bus depots, interchanges, railway stations and tram stops
also serve their matching vehicles. Trams require connected tram-track roads.

Residents come from the existing population and walk to the facility. A stopped vehicle
holds while passengers approach its door one at a time. Residents disappear inside during
the ride, then walk out onto a pavement at their destination. Buses and trams travel between
matching stops; taxis also serve homes and public buildings. One stop can provide a short
round trip. Boarding uses the pavement on the vehicle-door side, with a narrow reserved
doorstep corridor; ordinary pedestrians still use controlled road crossings.

The traffic simulation supplies real buses, taxis and collection trucks rather than a second
visual fleet. Dispatching uses connected roads, vehicle sizes and existing traffic controls.
An active bus stop, taxi rank or sanitation hub reserves an appropriate service vehicle
even in a small town. A vehicle only opens its door while serving passengers or a crew.

Bins appear beside connected homes, businesses and civic venues. The green collection truck
picks up one existing resident at an operating recycling centre, or at the Town Hall when no
centre is operating. The collector wears an orange uniform, leaves the cab, visits a bin,
carries a rubbish bag to the truck, loads it and returns to the cab. A round visits several
bins and then returns the crew. Bins visually refill over simulation time.

All activity is temporary visual state. It does not add fares, fees, saved inventory or
extra residents. Pause/reduced motion freezes vehicles, passengers, collectors and props.
Moving/removing stops, deleting roads or retiring a vehicle cancels affected trips and
releases passengers safely to a surviving pavement. Meshes and held-vehicle leases are
disposed with the city scene.

`npm run test:city:roadside` checks real vehicle boarding, hidden travel, alighting,
collection rounds, the sidewalk-to-door transition, pause and cancellation. It is included
in `npm run test:city`.

After `npm run build`, `npm run test:city:roadside:browser` observes bus and taxi boarding,
riding, alighting and rubbish collection in a live city, then checks pause, mobile layout
and road removal. Screenshots go to `artifacts/city-expansion/roadside-*.png`. Set
`CITY_BROWSER_GPU=hardware` to use desktop graphics, or leave it unset for SwiftShader.
