# Automatic resident boat outings

Residents walk to an operating waterfront venue, wait on its jetty and sit aboard its boat.
The first passenger starts an eight-second boarding period. The boat then follows a route
through the available water, pauses offshore for its activity, and returns to the same dock.
Passengers stay seated for the whole voyage and then walk back along the jetty. Residents
arriving after departure wait for the next trip; they cannot board a moving boat.

Fishing boathouses and trawler depots run fishing trips. Boats anchor for 14 seconds while
the residents cast rods and occasionally reel in fish, including when the skipper is the
only passenger. Other passenger boats pause for ten seconds of sightseeing with binoculars.

| Venue | Boat | Outing |
| --- | --- | --- |
| Harbourmaster office, oyster hatchery | Rowing boat | Sightseeing |
| Sailing club | Sailing boat | Sightseeing |
| Marina office | Motor boat | Sightseeing |
| Fishing boathouse, trawler depot | Fishing boat | Fishing |
| Lifeboat station | Lifeboat | Coastal sightseeing/patrol |
| Ferry terminal, cruise terminal | Passenger ferry | Sightseeing |

Routes extend further offshore where space permits and shrink to fit narrower water.
River bends and irregular lake edges use a connected route through clear water and return
along that channel when an oval trip will not fit. Piers can extend to put the boat safely
past a jagged bank. Every route segment is checked with clearance around the hull.
Where there is no safe loop, the boat stays moored for a short dockside visit. Empty boats
stay at their docks. Boats stop producing a moving wake while anchored.

The voyage clock is shared by the boat and every passenger. Pause and reduced motion freeze
the trip, poses and props together. Ordinary status refreshes retain an ongoing trip; moving
or removing the venue cancels it. Removing residents, roads or utility service releases the
affected visitors. Voyage state is temporary and adds no coins, inventory or saved expenses.

`npm run test:city:boats` checks all nine venues, complete outings, seated passengers,
offshore activities, solo trips, late boarding, pause/resume, status refresh, harbour moves,
demolition and narrow water. It is also included in `npm run test:city` and
`npm run test:city:activities`.

After `npm run build`, run `npm run test:city:boats:browser` for a real city scene with a
fishing boathouse and a marina. It requires observing boarding, departure, rods, binoculars,
return trips and residents walking back from both venues. It checks pause/resume, mobile
layout and harbour removal, and records `artifacts/city-expansion/boats-*.png`.
Set `CITY_BROWSER_GPU=hardware` for a desktop GPU, or leave it unset for SwiftShader.

Select a boat venue to see its trip status on the map: missing road access, unavailable
utilities, waiting for passengers, departure countdown, offshore activity or return. Use
**Show working boat** to locate its current position. The display boat on a building is
separate from the passenger boat moving on the water.

To diagnose an existing layout without changing its save, the browser runner accepts a
sanitized city JSON through `CITY_REPLAY_PATH` with `--boats`. Replay checks each operating
boat venue for boarding, departure and return, and checks the missing-road explanation for
an unconnected fishing boathouse. This runs in an isolated browser with a temporary copy.
