// Lưu trữ JSON: Vercel Blob (private) khi chạy trên Vercel, thư mục local khi chạy thử (LOCAL_STORE_DIR).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LOCAL = process.env.LOCAL_STORE_DIR;

export async function readJSON(name) {
  if (LOCAL) {
    try { return JSON.parse(await fs.readFile(path.join(LOCAL, name), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  const { get } = await import('@vercel/blob');
  let r;
  try { r = await get(name, { access: 'private', useCache: false }); }
  catch (e) { if (/not.?found/i.test(String(e && (e.name + e.message)))) return null; throw e; }
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export async function writeJSON(name, obj) {
  const body = JSON.stringify(obj);
  if (LOCAL) {
    const f = path.join(LOCAL, name);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
    return;
  }
  const { put } = await import('@vercel/blob');
  await put(name, body, {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}
