import type { BuildingCategory, BuildingType } from './cityGameService';

export type ExpansionStyle = 'field' | 'orchard' | 'barn' | 'greenhouse' | 'dock' | 'cargo' | 'boat' | 'fishery' | 'tower' | 'shop' | 'market' | 'dining' | 'pavilion' | 'arena' | 'monument' | 'station' | 'civic' | 'lab' | 'garden' | 'pond';
export interface BuildingAppearance { style: ExpansionStyle; variant: number; color: string }
export const EXPANSION_CATEGORIES: Array<{ id: BuildingCategory; label: string; icon: string; color: string }> = [
  { id: 'farming', label: 'Farming', icon: '🌾', color: '#92ad57' },
  { id: 'harbour', label: 'Harbour', icon: '⚓', color: '#4e8ba6' },
  { id: 'fishing', label: 'Fishing', icon: '🎣', color: '#62a8af' },
  { id: 'highrise', label: 'High-rise', icon: '🏙️', color: '#7293b8' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', color: '#c49273' },
  { id: 'dining', label: 'Dining', icon: '🍜', color: '#cb9478' },
  { id: 'recreation', label: 'Recreation', icon: '🎡', color: '#a294c2' },
  { id: 'culture', label: 'Culture', icon: '🎭', color: '#c3ab7d' },
  { id: 'transport', label: 'Transport', icon: '🚉', color: '#7c9b9d' },
  { id: 'civic', label: 'Civic', icon: '🏥', color: '#8ca3b8' },
  { id: 'science', label: 'Science', icon: '🔬', color: '#7fadb0' },
  { id: 'nature', label: 'Nature', icon: '🌿', color: '#71a479' },
];

// Each entry has a stable save ID and its own model recipe. Category profiles keep the
// economy comparable to the original catalogue; unlocking new designs never changes old saves.
type Entry = [id: string, name: string, style: ExpansionStyle, description: string, size?: 1 | 2];
const entries: Record<string, Entry[]> = {
  farming: [
    ['wheatfield', 'Wheat field', 'field', 'Golden grain rows with a farm access path.'],
    ['vegetablepatch', 'Vegetable patch', 'field', 'Raised vegetable beds for the neighbourhood.'],
    ['ricepaddy', 'Rice paddy', 'pond', 'Flooded rice beds divided by narrow banks.', 2],
    ['redbarn', 'Red barn', 'barn', 'A traditional timber barn and fenced yard.'],
    ['appleorchard', 'Apple orchard', 'orchard', 'Rows of fruit trees with a packing shed.', 2],
    ['dairyfarm', 'Dairy farm', 'barn', 'A dairy barn with feed silos and fenced pens.', 2],
    ['flowerfarm', 'Flower farm', 'field', 'Colourful flower beds and a potting shelter.'],
    ['glassgreenhouse', 'Glass greenhouse', 'greenhouse', 'Glass growing houses filled with planting benches.', 2],
    ['vineyard', 'Vineyard', 'orchard', 'Trellised vines around a small country building.', 2],
    ['graincooperative', 'Grain cooperative', 'barn', 'A farm cooperative with grain silos and storage.', 2],
  ],
  harbour: [
    ['harbourmaster', 'Harbourmaster office', 'dock', 'A small shore office with timber mooring posts.'],
    ['sailingclub', 'Sailing club', 'boat', 'A shoreside sailing clubhouse and display dinghy.'],
    ['marinaoffice', 'Marina office', 'dock', 'A marina reception building with a raised deck.'],
    ['lifeboatstation', 'Lifeboat station', 'boat', 'A rescue boathouse with an orange lifeboat.', 2],
    ['coastalwarehouse', 'Coastal warehouse', 'cargo', 'Cargo storage beside the harbour road.', 2],
    ['ferryterminal', 'Ferry terminal', 'dock', 'A passenger terminal with covered waiting platforms.', 2],
    ['containeryard', 'Container yard', 'cargo', 'Stacks of colourful shipping containers.', 2],
    ['shiprepair', 'Ship repair yard', 'boat', 'A shoreside repair shed with a boat on supports.', 2],
    ['harbourcrane', 'Harbour crane', 'cargo', 'A tall cargo crane above a paved loading yard.', 2],
    ['cruiseterminal', 'Cruise terminal', 'dock', 'A modern cruise reception hall on the waterfront.', 2],
  ],
  fishing: [
    ['anglershut', 'Angler hut', 'fishery', 'A simple shore hut with rods and tackle.'],
    ['baitshop', 'Bait and tackle shop', 'fishery', 'A fishing shop with colourful tackle racks.'],
    ['fishingjetty', 'Fishing jetty', 'dock', 'A timber fishing platform built on the shore.'],
    ['netmakers', 'Net maker workshop', 'fishery', 'A net loft with drying racks and floats.'],
    ['fishingboathouse', 'Fishing boathouse', 'boat', 'A shore boathouse sheltering a small fishing boat.'],
    ['oysterhatchery', 'Oyster hatchery', 'pond', 'Managed oyster tanks beside the water.', 2],
    ['fishauction', 'Fish auction hall', 'market', 'A covered fish auction with blue market stalls.', 2],
    ['smokehouse', 'Fish smokehouse', 'fishery', 'A brick smoking house with drying racks.'],
    ['aquaculture', 'Aquaculture centre', 'pond', 'A collection of aquaculture tanks and a service shed.', 2],
    ['trawlerdepot', 'Trawler depot', 'boat', 'A larger fishing depot with a trawler on its shore stand.', 2],
  ],
  highrise: [
    ['loftblock', 'Loft apartments', 'tower', 'Brick loft homes with a stepped roof.', 2],
    ['slimcondo', 'Slender condominium', 'tower', 'A narrow residential tower on a landscaped podium.'],
    ['terracetower', 'Terrace residences', 'tower', 'Stepped residential floors with green terraces.', 2],
    ['glasstower', 'Glass office tower', 'tower', 'A reflective office tower with a street-level lobby.', 2],
    ['skyhotel', 'Skyline hotel', 'tower', 'A tall hotel with a rooftop pavilion.', 2],
    ['twintowers', 'Twin residential towers', 'tower', 'Two residential towers sharing a podium.', 2],
    ['gardenhighrise', 'Vertical garden homes', 'tower', 'A residential high-rise with planted ledges.', 2],
    ['financialtower', 'Financial centre', 'tower', 'A tall office landmark with a crown and spire.', 2],
    ['skygallery', 'Sky gallery residences', 'tower', 'Tall apartments connected by a sky bridge.', 2],
    ['metropolisspire', 'Metropolis spire', 'tower', 'A tapered commercial skyscraper for your city centre.', 2],
  ],
  shopping: [
    ['bookshop', 'Bookshop', 'shop', 'A neighbourhood bookshop with a display window.'],
    ['florist', 'Florist', 'shop', 'A flower shop with planted pots outside.'],
    ['bikeshop', 'Bicycle shop', 'shop', 'A compact cycle shop with an outdoor display.'],
    ['tailor', 'Tailor studio', 'shop', 'A traditional tailor with a striped shopfront.'],
    ['electronicsstore', 'Electronics store', 'shop', 'A modern shop with a bright display fascia.'],
    ['farmersmarket', 'Farmers market', 'market', 'Outdoor stalls selling local produce.', 2],
    ['antiquearcade', 'Antique arcade', 'market', 'A roofed arcade filled with small shop units.', 2],
    ['departmentstore', 'Department store', 'shop', 'A multi-floor department store with broad windows.', 2],
    ['shoppinggalleria', 'Shopping galleria', 'market', 'A covered shopping street under a glass roof.', 2],
    ['citymall', 'City mall', 'shop', 'A large shopping complex with rooftop equipment.', 2],
  ],
  dining: [
    ['bakery', 'Bakery', 'dining', 'A warm bakery with an awning and outdoor table.'],
    ['teahouse', 'Tea house', 'dining', 'A quiet tea house with a shaded terrace.'],
    ['noodleshop', 'Noodle shop', 'dining', 'A narrow noodle restaurant with a bright canopy.'],
    ['icecreamparlour', 'Ice cream parlour', 'dining', 'A colourful parlour with pavement seating.'],
    ['pizzeria', 'Pizzeria', 'dining', 'An Italian-style pizza shop with a chimney.'],
    ['sushibar', 'Sushi bar', 'dining', 'A small restaurant with a timber entrance canopy.'],
    ['foodcourt', 'Food court', 'market', 'A courtyard of food stalls and shared tables.', 2],
    ['brewpub', 'Brewpub', 'dining', 'A brick pub with brewing tanks and a beer garden.', 2],
    ['seafrontrestaurant', 'Seafront restaurant', 'dining', 'A coastal dining room overlooking the water.', 2],
    ['banquethall', 'Banquet hall', 'pavilion', 'A broad dining hall with a formal entrance.', 2],
  ],
  recreation: [
    ['playground', 'Playground', 'garden', 'Play structures and seating in a small green space.'],
    ['skatepark', 'Skate park', 'arena', 'A compact skate plaza with ramps.'],
    ['basketballcourt', 'Basketball court', 'arena', 'An outdoor court with two basket stands.', 2],
    ['tennisclub', 'Tennis club', 'arena', 'A fenced tennis court and clubhouse.', 2],
    ['publicpool', 'Public pool', 'pond', 'An open-air swimming pool with a changing pavilion.', 2],
    ['bowlinghall', 'Bowling hall', 'pavilion', 'An indoor recreation hall with a bright facade.', 2],
    ['sportscentre', 'Sports centre', 'arena', 'A covered sports hall with a wide roof.', 2],
    ['amusementpark', 'Amusement park', 'arena', 'A small amusement ground with a colourful wheel.', 2],
    ['footballground', 'Football ground', 'arena', 'A miniature pitch with goals and grandstands.', 2],
    ['citystadium', 'City stadium', 'arena', 'A city stadium surrounded by tiered seating.', 2],
  ],
  culture: [
    ['communitygallery', 'Community gallery', 'pavilion', 'A small gallery with a skylit roof.'],
    ['bandstand', 'Bandstand', 'monument', 'A covered outdoor stage for local performances.'],
    ['publiclibrary', 'Public library', 'civic', 'A welcoming library with a columned entrance.', 2],
    ['artsstudio', 'Arts studio', 'pavilion', 'A studio building with roof lights and a sculpture yard.'],
    ['localmuseum', 'Local history museum', 'civic', 'A classical museum with a broad front stair.', 2],
    ['cinema', 'Cinema', 'pavilion', 'A neighbourhood cinema with an entrance marquee.', 2],
    ['clocktower', 'Clock tower', 'monument', 'A civic clock tower for the town square.'],
    ['theatre', 'City theatre', 'pavilion', 'A performance venue with a deep entrance canopy.', 2],
    ['concerthall', 'Concert hall', 'pavilion', 'A concert venue with sculpted roof forms.', 2],
    ['observatory', 'Observatory', 'lab', 'A domed telescope building on a paved terrace.', 2],
  ],
  transport: [
    ['busstop', 'Bus shelter', 'station', 'A covered roadside waiting shelter.'],
    ['bikestation', 'Cycle station', 'station', 'A sheltered rack for city bicycles.'],
    ['taxistand', 'Taxi stand', 'station', 'A small dispatch office and covered waiting area.'],
    ['tramstop', 'Tram stop', 'station', 'A pair of platform shelters and a display tram.'],
    ['parkinggarage', 'Parking garage', 'civic', 'A multi-storey garage with open facade strips.', 2],
    ['busdepot', 'Bus depot', 'station', 'A depot building with buses in its yard.', 2],
    ['railwaystation', 'Railway station', 'station', 'A station hall with a covered display platform.', 2],
    ['metroentrance', 'Metro pavilion', 'station', 'A covered metro entrance and ticket pavilion.'],
    ['logisticshub', 'Logistics hub', 'cargo', 'A distribution warehouse with loading bays.', 2],
    ['interchange', 'Transport interchange', 'station', 'A large terminal with several covered platforms.', 2],
  ],
  civic: [
    ['publictoilets', 'Public conveniences', 'civic', 'A small public facility with an accessible entrance.'],
    ['communityhall', 'Community hall', 'pavilion', 'A local hall with a welcoming entrance canopy.'],
    ['firestation', 'Fire station', 'civic', 'A red-brick station with garage bays.', 2],
    ['policestation', 'Police station', 'civic', 'A neighbourhood station with a blue entrance sign.', 2],
    ['nursery', 'Nursery school', 'civic', 'A low school building and colourful play yard.'],
    ['medicalcentre', 'Medical centre', 'civic', 'A community medical building with a covered entrance.', 2],
    ['courthouse', 'Courthouse', 'civic', 'A formal public building with a columned portico.', 2],
    ['university', 'University college', 'civic', 'An academic courtyard framed by teaching wings.', 2],
    ['generalhospital', 'General hospital', 'civic', 'A multi-wing hospital with a rooftop landing marker.', 2],
    ['emergencycentre', 'Emergency centre', 'civic', 'A civic response complex with a communications mast.', 2],
  ],
  science: [
    ['weatherstation', 'Weather station', 'lab', 'A monitoring hut with a mast and instrument dome.'],
    ['recyclingcentre', 'Recycling centre', 'cargo', 'A sorting shed with colour-coded collection bins.'],
    ['solarcanopy', 'Solar canopy', 'greenhouse', 'A covered solar installation adding clean electricity.', 2],
    ['waterreclamation', 'Water reclamation plant', 'pond', 'Treatment tanks that add to the water supply.', 2],
    ['researchlab', 'Research laboratory', 'lab', 'A modern laboratory with roof equipment.', 2],
    ['roboticsworkshop', 'Robotics workshop', 'lab', 'A technical workshop with testing equipment.'],
    ['datacentre', 'Data centre', 'lab', 'A secure server building with cooling units.', 2],
    ['innovationhub', 'Innovation hub', 'lab', 'A glass technology campus with linked wings.', 2],
    ['biotechcampus', 'Biotechnology campus', 'greenhouse', 'Research greenhouses around a laboratory block.', 2],
    ['fusioninstitute', 'Energy institute', 'lab', 'An advanced energy campus that supplies city power.', 2],
  ],
  nature: [
    ['pocketgarden', 'Pocket garden', 'garden', 'A small planted garden between city blocks.'],
    ['bamboogrove', 'Bamboo grove', 'orchard', 'A peaceful grove of tall bamboo stems.'],
    ['communityallotment', 'Community allotment', 'field', 'Shared vegetable beds with colourful planters.'],
    ['rosegarden', 'Rose garden', 'garden', 'Formal flower beds arranged around a central path.'],
    ['duckpond', 'Duck pond', 'pond', 'A landscaped pond edged by reeds and benches.'],
    ['picnicgrove', 'Picnic grove', 'garden', 'Shady trees around picnic tables.'],
    ['wetlandreserve', 'Wetland reserve', 'pond', 'A small wetland with reeds and raised boardwalks.', 2],
    ['botanicalgarden', 'Botanical garden', 'greenhouse', 'A planted conservatory with formal garden beds.', 2],
    ['sculpturegarden', 'Sculpture garden', 'monument', 'An outdoor sculpture collection in a landscaped plaza.', 2],
    ['urbanforest', 'Urban forest', 'orchard', 'A dense stand of mature trees with walking paths.', 2],
  ],
};

const starts: Record<string, number> = { farming: 1, harbour: 2, fishing: 1, highrise: 5, shopping: 1, dining: 1, recreation: 2, culture: 2, transport: 1, civic: 2, science: 3, nature: 1 };
const bases: Record<string, number> = { farming: 55, harbour: 130, fishing: 50, highrise: 420, shopping: 65, dining: 65, recreation: 90, culture: 120, transport: 75, civic: 100, science: 180, nature: 25 };
export const EXPANSION_BUILDINGS: BuildingType[] = EXPANSION_CATEGORIES.flatMap(category => entries[category.id].map(([id, name, style, description, footprint], index) => {
  const size = footprint || 1;
  const unlock = Math.min(15, starts[category.id] + index);
  const cost = Math.round((bases[category.id] + index * (category.id === 'highrise' ? 160 : 65)) * (size === 2 ? 1.25 : 1) / 5) * 5;
  const green = category.id === 'nature';
  const publicUse = ['recreation', 'culture', 'civic', 'transport'].includes(category.id);
  const residential = category.id === 'highrise' && [0, 1, 2, 5, 6, 8].includes(index);
  const jobs = green ? 0 : Math.max(2, Math.round(cost / (publicUse ? 40 : 28)));
  return {
    id, name, category: category.id, size, cost, unlock, description, icon: category.icon,
    appearance: { style, variant: index, color: category.color },
    income: green || publicUse ? 0 : Math.round(cost * (residential ? 0.025 : 0.12)),
    jobs: residential ? 0 : jobs,
    residents: residential ? Math.round(cost / 7) : 0,
    happiness: green ? 2 + index : publicUse ? 3 + index : category.id === 'farming' ? 1 : 0,
    power: green ? 0 : Math.max(1, Math.round(cost / 150)),
    water: green ? 0 : category.id === 'farming' ? 2 + Math.floor(index / 2) : Math.max(1, Math.round(cost / 220)),
    noRoad: green,
    coastal: category.id === 'harbour' || category.id === 'fishing' && !['baitshop', 'netmakers', 'smokehouse', 'fishauction'].includes(id) || id === 'seafrontrestaurant',
    ...(id === 'solarcanopy' ? { powerSupply: 70, power: 0, income: 0 } : {}),
    ...(id === 'waterreclamation' ? { waterSupply: 180, water: 0, income: 0 } : {}),
    ...(id === 'fusioninstitute' ? { powerSupply: 250, power: 0, income: 0 } : {}),
  };
}));
export const expansionById = new Map(EXPANSION_BUILDINGS.map(type => [type.id, type]));
