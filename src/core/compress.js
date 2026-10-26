// gzip helpers that work in Node (zlib) and in the Electron/Chromium renderer (CompressionStream).
export async function gzip(bytes) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.gzipSync(bytes));
}
export async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {}); // a damaged input rejects the read below
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.gunzipSync(bytes));
}
export const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
