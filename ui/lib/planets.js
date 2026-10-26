// Procedural planet textures for ASTRA LAB (no image files, no network: everything is generated at run time).
//
// HONEST NOTE: the continents below are hand-written, coarse lat/lon outlines (a few dozen points each). They are
// recognisable (you can find Africa, Australia, Florida, Italy, Japan ...) but they are NOT a real map and not survey
// data; coastlines are roughened with noise, climate/colour zones (deserts, forests, mountains) and city-light
// clusters are hand-placed blobs plus noise. The Moon's maria are hand-placed blobs and its craters are random, and
// Mars' dark regions are approximate. Visual only: nothing here touches the physics.
//
// Textures are equirectangular (u = longitude, v = latitude, north at the top) and generated in time-sliced chunks
// (generators driven by a small scheduler) so the user interface never freezes. A tiny 256x128 version is built
// immediately, the full-size one replaces it a moment later.
//   texture A: rgb = surface colour, a = height (for bump shading)
//   texture B (Earth only): r = city lights, g = clouds, b = open-ocean mask (sun glint)

export const QUALITY = {
  low: { tex: [256, 128], clouds: false, seg: [40, 24], stars: 1500, sky: [256, 128], bump: false, atmoSteps: 4, detail: 0, reflect: false, flare: false, halo: false, hills: false, shake: false, post: 0, puffs: 0 },
  medium: { tex: [1024, 512], clouds: true, seg: [72, 48], stars: 4000, sky: [1024, 512], bump: true, atmoSteps: 5, detail: 1, reflect: true, flare: true, halo: true, hills: true, shake: true, post: 1, puffs: 24 },
  high: { tex: [2048, 1024], clouds: true, seg: [96, 64], stars: 6500, sky: [1024, 512], bump: true, atmoSteps: 6, detail: 1, reflect: true, flare: true, halo: true, hills: true, shake: true, post: 2, puffs: 48 },
};
export const qualityOf = (q) => QUALITY[q] ?? QUALITY.medium;

// ------------------------------------------------------------------------------------------------ noise
const TAB = (() => { const t = new Float32Array(65536); let s = 987654321; for (let i = 0; i < 65536; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; t[i] = s / 4294967296; } return t; })();
/** Value noise, periodic in u (period 1): fx lattice cells across u, fy across v. */
function vnoise(u, v, fx, fy, seed) {
  const x = u * fx, y = v * fy; const ix = Math.floor(x), iy = Math.floor(y); const tx = x - ix, ty = y - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const x0 = ((ix % fx) + fx) % fx, x1 = x0 + 1 === fx ? 0 : x0 + 1; const b = seed * 7919;
  const a00 = TAB[(x0 * 157 + iy * 911 + b) & 65535], a10 = TAB[(x1 * 157 + iy * 911 + b) & 65535];
  const a01 = TAB[(x0 * 157 + (iy + 1) * 911 + b) & 65535], a11 = TAB[(x1 * 157 + (iy + 1) * 911 + b) & 65535];
  return (a00 + (a10 - a00) * sx) * (1 - sy) + (a01 + (a11 - a01) * sx) * sy;
}
/** fractal noise in [0,1]; fx0,fy0 = base lattice resolution. */
function fbm(u, v, fx0, fy0, oct, seed) {
  let s = 0, a = 0.5, tot = 0, fx = fx0, fy = fy0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(u, v, fx, fy, seed + o); tot += a; a *= 0.5; fx *= 2; fy *= 2; }
  return s / tot;
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixv = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------------------------------------ simplified world geometry [lon, lat]
const L = {
  northAmerica: [[-166, 68], [-156, 71], [-141, 70], [-128, 70], [-115, 68], [-100, 68], [-95, 68], [-85, 69], [-82, 66], [-88, 64], [-94, 60], [-92, 57], [-85, 55], [-80, 52], [-79, 55], [-77, 60], [-72, 62], [-66, 60], [-62, 58], [-60, 55], [-56, 52], [-58, 49], [-65, 49], [-66, 45], [-70, 43], [-70, 41.5], [-74, 40.5], [-76, 37], [-76, 35], [-81, 31], [-80, 26], [-82, 26], [-83, 29], [-86, 30], [-89, 30], [-94, 29.5], [-97, 27], [-97.5, 22], [-96, 19], [-94, 18], [-91, 19], [-90, 21], [-87, 21.5], [-88, 16], [-84, 15.5], [-83, 11], [-80, 9], [-77.5, 8.5], [-78, 7], [-80, 7.5], [-83, 8], [-86, 11], [-88, 13], [-92, 14.5], [-96, 16], [-101, 17.5], [-105, 20], [-106, 23.5], [-109, 25.5], [-112, 29.5], [-114.7, 31.7], [-114.5, 30.5], [-112, 26.5], [-110.3, 24.2], [-109.6, 23.1], [-112, 24.8], [-114.5, 27.7], [-115.5, 29.8], [-117, 32.5], [-118.5, 34], [-121, 34.6], [-122.5, 37.5], [-124, 40], [-124, 44], [-124, 48.4], [-123, 49], [-127, 51], [-130, 54.5], [-132, 57], [-136, 58.5], [-140, 60], [-146, 61], [-150, 60], [-152, 58.5], [-156, 57], [-162, 55.5], [-158, 58.5], [-162, 59.5], [-165, 62], [-161, 64], [-166, 65], [-163, 67]],
  greenland: [[-73, 78], [-60, 82], [-35, 83.5], [-18, 81.5], [-20, 75], [-22, 70], [-32, 68], [-40, 65], [-43, 60], [-48, 61], [-52, 65], [-54, 69], [-58, 75], [-67, 76]],
  baffin: [[-80, 73], [-70, 71], [-62, 66.5], [-66, 62.5], [-74, 64.5], [-78, 68], [-85, 70]],
  victoria: [[-118, 73], [-105, 73], [-101, 69.5], [-112, 69], [-118, 70]],
  ellesmere: [[-90, 80], [-68, 82], [-62, 82.5], [-75, 78], [-90, 76.5]],
  newfoundland: [[-59, 47.5], [-53, 47], [-53, 49.5], [-56, 51.5]],
  cuba: [[-85, 22], [-80, 23], [-74, 20], [-78, 19.8]],
  hispaniola: [[-74.4, 18.4], [-72, 19.9], [-68.5, 18.5], [-71, 17.8]],
  southAmerica: [[-77, 8.5], [-72, 12], [-68, 10.5], [-62, 10.5], [-60, 8], [-55, 5.8], [-51, 4], [-50, 0], [-48, -1], [-44, -2.5], [-39, -3.5], [-35, -5.5], [-35, -9], [-38.5, -13], [-39, -18], [-41, -22], [-44, -23], [-48, -25.5], [-48.5, -28], [-52, -32], [-54, -34.5], [-57, -35], [-58, -38], [-62, -39], [-65, -41], [-63.5, -42.5], [-65.5, -45], [-67.5, -46.5], [-66, -48], [-69, -51], [-68.5, -52.5], [-66, -55], [-72, -54], [-75, -50], [-74, -44], [-73, -40], [-72, -35], [-71.5, -30], [-70, -24], [-70, -18.5], [-76, -14], [-79, -8], [-81, -5], [-80, -2], [-80, 1], [-78, 2], [-77.5, 4], [-77, 7]],
  africa: [[-17, 21], [-16.5, 24], [-13, 27.5], [-10, 30], [-9.5, 32], [-6, 35.8], [0, 35.5], [10, 37], [11, 33.5], [15, 32.5], [20, 32], [20, 30.5], [25, 31.5], [32, 31], [34, 28], [33, 27], [35, 24], [37, 20], [39, 16], [43, 12.5], [43, 11.5], [47, 11], [51, 12], [51, 10], [48, 5], [44, 1], [41, -2], [40, -5], [39, -8], [40.5, -11], [40.5, -15], [35, -20], [35.5, -24], [33, -26], [32.5, -28], [30, -31.5], [27, -33.5], [23, -34], [20, -34.8], [18.5, -34], [18, -31], [16, -28], [14.5, -23], [12, -18], [11.5, -14], [13.5, -11], [12, -5], [9, -1], [9.5, 3.5], [8, 4.5], [5, 6], [2, 6.3], [-2, 5], [-5, 5], [-8, 4.5], [-11, 6.5], [-13, 9], [-15, 11], [-17, 14.5], [-16.5, 19]],
  madagascar: [[49.5, -12], [50.5, -15.5], [47.5, -25], [44, -25], [43.5, -21], [44.5, -16], [47, -14.5]],
  eurasia: [[-9, 37], [-9.5, 39], [-8.8, 42], [-9, 43.3], [-2, 43.5], [-1.5, 46], [-4.5, 48], [-1.5, 48.8], [2, 51], [4, 52], [7, 53.5], [8.5, 55.5], [8, 57], [10.5, 57.7], [10.5, 55], [12, 54.5], [14, 54], [19, 54.5], [21, 57], [24, 57.3], [24, 59.5], [28, 59.8], [23, 60.4], [21.5, 61], [21.5, 64], [25, 65], [22, 65.8], [17.5, 62.5], [17.2, 60.7], [19, 59.5], [16.5, 57], [14, 55.5], [12.8, 56.2], [11, 59], [8, 58], [5, 59], [5, 62], [10, 64], [14, 67.5], [18, 69.5], [25, 71], [31, 70], [33, 69.5], [41, 67], [40, 66], [35, 66], [34, 64.5], [38, 64], [40, 64.5], [44, 66.5], [44, 68.5], [54, 68.5], [60, 69], [68, 68.5], [69, 73], [75, 72], [80, 73], [87, 75], [100, 77.5], [105, 77.5], [113, 74], [125, 73.5], [130, 71], [140, 72.5], [150, 71.5], [160, 69.5], [170, 70], [180, 69], [180, 65], [178, 62], [174, 61], [170, 60], [164, 59.5], [163, 57.5], [162, 55], [160, 53], [157, 51.2], [155.8, 55], [156.5, 57.5], [159, 61], [154, 59.5], [149, 59.3], [143, 59.3], [140, 57.8], [137, 54.5], [141, 53], [141, 49], [138, 46], [135, 43.5], [131, 42.5], [129.5, 41], [128, 39], [129.5, 36], [126.5, 34.5], [126, 37.5], [125, 39.5], [121.5, 39], [121, 40.5], [118, 39.2], [119, 37.2], [122.5, 37], [120, 35.5], [121.5, 32], [122, 30], [121, 28], [119.5, 25.5], [117, 23.3], [113.5, 22.3], [110.5, 21], [108, 21.5], [106.5, 20], [105.8, 18.5], [108.5, 15.5], [109, 12], [107, 10.5], [105, 8.8], [104.8, 10.5], [103, 10.7], [101, 12.5], [100, 13.4], [99.5, 10], [100.3, 7.5], [101, 6.5], [103.5, 4.2], [104.2, 1.4], [102, 2.5], [100.5, 4.5], [98.5, 8], [98.5, 11], [97.5, 16.5], [94.5, 16], [94, 19], [92, 21], [91.5, 23], [90, 22], [87, 21.5], [85, 19.5], [82, 17], [80.3, 15], [80, 11], [78, 8.3], [77, 8.5], [76, 10.5], [74.7, 13], [73.2, 17.5], [72.8, 21], [70, 21], [68.5, 23.3], [66.5, 25.3], [62, 25], [57.5, 25.8], [56.5, 27], [54.5, 26.5], [51, 28.5], [49, 30.2], [48, 29.9], [50, 26], [50.5, 24.5], [52, 24], [54.5, 24.3], [56.3, 26.3], [56.6, 24.5], [59.5, 22.5], [57.7, 19], [55, 17], [52, 16], [45, 12.8], [43.5, 13], [42.8, 15], [41, 19], [38.5, 23.5], [35, 28], [34.3, 27.8], [35, 29.5], [34, 31.3], [35.8, 34], [36, 36.5], [32, 36.2], [30, 36.5], [27.5, 37], [26.2, 39.3], [26.5, 40.3], [24, 40.5], [23, 39.5], [24, 38], [22, 36.5], [21.5, 38.5], [19.5, 40], [19.5, 42], [16, 43.7], [13.5, 45.5], [12.3, 45], [12.5, 43.5], [16, 41.8], [18.5, 40.2], [16.5, 39], [16, 38], [15.7, 40], [12.5, 41.5], [10.5, 43], [8.8, 44.4], [7, 43.6], [3.5, 43.3], [3, 42], [0, 40], [-0.5, 38.5], [-2, 36.7], [-5.5, 36], [-7, 37.2]],
  chukotka: [[-180, 65], [-180, 69], [-175, 67.5], [-170, 66], [-172, 64.5]],
  uk: [[-5.5, 50], [1.5, 51], [1.7, 52.8], [0, 53.5], [-2, 55.5], [-2, 57.5], [-4, 57.7], [-3, 58.6], [-5, 58.6], [-6, 56.5], [-5, 55], [-3, 54.8], [-3, 53.3], [-4.5, 53], [-5, 51.7], [-3, 51.2]],
  ireland: [[-6, 52], [-6, 54], [-8, 55.2], [-10, 54], [-10, 52], [-8, 51.5]],
  iceland: [[-24, 65.5], [-22, 66.4], [-16, 66.5], [-13.5, 65], [-18, 63.4], [-22, 63.8]],
  honshu: [[131, 34], [135, 33.5], [137, 34.5], [140, 35], [141, 38], [142, 40], [141, 41.5], [139.8, 40], [139, 37.5], [136, 36.5], [133, 35.5], [131.3, 34.3]],
  hokkaido: [[140, 42], [141.5, 45.4], [145.5, 43.5], [143, 42], [141, 42.5]],
  kyushu: [[130, 31.3], [131.5, 31.5], [131.8, 33.8], [130, 33.6]],
  sakhalin: [[142, 46], [143.3, 49], [143, 54], [142, 54], [142, 49]],
  taiwan: [[120.2, 23], [121.5, 25], [122, 24.5], [120.8, 22]],
  hainan: [[108.6, 19.2], [110.6, 20], [111, 19], [109.5, 18.2]],
  sriLanka: [[80, 9.5], [81.8, 7.5], [81, 6], [80, 6.5], [79.8, 8]],
  sumatra: [[95.3, 5.6], [98, 4], [104, -1.5], [106, -3], [105.7, -5.8], [102, -4], [99, 0], [97, 2.7]],
  java: [[105.5, -6.5], [108, -6.2], [112.5, -6.8], [114.5, -7.8], [114, -8.6], [108, -7.8], [106, -7.2]],
  borneo: [[109, 1.5], [111, 1.8], [113, 3.3], [115.5, 5], [117.8, 7], [119, 5], [118, 1], [117.5, -0.5], [116, -3.8], [114, -4], [111, -3], [110, -1.8], [109, -1]],
  sulawesi: [[119.5, -0.5], [120.5, 1], [125, 1.6], [123, 0.5], [121, -1], [123, -4], [122, -5], [120.3, -5.6], [119.5, -3.5], [118.8, -2.6]],
  newGuinea: [[131, -0.8], [134, -0.8], [138, -1.5], [141, -2.6], [145.5, -4.5], [148, -6], [147.5, -8], [150.5, -10.5], [146, -8.8], [143, -9], [141, -9.1], [138, -8.3], [138, -6], [135, -4.3], [132.5, -3.5]],
  luzon: [[120, 18.5], [122.3, 18.3], [122, 16], [124, 13], [121, 13.5], [120.5, 15]],
  mindanao: [[122, 8], [125.5, 9.5], [126.5, 7], [125.5, 6], [123, 7.2]],
  australia: [[113.5, -22], [114, -26], [115, -30], [115, -34], [118, -35], [123, -34], [126, -32.3], [131, -31.5], [134, -32.5], [136, -35], [138, -34], [139, -36], [141, -38], [144, -38.5], [146, -39], [148, -37.8], [150, -37], [151, -33], [153, -29], [153.3, -25], [151, -23], [149, -21], [146, -18.8], [145.5, -15], [143.5, -14], [142.5, -10.8], [141.5, -13], [141.7, -16.5], [140.5, -17.5], [139, -17], [136, -15.5], [135.5, -13.5], [136.8, -12], [132, -11.3], [130, -13], [129, -15], [127, -14], [125, -15], [123, -17], [122, -18], [120, -19.6], [117, -20.5], [114.5, -21.7]],
  tasmania: [[144.7, -40.7], [148.3, -40.9], [148, -43], [146, -43.6], [145, -42]],
  nzNorth: [[172.7, -34.5], [175, -37], [178.5, -37.7], [177, -39.5], [175, -41.5], [174.8, -39.5], [173.8, -39.2], [174.5, -37]],
  nzSouth: [[172.7, -40.5], [174, -41.5], [174, -42.5], [171, -44.3], [169, -46.5], [166.5, -46], [168, -44], [171, -42]],
  sicily: [[12.5, 38], [15.6, 38.3], [15, 36.7]],
  sardinia: [[8.2, 41], [9.7, 41], [9.6, 39.2], [8.5, 39]],
  antarctica: [[-75, -72], [-68, -69], [-62, -64.5], [-57, -63.5], [-60, -68], [-62, -72], [-58, -75], [-45, -78], [-30, -75], [-20, -71], [0, -70], [20, -69.5], [40, -68], [60, -67.5], [70, -69], [80, -67.5], [100, -66.5], [120, -66.5], [140, -66.7], [160, -70], [170, -72], [165, -77], [180, -78], [180, -90], [-180, -90], [-180, -77], [-160, -76.5], [-140, -75.5], [-120, -74.3], [-100, -73.5], [-80, -73.5]],
};
const WATER = { // inland seas / big lakes cut out of the land
  blackSea: [[28, 41.5], [31, 41.2], [35, 42], [41, 41.5], [41.5, 43], [38, 44.5], [37, 45.3], [35, 45], [33, 44.4], [32.5, 46], [31, 46.6], [29.7, 45.3], [28.7, 43.5]],
  caspian: [[47, 45], [50, 46.5], [53, 45.5], [51, 42.5], [53, 40], [54, 37.5], [50, 37], [49, 39], [49.5, 40.5], [48, 42], [47.5, 43.5]],
  hudson: [[-94, 59], [-92, 57], [-85, 55], [-80, 52], [-79, 55], [-77, 60], [-82, 63], [-88, 64], [-94, 62]],
  lakesUS: [[-92, 47], [-85, 47.5], [-83, 45.5], [-88, 42], [-87.5, 46]],
  victoria: [[31.5, -0.5], [34, -0.3], [34, -2.6], [32, -2.8]],
  baltic: [[17, 57.5], [19, 59], [22, 60], [24.5, 59.5], [23, 57]],
};
const ICE = ['greenland', 'antarctica'];

// region blobs [lon, lat, radiusLon, radiusLat, strength 0..1]
const DESERT = [[5, 23, 28, 7, 1], [-5, 22, 14, 6, 1], [22, 25, 14, 6, 0.95], [42, 24, 12, 7, 0.95], [50, 21, 9, 5, 0.9], [100, 41, 18, 5, 0.85], [60, 38, 8, 5, 0.6], [68, 29, 9, 5, 0.7], [133, -25, 16, 8, 0.9], [122, -27, 9, 7, 0.7], [18, -24, 7, 5, 0.85], [-110, 33, 7, 5, 0.65], [-70, -24, 3, 6, 0.85], [-69, -40, 4, 9, 0.5], [35, 33, 3, 3, 0.5], [45, 34, 6, 3, 0.45], [110, 44, 10, 3, 0.6], [25, -21, 8, 5, 0.6], [-102, 28, 8, 4, 0.45]];
const FOREST = [[-62, -4, 13, 8, 1], [-50, -10, 6, 9, 0.6], [22, -1, 11, 6, 1], [10, 4, 6, 4, 0.8], [100, 3, 10, 6, 1], [115, 0, 8, 6, 0.95], [140, -5, 8, 4, 0.9], [-85, 12, 6, 4, 0.7], [-95, 52, 25, 6, 0.8], [-130, 55, 10, 5, 0.75], [90, 60, 55, 8, 0.85], [35, 60, 15, 6, 0.75], [15, 62, 6, 6, 0.7], [105, 25, 10, 5, 0.7], [-78, 36, 7, 7, 0.6], [-90, 35, 7, 5, 0.55], [2, 47, 9, 5, 0.6], [128, 37, 8, 7, 0.6], [80, 22, 8, 5, 0.5], [-51, -24, 5, 5, 0.6], [150, -30, 4, 6, 0.4], [172, -42, 3, 3, 0.7]];
const MOUNTAIN = [[85, 32, 16, 5, 1], [72, 37, 6, 3, 0.8], [-105, 40, 6, 13, 0.75], [-72, -20, 3, 25, 1], [-75, 0, 3, 8, 0.8], [10, 46.5, 5, 2, 0.8], [60, 57, 2, 8, 0.45], [40, 8, 5, 4, 0.6], [-70, -45, 2.5, 7, 0.8], [-120, 40, 3, 7, 0.55], [-140, 61, 6, 3, 0.75], [102, 30, 4, 5, 0.85], [45, 42, 6, 2, 0.7], [-82, 37, 5, 5, 0.4], [30, -28, 4, 3, 0.45], [138, 36, 2, 2, 0.6], [170, -44, 3, 2, 0.7], [-18, 65, 3, 1.3, 0.6], [95, 62, 25, 4, 0.35]];
const CITIES = [[-74, 40.7, 6, 3, 1], [-87.6, 41.9, 4, 2.5, 0.7], [-118, 34, 4, 2.5, 0.8], [-96, 32, 4, 3, 0.55], [-81, 28, 3, 3, 0.45], [-99, 19.4, 3, 2, 0.8], [-46.6, -23.6, 4, 3, 0.9], [-58.4, -34.6, 3, 2, 0.6], [-43, -22.9, 3, 2, 0.6], [-77, -12, 2, 2, 0.45], [-75, 5, 2, 2, 0.4], [-0.1, 51.5, 5, 3, 1], [2.3, 48.8, 4, 3, 0.9], [8, 50.5, 6, 3, 1], [12.5, 42, 4, 3, 0.7], [-3.7, 40.4, 3, 2, 0.5], [21, 52, 6, 3, 0.6], [37.6, 55.8, 5, 3, 0.8], [30, 60, 3, 2, 0.4], [31, 30, 4, 3, 0.8], [3.4, 6.5, 3, 2, 0.7], [28, -26, 3, 3, 0.6], [36.8, -1.3, 2, 2, 0.35], [77, 28.6, 5, 4, 0.85], [72.8, 19, 3, 3, 0.8], [88.4, 22.6, 4, 3, 0.75], [80, 13, 3, 3, 0.55], [67, 25, 2, 2, 0.45], [51, 35.7, 4, 3, 0.65], [35, 38, 5, 3, 0.45], [46, 24.6, 2, 2, 0.45], [116.4, 39.9, 4, 3, 0.85], [121.5, 31.2, 4, 3, 1], [113.3, 23, 3, 2, 0.9], [104, 30.6, 4, 3, 0.65], [127, 37.5, 2.5, 2, 1], [139.7, 35.7, 3, 2.5, 1], [135, 34.7, 3, 1.5, 0.8], [106.8, -6.2, 4, 2, 0.8], [100.5, 13.7, 3, 3, 0.6], [121, 14.6, 2, 2, 0.6], [105, 21, 2, 2, 0.6], [151, -33.9, 3, 2, 0.6], [145, -37.8, 2, 1.5, 0.45], [174.8, -36.9, 1.5, 1.5, 0.35]];

// ------------------------------------------------------------------------------------------------ canvas helpers
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function blurred(src, radiusPx) {
  const c = mkCanvas(src.width, src.height), ctx = c.getContext('2d');
  if ('filter' in ctx) { ctx.filter = `blur(${Math.max(0.5, radiusPx)}px)`; ctx.drawImage(src, 0, 0); ctx.filter = 'none'; }
  else { // fallback: box-ish blur through repeated down/up scaling
    const k = Math.max(2, Math.round(radiusPx)); const t = mkCanvas(Math.max(2, src.width / k | 0), Math.max(2, src.height / k | 0));
    t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); ctx.imageSmoothingEnabled = true; ctx.drawImage(t, 0, 0, c.width, c.height);
  }
  return c;
}
const pixelsOf = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
function drawPolys(ctx, W, H, list, fill) {
  ctx.fillStyle = fill;
  for (const pts of list) {
    ctx.beginPath();
    pts.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill();
  }
}
/** Add soft elliptical blobs into one colour channel of a canvas (additive). */
function blobs(ctx, W, H, list, rgb, gain = 1) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [lo, la, rx, ry, a] of list) {
    ctx.save(); ctx.translate((lo + 180) / 360 * W, (90 - la) / 180 * H); ctx.scale(rx / 360 * W, ry / 180 * H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); const col = (al) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al})`;
    g.addColorStop(0, col(Math.min(1, a * gain))); g.addColorStop(0.55, col(Math.min(1, a * gain) * 0.6)); g.addColorStop(1, col(0));
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------------------------------------ generators (generator functions, yield every few rows)
const ROWS = 6;
function buildEarthMasks(W, H) {
  const land = mkCanvas(W, H); let c = land.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  drawPolys(c, W, H, Object.values(L), '#fff'); drawPolys(c, W, H, Object.values(WATER), '#000');
  const ice = mkCanvas(W, H); c = ice.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); drawPolys(c, W, H, ICE.map((k) => L[k]), '#fff');
  const climate = mkCanvas(W, H); c = climate.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  blobs(c, W, H, DESERT, [255, 0, 0]); blobs(c, W, H, FOREST, [0, 255, 0]); blobs(c, W, H, MOUNTAIN, [0, 0, 255]);
  const pop = mkCanvas(W, H); c = pop.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); blobs(c, W, H, CITIES, [255, 255, 255], 1);
  return { land: pixelsOf(blurred(land, W / 560)), shelf: pixelsOf(blurred(land, W / 95)), ice: pixelsOf(blurred(ice, W / 400)), climate: pixelsOf(climate), pop: pixelsOf(pop) };
}
function* earthGen(W, H, withClouds) {
  const M = buildEarthMasks(W, H); yield;
  const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
  const hfNoise = Math.max(1, W / 256), warp = W / 170;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, lat = 90 - v * 180, alat = Math.abs(lat);
    // cloud latitude bands: equatorial belt, subtropical gaps, mid-latitude storm tracks
    const band = 0.5 + 0.22 * Math.exp(-((lat / 11) ** 2)) - 0.2 * Math.exp(-(((alat - 26) / 9) ** 2)) + 0.22 * Math.exp(-(((alat - 56) / 12) ** 2));
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, p = y * W + x, q = p * 4;
      // coastline: sample the blurred polygon mask through a small noise warp so straight polygon edges turn ragged
      const wx = (vnoise(u, v, 30, 15, 41) - 0.5) * warp, wy = (vnoise(u, v, 30, 15, 43) - 0.5) * warp + (vnoise(u, v, 90, 45, 47) - 0.5) * warp * 0.5;
      const xs = Math.max(0, Math.min(W - 1, Math.round(x + wx))), ys = Math.max(0, Math.min(H - 1, Math.round(y + wy))), qs = (ys * W + xs) * 4;
      const m = M.land[qs] / 255, sh = M.shelf[q] / 255, ic = M.ice[qs] / 255;
      const n2 = fbm(u, v, 40, 20, 3, 9), n3 = fbm(u, v, 160, 80, 2, 4);
      const nc = m > 0.12 && m < 0.88 ? fbm(u, v, 48, 24, 4, 1) : 0.5;
      const lm = m + (nc - 0.5) * 0.5;
      const isLand = sstep(0.47, 0.53, lm), n1 = n2;
      let r = 0, g = 0, b = 0, hgt = 0, ocean = 0;
      if (isLand > 0.001) {
        const dry = M.climate[q] / 255, wet = M.climate[q + 1] / 255, mtn = M.climate[q + 2] / 255;
        const var1 = fbm(u, v, 18, 9, 4, 2), var2 = n2;
        // base: grassland / scrub mixture that depends loosely on latitude
        const tropic = 1 - sstep(10, 36, alat);
        let gr = mixv(0.30, 0.22, var1), gg = mixv(0.40, 0.36, var1), gb = mixv(0.16, 0.12, var1);
        gr = mixv(gr, 0.46, (1 - wet) * (var2 - 0.35) * 0.9); gg = mixv(gg, 0.42, (1 - wet) * (var2 - 0.35) * 0.6);
        const fr = mixv(0.05, 0.10, var2), fg = mixv(0.20, 0.27, var2), fb = mixv(0.07, 0.09, var2);
        const wf = clamp01(wet * (0.55 + 0.8 * var1) + tropic * 0.15);
        r = mixv(gr, fr, wf); g = mixv(gg, fg, wf); b = mixv(gb, fb, wf);
        // deserts
        const dd = clamp01(dry * (0.7 + 0.6 * var2) - wet * 0.4);
        const sr = mixv(0.78, 0.62, var1), sg = mixv(0.63, 0.47, var1), sb = mixv(0.40, 0.30, var1);
        r = mixv(r, sr, dd); g = mixv(g, sg, dd); b = mixv(b, sb, dd);
        // tundra / taiga towards the poles
        const tun = sstep(58, 72, alat);
        r = mixv(r, 0.52, tun * 0.85); g = mixv(g, 0.54, tun * 0.85); b = mixv(b, 0.46, tun * 0.85);
        // relief
        const rough = 1 - Math.abs(2 * (mtn > 0.05 ? fbm(u, v, 90, 45, 3, 12) : 0.5) - 1);
        hgt = clamp01(0.15 + 0.3 * var1 + mtn * (0.3 + 0.5 * rough) + dry * 0.05);
        const rock = sstep(0.5, 0.72, hgt);
        r = mixv(r, 0.47, rock * 0.75); g = mixv(g, 0.40, rock * 0.75); b = mixv(b, 0.32, rock * 0.75);
        const snowLine = 0.93 - sstep(35, 70, alat) * 0.45;
        const snow = sstep(snowLine, snowLine + 0.08, hgt + (n3 - 0.5) * 0.1) * 0.85;
        r = mixv(r, 0.95, snow); g = mixv(g, 0.96, snow); b = mixv(b, 0.98, snow);
        const fine = 0.80 + 0.40 * n3 + 0.25 * (var2 - 0.5); r *= fine; g *= fine; b *= fine;
        const icy = clamp01(ic * 1.2 + sstep(0.35, 0.6, ic) * 0.3);
        r = mixv(r, 0.93, icy); g = mixv(g, 0.96, icy); b = mixv(b, 1.0, icy); hgt = mixv(hgt, 0.45, icy);
      }
      // ocean colour: deep -> shelf, sea ice near the poles
      const shallow = sstep(0.10, 0.50, sh) * 0.85;
      const dr = mixv(0.020, 0.045, n2), dg = mixv(0.08, 0.17, n2), db = mixv(0.22, 0.36, n2);
      const or = mixv(dr, 0.10, shallow), og = mixv(dg, 0.42, shallow), ob = mixv(db, 0.52, shallow);
      const seaIce = sstep(0, 1, (alat - (lat > 0 ? 72 : 64)) / 6 + (n1 - 0.5) * 1.6);
      ocean = (1 - isLand) * (1 - clamp01(seaIce));
      const wr = mixv(or, 0.9, seaIce > 0 ? clamp01(seaIce) : 0), wg = mixv(og, 0.94, clamp01(seaIce)), wb = mixv(ob, 0.98, clamp01(seaIce));
      r = mixv(wr, r, isLand); g = mixv(wg, g, isLand); b = mixv(wb, b, isLand);
      A[q] = clamp01(r) * 255; A[q + 1] = clamp01(g) * 255; A[q + 2] = clamp01(b) * 255; A[q + 3] = clamp01(hgt * isLand) * 255;
      // night lights (clustered, sparse, mostly near coasts and big cities)
      const pop = M.pop[qs] / 255;
      const lights = pop > 0.03 && isLand > 0.5 ? (1 - ic) * pop * sstep(0.36, 0.7, fbm(u, v, 90 * hfNoise / 4 | 0 || 1, 45 * hfNoise / 4 | 0 || 1, 3, 13)) * (0.5 + 0.9 * n3) * (1.2 + 1.6 * sstep(0.5, 1, pop)) : 0;
      B[q] = clamp01(lights) * 255;
      let cl = 0;
      if (withClouds) {
        const cw = fbm(u, v, 6, 3, 2, 21);
        const cn = fbm(u + (cw - 0.5) * 0.14, v + (cw - 0.5) * 0.06, 8, 4, 4, 23);          // large weather systems
        const cf = fbm(u + (cw - 0.5) * 0.05, v + (cw - 0.5) * 0.03, 52, 26, 3, 29);       // small cloud cells, so the cover is broken up instead of one white sheet
        cl = sstep(0.47, 0.66, cn * 0.58 + cf * 0.42 + (band - 0.5) * 0.45) * (0.55 + 0.45 * sstep(0.35, 0.6, cf));
      }
      B[q + 1] = cl * 255; B[q + 2] = ocean * 255; B[q + 3] = 255;
    }
    if (y % ROWS === ROWS - 1) yield;
  }
  return { W, H, A, B };
}

function craterField(W, H, N, minDeg, maxDeg, seed, heightOut, albOut, strength) {
  const rnd = rng(seed);
  for (let k = 0; k < N; k++) {
    const lon = rnd() * 360 - 180, lat = Math.asin(rnd() * 2 - 1) * 180 / Math.PI;
    if (Math.abs(lat) > 86) continue;
    const rDeg = Math.min(maxDeg, minDeg * Math.pow(1 - rnd() * 0.9999, -1 / 1.45));
    const cx = (lon + 180) / 360 * W, cy = (90 - lat) / 180 * H; const cl = Math.max(0.12, Math.cos(lat * Math.PI / 180));
    const ry = rDeg / 180 * H, rx = rDeg / 360 * W / cl; const ext = 2.3;
    const y0 = Math.max(0, Math.floor(cy - ry * ext)), y1 = Math.min(H - 1, Math.ceil(cy + ry * ext));
    const xr = Math.min(W / 2, Math.ceil(rx * ext)); const depth = (0.5 + rnd() * 0.5) * strength * (rDeg < 1.2 ? 0.7 + rDeg * 0.2 : 1);
    const fresh = Math.pow(rnd(), 2.5);
    if (ry < 0.6) continue;
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      for (let dx = -xr; dx <= xr; dx++) {
        const d2 = ((dx / rx) ** 2) + dy * dy; if (d2 > ext * ext) continue;
        const d = Math.sqrt(d2); let h, al;
        if (d < 1) { const t = d * d; h = -depth * (1 - t) * 0.9 + (d > 0.78 ? depth * 0.55 * sstep(0.78, 1, d) : 0); al = -0.05 * (1 - t) - fresh * 0.0; if (rDeg > 2.5 && d < 0.25) h += depth * 0.35 * (1 - d / 0.25); }
        else { const e = Math.exp(-(d - 1) * 2.4); h = depth * 0.5 * e; al = fresh * 0.16 * e + 0.02 * e; }
        if (d < 1.05 && d > 0.85) al += 0.012 + fresh * 0.05;
        const xx = (((Math.round(cx) + dx) % W) + W) % W; const idx = y * W + xx;
        heightOut[idx] += h; albOut[idx] += al;
      }
    }
  }
}
function* moonGen(W, H) {
  const hgt = new Float32Array(W * H), alb = new Float32Array(W * H);
  const scale = W / 1024;
  craterField(W, H, Math.round(2600 * scale * scale), 0.22 / Math.max(0.5, scale ** 0.3) * (scale < 0.5 ? 3 : 1), 7, 71, hgt, alb, 0.06);
  yield;
  const maria = document.createElement('canvas'); maria.width = W; maria.height = H; const c = maria.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  blobs(c, W, H, [[-16, 35, 30, 17, 1], [18, 28, 15, 11, 1], [31, 8.5, 23, 13, 1], [52, -4, 15, 12, 0.95], [59, 17, 12, 8, 1], [-15, -21, 18, 12, 0.9], [-39, -24, 11, 9, 1], [-50, 15, 40, 24, 0.9], [0, 58, 50, 6, 0.6], [34, -15, 9, 8, 0.85], [-3, 10, 12, 9, 0.75], [-25, 52, 15, 4, 0.5], [-85, 0, 6, 7, 0.7], [100, 25, 12, 9, 0.5], [130, -5, 14, 9, 0.35], [-160, 20, 12, 9, 0.35]], [255, 255, 255], 1);
  const mp = pixelsOf(blurred(maria, W / 500)); yield;
  const A = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, p = y * W + x, q = p * 4;
      const n1 = fbm(u, v, 10, 5, 6, 3), n2 = fbm(u, v, 64, 32, 3, 5);
      const mm = sstep(0.28, 0.6, mp[q] / 255 + (n1 - 0.5) * 0.45);
      let a = 0.47 + 0.12 * (n1 - 0.5) * 2 + 0.10 * (n2 - 0.5) + alb[p];
      a = mixv(a, 0.19 + 0.07 * n2, mm);
      const hh = hgt[p] + mixv((n1 - 0.5) * 0.03, -0.012, mm) + (n2 - 0.5) * 0.004;
      const tint = mm * 0.05;
      A[q] = clamp01(a * 0.99 + 0.012 - tint * 0.5) * 255; A[q + 1] = clamp01(a * 0.95 + 0.008) * 255; A[q + 2] = clamp01(a * 0.88 + tint * 0.3) * 255;
      A[q + 3] = clamp01(0.5 + hh * 4) * 255;
    }
    if (y % ROWS === ROWS - 1) yield;
  }
  return { W, H, A, B: null };
}
function* marsGen(W, H) {
  const hgt = new Float32Array(W * H), alb = new Float32Array(W * H);
  const scale = W / 1024;
  craterField(W, H, Math.round(900 * scale * scale), 0.35, 8, 91, hgt, alb, 0.05);
  yield;
  const cv = mkCanvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  blobs(c, W, H, [[70, 8, 20, 15, 1], [-20, 42, 28, 15, 0.9], [-25, 10, 16, 13, 0.75], [-150, -32, 30, 14, 0.95], [-175, -30, 18, 16, 0.8], [-100, -35, 24, 13, 0.7], [-5, 0, 14, 10, 0.85], [-50, 15, 16, 12, 0.75], [105, -20, 18, 13, 0.75], [140, 0, 24, 11, 0.7], [-70, -45, 18, 10, 0.65], [25, -10, 18, 9, 0.65], [95, -5, 14, 8, 0.6]], [255, 0, 0]);
  blobs(c, W, H, [[-105, 10, 28, 20, 1], [-175, 25, 12, 12, 0.9], [150, 20, 14, 10, 0.95], [70, -42, 11, 9, 1], [50, 22, 16, 10, 0.8], [-40, 0, 22, 8, 0.4], [100, 45, 15, 8, 0.6]], [0, 255, 0]);
  blobs(c, W, H, [[-134, 18.5, 4.2, 4.2, 1], [-112, 1, 4.5, 4.5, 0.85], [-103, 9, 4.5, 4.5, 0.75], [-121, 8, 4.5, 4.5, 0.85], [147, 25, 4.5, 4.5, 0.6], [-95, -10, 8, 10, 0.25]], [0, 0, 255]);
  // Valles Marineris trench and Hellas basin floor
  const vm = mkCanvas(W, H), vc = vm.getContext('2d'); vc.fillStyle = '#000'; vc.fillRect(0, 0, W, H); vc.strokeStyle = '#fff'; vc.lineCap = 'round'; vc.lineWidth = Math.max(1.5, W / 130);
  vc.beginPath(); vc.moveTo((-95 + 180) / 360 * W, (90 + 6) / 180 * H); vc.lineTo((-80 + 180) / 360 * W, (90 + 10) / 180 * H); vc.lineTo((-60 + 180) / 360 * W, (90 + 9) / 180 * H); vc.lineTo((-45 + 180) / 360 * W, (90 + 12) / 180 * H); vc.stroke();
  const cp = pixelsOf(cv), vp = pixelsOf(blurred(vm, W / 500)); yield;
  const A = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, lat = 90 - v * 180, alat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, p = y * W + x, q = p * 4;
      const n1 = fbm(u, v, 8, 4, 6, 17), n2 = fbm(u, v, 48, 24, 4, 19), n3 = fbm(u, v, 200, 100, 2, 23);
      const dark = sstep(0.2, 0.7, cp[q] / 255 * (0.55 + 0.9 * n1));
      const bright = cp[q + 1] / 255, high = cp[q + 2] / 255, vmr = vp[q] / 255;
      let r = mixv(0.66, 0.80, n1) * (0.88 + 0.2 * n2), g = mixv(0.34, 0.46, n1) * (0.86 + 0.2 * n2), b = mixv(0.19, 0.28, n1) * (0.84 + 0.2 * n2);
      r = mixv(r, 0.85, bright * 0.55); g = mixv(g, 0.60, bright * 0.55); b = mixv(b, 0.40, bright * 0.5);
      r = mixv(r, 0.27, dark * 0.85); g = mixv(g, 0.17, dark * 0.85); b = mixv(b, 0.13, dark * 0.85);
      const fine = 0.9 + 0.2 * n3; r *= fine; g *= fine; b *= fine;
      r = mixv(r, 0.36, vmr * 0.8); g = mixv(g, 0.20, vmr * 0.8); b = mixv(b, 0.14, vmr * 0.8);
      r += alb[p]; g += alb[p]; b += alb[p];
      const cap = sstep(0, 1, (alat - (lat > 0 ? 82 : 78)) / 4 + (n2 - 0.5) * 1.2);
      r = mixv(r, 0.95, cap); g = mixv(g, 0.93, cap); b = mixv(b, 0.92, cap);
      A[q] = clamp01(r) * 255; A[q + 1] = clamp01(g) * 255; A[q + 2] = clamp01(b) * 255;
      const hh = hgt[p] + high * 0.12 * (0.7 + 0.3 * n2) - vmr * 0.05 + (n1 - 0.5) * 0.04 - bright * 0.0 + (n2 - 0.5) * 0.004;
      A[q + 3] = clamp01(0.5 + hh * 3.5) * 255;
    }
    if (y % ROWS === ROWS - 1) yield;
  }
  return { W, H, A, B: null };
}

/** Milky-Way / dust-lane texture for the sky dome (soft, low contrast; the individual stars are GL points). */
function* skyGen(W, H) {
  const out = new Uint8Array(W * H * 4);
  const P = norm3([0.34, -0.42, 0.84]), C = norm3([0.78, 0.46, -0.1]);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, lat = (0.5 - v) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, lon = (u - 0.5) * 2 * Math.PI;
      const d0 = cl * Math.cos(lon), d1 = cl * Math.sin(lon), d2 = sl;
      const b = Math.asin(Math.max(-1, Math.min(1, d0 * P[0] + d1 * P[1] + d2 * P[2]))), core = d0 * C[0] + d1 * C[1] + d2 * C[2];
      const n = fbm(u, v, 14, 7, 6, 31), dust = fbm(u, v, 30, 15, 4, 37);
      const band = Math.exp(-((b / (0.17 + 0.05 * n)) ** 2));
      let s = band * (0.35 + 0.9 * n) * (0.65 + 0.6 * sstep(-0.4, 1, core));
      s *= 1 - 0.85 * sstep(0.55, 0.78, dust) * Math.exp(-((b / 0.12) ** 2));
      const glow = 0.06 * Math.exp(-((b / 0.6) ** 2));
      const q = (y * W + x) * 4; const I = clamp01(s * 0.42 + glow);
      out[q] = clamp01(I * (0.85 + 0.25 * sstep(0, 1, core))) * 255; out[q + 1] = clamp01(I * 0.92) * 255; out[q + 2] = clamp01(I * (1.05 - 0.2 * sstep(0, 1, core))) * 255; out[q + 3] = 255;
    }
    if (y % 4 === 3) yield;
  }
  return { W, H, A: out, B: null };
}
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }

/** Star catalogue-like random sky: interleaved [x,y,z, r,g,b,size]. Concentrated towards the galactic band. */
export function makeStars(n, seed = 12345) {
  const r = rng(seed), P = norm3([0.34, -0.42, 0.84]); const out = new Float32Array(n * 7); let k = 0;
  while (k < n) {
    const z = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.sqrt(1 - z * z); const d = [rr * Math.cos(th), rr * Math.sin(th), z];
    const gb = Math.abs(d[0] * P[0] + d[1] * P[1] + d[2] * P[2]);
    if (gb > 0.35 && r() > 0.35 * (1 - gb) + 0.12) continue;  // thin out away from the galactic plane
    const m = Math.pow(r(), 5.0);                 // few bright, many faint
    const t = r(); const col = t < 0.15 ? [1.0, 0.72, 0.55] : t < 0.75 ? [1, 0.97, 0.92] : [0.72, 0.82, 1.0];
    const br = 0.25 + 0.75 * m;
    out.set([d[0] * 1e5, d[1] * 1e5, d[2] * 1e5, col[0] * br, col[1] * br, col[2] * br, 1.0 + 2.2 * m], k * 7); k++;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ scheduler + texture manager
const pending = [];
let running = false;
function pump() {
  if (running) return; running = true;
  const step = () => {
    const t0 = performance.now();
    while (pending.length && performance.now() - t0 < 9) {
      const job = pending[0]; let r;
      try { r = job.gen.next(); } catch (e) { pending.shift(); job.fail?.(e); continue; }
      if (r.done) { pending.shift(); job.done(r.value); }
    }
    if (pending.length) setTimeout(step, 0); else running = false;
  };
  setTimeout(step, 0);
}
function schedule(gen, done, fail) { pending.push({ gen, done, fail }); pump(); }
function runSync(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }

function uploadTexture(gl, data, w, h, mips = true) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return t;
}
function downsample(tex, blocks = 64) { // coarse colour table for the ground tint under the vehicle
  const { W, H, A, B } = tex; const bw = blocks, bh = blocks / 2, out = new Float32Array(bw * bh * 4);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    let r = 0, g = 0, b = 0, o = 0, n = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const x = Math.min(W - 1, Math.floor((i + (sx + 0.5) / 3) / bw * W)), y = Math.min(H - 1, Math.floor((j + (sy + 0.5) / 3) / bh * H)); const q = (y * W + x) * 4;
      r += A[q]; g += A[q + 1]; b += A[q + 2]; if (B) o += B[q + 2]; n++;
    }
    const k = (j * bw + i) * 4; out[k] = r / n / 255; out[k + 1] = g / n / 255; out[k + 2] = b / n / 255; out[k + 3] = o / n / 255;
  }
  return { w: bw, h: bh, d: out };
}

/** Owns every generated texture of one GL context. get() is cheap and never blocks: it returns what is ready so far. */
// Bundled imagery (2.0). Keys: color (RGB), height (grey relief), night (grey city lights), water (white = ocean).
const PHOTO_MAPS = {
  earth: { color: 'earth-color.jpg', height: 'earth-height.png', night: 'earth-night.jpg', water: 'earth-water.png' },
  // 2.4: sharper versions (used at medium and high quality) and a real satellite cloud map; each falls back to the older file if missing
  earth24: { color: 'earth-color-4k.jpg', height: 'earth-height-2k.png', night: 'earth-night.jpg', water: 'earth-water-2k.png', clouds: 'earth-clouds.jpg' },
  moon: { color: 'moon-color.jpg', height: 'moon-height.jpg' },
};
export class PlanetTextures {
  constructor(gl, quality = 'medium') {
    this.gl = gl; this.q = qualityOf(quality); this.items = new Map(); this.lost = false;
  }
  _make(key, genFn, finalSize) {
    const it = { key, tex: { A: null, B: null }, size: 0, final: false, avg: null, failed: false };
    this.items.set(key, it);
    const upload = (res, final) => {
      if (this.lost) return; const gl = this.gl;
      if (it.photo === 'ready') { if (final) it.res = res; return; }   // real imagery already shown: keep it
      const oldA = it.tex.A, oldB = it.tex.B;
      const mips = key !== 'sky'; it.tex = { A: uploadTexture(gl, res.A, res.W, res.H, mips), B: res.B ? uploadTexture(gl, res.B, res.W, res.H, mips) : null }; it.size = res.W; it.final = final;
      if (key !== 'sky') it.avg = downsample(res);
      if (final) { it.res = res; it.onFinal?.(); }
      if (oldA) gl.deleteTexture(oldA); if (oldB) gl.deleteTexture(oldB);
    };
    const [fw, fh] = finalSize; const small = Math.min(fw, 256);
    try {
      // tiny version immediately (a few milliseconds), then the full-size one in time slices
      upload(runSync(genFn(small, small / 2)), fw <= small);
      if (fw > small) schedule(genFn(fw, fh), (res) => upload(res, true), (e) => { it.failed = true; console.warn('texture generation failed', e); });
    } catch (e) { it.failed = true; console.warn('texture generation failed', e); }
    return it;
  }
  /** -> {A, B, final, avg} or null (unsupported body / failure). Starts generation on first use. */
  get(bodyId) {
    let it = this.items.get(bodyId);
    if (!it) {
      const q = this.q;
      if (bodyId === 'earth') it = this._make(bodyId, (w, h) => earthGen(w, h, q.clouds && w >= 512), q.tex);
      else if (bodyId === 'moon') it = this._make(bodyId, (w, h) => moonGen(w, h), q.tex);
      else if (bodyId === 'mars') it = this._make(bodyId, (w, h) => marsGen(w, h), q.tex);
      else return null;
    }
    if (!it.photo && PHOTO_MAPS[bodyId]) this._photo(bodyId, it);
    return it.failed || !it.tex.A ? null : { A: it.tex.A, B: it.tex.B, final: it.final, avg: it.avg, size: it.size, photo: it.photo === 'ready' };
  }
  /**
   * 2.0: real imagery. When the bundled NASA maps (assets/textures, see assets/textures/SOURCES.md) load, their colour, relief, city
   * lights and water mask replace the generated ones; the generated clouds stay. Without the files (or with
   * localStorage astra.photoTex = '0') the generated planet is used, as before.
   */
  _photo(bodyId, it) {
    it.photo = 'loading';
    let off = false; try { off = localStorage.getItem('astra.photoTex') === '0'; } catch { /* ignore */ }
    if (off || typeof Image === 'undefined' || typeof document === 'undefined') { it.photo = 'off'; return; }
    const load = (f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`missing ${f}`)); im.src = new URL(`../../assets/textures/${f}`, import.meta.url).href; });
    const sharp = bodyId === 'earth' && this.q.tex[0] >= 1024;                                         // 2.4: sharper Earth at medium and high quality
    const wantSpec = sharp ? PHOTO_MAPS.earth24 : PHOTO_MAPS[bodyId], oldSpec = PHOTO_MAPS[bodyId];
    const loadSet = (spec) => Promise.all(Object.values(spec).map((f, i) => load(f).catch((e) => { if (Object.keys(spec)[i] === 'clouds') return null; throw e; }))).then((imgs) => ({ spec, imgs }));
    (sharp ? loadSet(wantSpec).catch(() => loadSet(oldSpec)) : loadSet(oldSpec)).then(({ spec, imgs }) => {
      const maps = Object.fromEntries(Object.keys(spec).map((k, i) => [k, imgs[i]]));
      const compose = () => {
        if (this.lost) return;
        let [W, H] = this.q.tex[0] >= 1024 ? this.q.tex : [1024, 512];
        if (maps.clouds && bodyId === 'earth') { const mx = Math.min(4096, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 2048); W = Math.min(mx, this.q.tex[0] >= 2048 ? 4096 : 2048); H = W / 2; }   // 2.4 sharper maps
        const px = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
        const col = px(maps.color), hgt = maps.height ? px(maps.height) : null, night = maps.night ? px(maps.night) : null, water = maps.water ? px(maps.water) : null, real = maps.clouds ? px(maps.clouds) : null;
        const A = new Uint8Array(W * H * 4); let B = null;
        const base = it.res && it.res.W === W && !real ? it.res : null;     // generated texture of the same size: its clouds are kept
        for (let q = 0; q < A.length; q += 4) {
          A[q] = col[q]; A[q + 1] = col[q + 1]; A[q + 2] = col[q + 2];
          const land = water ? 1 - water[q] / 255 : 1;
          A[q + 3] = hgt ? Math.round(hgt[q] * (bodyId === 'earth' ? land : 1)) : 128;
        }
        if (bodyId === 'earth') {
          B = new Uint8Array(W * H * 4);
          for (let q = 0; q < B.length; q += 4) {
            const n = night ? night[q] / 255 : 0; B[q] = Math.min(255, Math.max(0, (n - 0.06) * 1.6) * 255);
            if (real) { const c = (real[q] / 255 - 0.28) / 0.62; B[q + 1] = Math.round(255 * (c <= 0 ? 0 : c >= 1 ? 1 : c * c * (3 - 2 * c))); }   // real satellite clouds: thin haze is cleared, thick cloud stays
            else B[q + 1] = base?.B ? base.B[q + 1] : 0; B[q + 2] = water ? water[q] : 0; B[q + 3] = 255;
          }
        }
        const gl = this.gl, oldA = it.tex.A, oldB = it.tex.B;
        it.tex = { A: uploadTexture(gl, A, W, H, true), B: B ? uploadTexture(gl, B, W, H, true) : oldB }; it.size = W;
        it.avg = downsample({ W, H, A, B }); it.photo = 'ready'; if (real) it.final = true;
        if (oldA) gl.deleteTexture(oldA); if (B && oldB) gl.deleteTexture(oldB);
      };
      if (maps.clouds || bodyId !== 'earth' || !this.q.clouds || it.res?.W === (this.q.tex[0] >= 1024 ? this.q.tex[0] : 1024)) compose(); else it.onFinal = () => { it.onFinal = null; compose(); };
    }).catch((e) => { it.photo = 'off'; console.info?.(`Using generated ${bodyId} texture (${e.message})`); });
  }
  /** Milky way texture for the sky dome. */
  sky() {
    let it = this.items.get('sky');
    if (!it) it = this._make('sky', (w, h) => skyGen(w, h), this.q.sky);
    return it.failed || !it.tex.A ? null : it.tex.A;
  }
  /** Average surface colour under a latitude/longitude [rad] -> {rgb:[r,g,b], ocean:0..1} or null. */
  tint(bodyId, lat, lon) {
    const it = this.items.get(bodyId); if (!it?.avg) return null;
    const { w, h, d } = it.avg; const u = ((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1, v = 0.5 - lat / Math.PI;
    const x = Math.min(w - 1, Math.floor(u * w)), y = Math.max(0, Math.min(h - 1, Math.floor(v * h))); const k = (y * w + x) * 4;
    return { rgb: [d[k], d[k + 1], d[k + 2]], ocean: d[k + 3] };
  }
  dispose() {
    this.lost = true; pending.length = 0;
    for (const it of this.items.values()) { if (it.tex.A) this.gl.deleteTexture(it.tex.A); if (it.tex.B) this.gl.deleteTexture(it.tex.B); }
    this.items.clear();
  }
}

/** Developer helper: generate one texture synchronously and return {W,H,A,B,ms} (used by the self-tests / texture previews). */
export function debugGenerate(bodyId, W = 512, H = 256, clouds = true) {
  const t0 = performance.now();
  const gen = bodyId === 'earth' ? earthGen(W, H, clouds) : bodyId === 'moon' ? moonGen(W, H) : bodyId === 'mars' ? marsGen(W, H) : skyGen(W, H);
  const r = runSync(gen); return { ...r, ms: performance.now() - t0 };
}
