# Weather and road accidents

The weather selector at the top left of My City offers Automatic, Sunny, Cloudy, Rain
and Thunderstorm. Automatic weather moves through a sunny/cloudy/rain/storm/clearing
cycle on the simulation clock. Clouds drift above the city; rain falls at an angle;
storms darken the sky, reduce visibility and occasionally produce lightning. Lighting
also follows the existing day/night switch. Rain slows road vehicles and increases the
chance of an occasional braking skid. Reduced motion uses a static weather scene with
no lightning flashes. Pausing freezes the whole scene.

Vehicle accidents use swept, oriented vehicle bodies, including both vehicles' movement
between frames. A newly overlapping moving pair becomes an accident; vehicles in adjacent
lanes, stationary queues and newly spawned vehicles are not themselves accidents. Existing
braking, pedestrian crossings and signals remain active. Rare braking mistakes can lead to
actual contact, with greater risk in rain. The accident system is enabled by the city scene;
standalone traffic simulations retain their default collision avoidance unless enabled.

An accident holds the actual vehicles in place, with slight body damage, hazard lamps and
smoke. Police respond on the connected road network from a police station. Once they reach
the scene, officers direct traffic with cones and nearby drivers choose alternate turns
when available. A recovery truck then comes from a workshop or bus depot, loads one wreck
onto its flatbed and carries it away. The other vehicle is released and the road reopens.
The Town Hall supplies response bases when a dedicated building is unavailable.
Damaged buses and taxis stop accepting passengers. Their active passenger interactions
cancel safely to a pavement while the vehicle remains held for recovery.

The status card explains the current response stage and **Show accident** focuses the
camera on it. Responders use real road routes and vehicle spacing. Wrecks remain barriers
even during traffic deadlock recovery. If a road is removed, or a response becomes impossible,
the incident cancels safely and releases held cars and equipment. At most three incidents
run together; stale scenes time out instead of blocking the city forever.

Weather, accidents and vehicle damage are temporary simulation state: they do not deduct
coins, change the resident population or alter saved buildings. A wreck is removed from
the visual road fleet, which replenishes normally.

Validation:

- `npm run test:city:incidents`: swept rear-end/crossing collision detection, complete police
  and recovery lifecycles, separate response bases, real road spacing, pause, road removal,
  solid wreck barriers, weather transitions and lightning.
- `npm run test:city:incidents:browser`: an isolated test city arranges a real rear-end
  contact through the debugger, then runs the normal collision detector and emergency
  response. It observes police control, loading, recovery and clearance, and checks all
  weather controls, rain, lightning, pause, mobile layout and road removal. It never modifies
  the user's saved city.

Browser screenshots are written to `artifacts/city-expansion/accident-*.png` and
`artifacts/city-expansion/weather-*.png`. Set `CITY_BROWSER_GPU=hardware` to use desktop graphics.
