# Digital billboards and more wildlife

Digital signs appear automatically on corner shops, offices, cinemas, department stores,
city malls, electronics stores, Metropolis spires and skyline hotels. Smaller venues have
framed rooftop signs; the Metropolis spire has stacked screens and a screen on its side.
Four fictional city posters rotate every eight simulation seconds, with a scrolling ticker.
They stay illuminated at night and freeze with pause or reduced motion. There are no ads
from external services, tracking, new fees or changes to the saved city.

The existing animal habitats now also include:

| Wildlife | Where to see it | Behaviour |
| --- | --- | --- |
| Sparrows | Parks, gardens, orchards and fountains | Forage, walk and take short flights |
| Crows | Wheat fields and urban forests | Peck, walk and fly |
| Swallows | Parks, forests and wetlands | Circle overhead in small flocks |
| Parrots | Bamboo groves and botanical gardens | Walk and fly, in red or green plumage |
| Flamingos | Wetland reserves | Wade, feed and stand in shallow water |
| Peacocks | Botanical gardens | Wander and spread their tail fans while resting |
| Foxes | Urban forests | Wander, trot and rest, with a white-tipped bushy tail |
| Hedgehogs | Pocket gardens and rose gardens | Amble, forage and rest |
| Butterflies | Rose gardens, botanical gardens, pocket gardens and florists | Flutter above the flowers in orange, blue or purple |
| Koi | Duck ponds | Swim near the water surface, with moving tails and orange/white markings |

Waterfront gull flocks are larger, and ducks also swim in duck ponds. Animals remain tied
to their habitat when it moves and disappear when it is demolished. Ground animals stay
within their plots. Birds and billboards share simulation pause behaviour with residents.

Wildlife now responds to the city's existing residents. Pigeons, sparrows, crows and parrots
take off when an outdoor resident approaches, then land inside their habitat. Rabbits,
squirrels and hedgehogs retreat within their plots. Dogs approach nearby visitors, wag
their tails and pause beside them before returning to their normal routine. Cooldowns
prevent constant reactions. Residents indoors or aboard transport are excluded, and people
on a high rooftop do not disturb ground animals. Nearby-person checks use spatial cells.

Billboards use one shared procedural poster texture and three instanced meshes; animation
runs in the shader without repeatedly redrawing/uploading canvas textures. Animal separation
checks only neighbours in the same habitat, rather than every animal across the whole city.

Run `npm run test:city:ambience` for wildlife movement and sign lifecycle checks. The suites
also run with `npm run test:city`. After a build, `npm run test:city:ambience:browser` checks
the live scene, day/night rendering, pause, mobile layout and demolition. Set
`CITY_BROWSER_GPU=hardware` to use desktop graphics. Previews are written to
`artifacts/city-expansion/billboards-day.png`, `billboards-night.png`, `wildlife-expanded.png`
and `wildlife-pond.png`. The browser fixture also verifies that birds react to actual
outdoor residents, and that reactions freeze on pause and disappear with their habitat.
