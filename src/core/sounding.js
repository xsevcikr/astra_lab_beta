// Weather-balloon soundings (2.5): real launch-day air. Reads the two common text forms and turns them into a table of
// height, temperature and wind that the simulator uses instead of the standard atmosphere and the simple jet-stream.
//   1. University of Wyoming "TEXT:LIST" page (columns PRES HGHT TEMP DWPT RELH MIXR DRCT SKNT ...), pasted or saved as text.
//   2. CSV with a header row: height_m, temp_c, and either wind_ms or wind_kt, and from_deg.
// Everything is validated; an unreadable file gives a plain-language error, never a silent guess.
const KT = 0.514444;

export function parseSounding(text) {
  const t = String(text ?? '').replace(/\r/g, '');
  if (!t.trim()) throw new Error('The file is empty.');
  const pts = /^\s*height_m\s*,|^\s*h_m\s*,|^\s*height\s*,/im.test(t) ? fromCsv(t) : fromWyoming(t);
  return finish(pts, t);
}

function fromCsv(t) {
  const lines = t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const head = lines[0].toLowerCase().split(',').map((x) => x.trim());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const ih = col('height_m', 'h_m', 'height'), it = col('temp_c', 't_c', 'temp'), ims = col('wind_ms', 'wind_m_s'), ikt = col('wind_kt', 'wind_kts', 'wind_knots'), id = col('from_deg', 'dir_deg', 'direction'), ip = col('pres_hpa', 'pressure_hpa');
  if (ih < 0 || it < 0) throw new Error('The CSV needs the columns height_m and temp_c (and optionally wind_ms or wind_kt, from_deg, pres_hpa).');
  return lines.slice(1).map((l) => {
    const c = l.split(',').map((x) => x.trim()), n = (i) => (i >= 0 && c[i] !== '' && c[i] != null ? Number(c[i]) : NaN);
    const sp = ims >= 0 ? n(ims) : ikt >= 0 ? n(ikt) * KT : NaN;
    return { h: n(ih), T: n(it) + 273.15, speed: sp, fromDeg: n(id), pres: n(ip) * 100 };
  });
}

function fromWyoming(t) {
  // The data block sits between a header ending in "PRES HGHT TEMP ..." plus a units line and the next blank line or "Station information".
  const lines = t.split('\n');
  const hi = lines.findIndex((l) => /\bPRES\b/.test(l) && /\bHGHT\b/.test(l) && /\bTEMP\b/.test(l));
  if (hi < 0) throw new Error('Could not find a sounding table (a header with PRES HGHT TEMP). Use the University of Wyoming "Text: List" output or the CSV form.');
  const names = lines[hi].trim().split(/\s+/), at = (n) => names.indexOf(n);
  const iP = at('PRES'), iH = at('HGHT'), iT = at('TEMP'), iD = at('DRCT'), iS = at('SKNT');
  // fixed 7-character columns on the real page; fall back to whitespace splitting
  const out = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) { if (out.length) break; else continue; }
    if (/^[-=\s]+$/.test(l) || /\[hPa\]/.test(l)) continue;
    if (/Station|Observations/i.test(l)) break;
    const fixed = []; for (let k = 0; k < names.length; k++) fixed.push(l.substr(k * 7, 7).trim());
    const ok = fixed.every((x) => x === '' || Number.isFinite(Number(x)));
    const cells = ok ? fixed : l.trim().split(/\s+/);
    const num = (k) => (k >= 0 && cells[k] !== '' && cells[k] != null ? Number(cells[k]) : NaN);
    out.push({ h: num(iH), T: num(iT) + 273.15, speed: num(iS) * KT, fromDeg: num(iD), pres: num(iP) * 100 });
  }
  return out;
}

function finish(raw, text) {
  const pts = raw.filter((p) => Number.isFinite(p.h) && Number.isFinite(p.T)).sort((a, b) => a.h - b.h);
  const dedup = pts.filter((p, i) => i === 0 || p.h > pts[i - 1].h + 1);
  if (dedup.length < 6) throw new Error(`Only ${dedup.length} usable levels were found; a sounding needs at least 6 with height and temperature.`);
  const top = dedup[dedup.length - 1].h;
  if (top < 10000) throw new Error(`The sounding only reaches ${Math.round(top)} m. A launch needs data up to at least 10 km.`);
  for (const p of dedup) { if (p.T < 150 || p.T > 340) throw new Error(`A temperature of ${(p.T - 273.15).toFixed(1)} C at ${Math.round(p.h)} m is not plausible; check the units (degrees Celsius, heights in metres).`); }
  const wind = dedup.filter((p) => Number.isFinite(p.speed) && Number.isFinite(p.fromDeg));
  const station = (text.match(/^\s*(\d{5})\s+(\S.*?)\s+Observations at\s+(.+)$/m) ?? []);
  return {
    schema: 'astra.sounding/1',
    name: station[2] ? `${station[2]} ${station[3] ?? ''}`.trim() : 'Imported sounding',
    points: dedup.map((p) => ({ h: Math.round(p.h), T: +p.T.toFixed(2), pres: Number.isFinite(p.pres) ? Math.round(p.pres) : null })),
    winds: wind.map((p) => ({ h: Math.round(p.h), speed: +p.speed.toFixed(2), fromDeg: +(((p.fromDeg % 360) + 360) % 360).toFixed(1) })),
    topM: Math.round(top), surfaceT: +(dedup[0].T - 273.15).toFixed(1), surfaceH: dedup[0].h,
  };
}

/** One line for the Planner: what was loaded. */
export function describeSounding(s) {
  return `${s.name}: ${s.points.length} levels up to ${(s.topM / 1000).toFixed(1)} km, ${s.surfaceT} C at the ground, ${s.winds.length ? `${s.winds.length} wind levels, strongest ${Math.max(...s.winds.map((w) => w.speed)).toFixed(0)} m/s` : 'no wind data'}.`;
}
