// Everything the town builder produces besides geometry, shared by the world modules and
// re-exported from town.js (see DESIGN.md section 6 for the contract).

export const parkedCars = [];      // { type, x, z, yaw, color, name, trailer }
export const pedLoops = [];        // { i, j, pts: [[x, z] x 4] } sidewalk loops per block
export const animated = [];        // { tick(t) }
// Doors that open and close (garagedoor.js): Ove's garage door, by its name 'oveGarage'.
export const doors = [];
export const lamps = [];           // { x, z } street and path lamps
export const bouncers = [];        // trampoline-like floors (none in this town; kept for the API)
export const violationSpots = [];  // { x, z, yaw, kind, where }
export const litterSpots = [];     // [x, y, z]
export const collectibleSpots = { emblems: [], photos: [] };
// Street-side places where nothing may be put (snow banks, lamps): crossings, drives, bus stops,
// violation spots. { x, z, r }
export const keepClear = [];
// Named places for the minimap / debug: [label, landmark key]
export const mapLabels = [];
export const shared = { glassG: null };
// Overhangs the camera should keep out of but people walk under (no collision): porch canopies,
// shed / garage / shelter roofs, carports, the big entrance canopies. World AABBs:
// { x0, z0, x1, z1, bottom, top }.
export const camBlocks = [];
// Rooms that a scene goes into (world/interior.js): rune = Anita and Rune's kitchen - the row's
// frame (ox, oz, yaw), the unit's a0 and floor y0, and its kitchen window's pane (pane: the builder,
// paneMesh: the mesh town.js makes of it, hidden while the camera is inside).
export const interiors = {};
// Street names (the same lists patrol.js uses for the notebook's Plats): roads along z (north-south)
// at x = rc(i) -> ns[i]; roads along x at z = rc(j) -> ew[j]. at(x, z): the nearest road's name.
export const roadNames = {
  ns: ['Gärdesvägen', 'Lingonvägen', 'Torgvägen', 'Rönnvägen', 'Parkvägen', 'Sjukhusvägen', 'Hagvägen', 'Västra vägen'],
  ew: ['Skogsbrynet', 'Björkvägen', 'Skolvägen', 'Solrosvägen', 'Blåklintsvägen', 'Kyrkvägen', 'Ängsvägen', 'Granvägen'],
  at(x, z) {
    const P = 80, H = 280, i = Math.max(0, Math.min(7, Math.round((x + H) / P))), j = Math.max(0, Math.min(7, Math.round((z + H) / P)));
    return Math.abs(x - (i * P - H)) < Math.abs(z - (j * P - H)) ? this.ns[i] : this.ew[j];
  },
};  // see-through 'tinted' glass for the whole town (town.js builds the mesh)
