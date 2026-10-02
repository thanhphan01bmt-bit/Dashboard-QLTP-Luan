// Lưu trữ JSON: Vercel Blob (private) khi chạy trên Vercel, thư mục local khi chạy thử (LOCAL_STORE_DIR).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LOCAL = process.env.LOCAL_STORE_DIR;

// Xác thực với Blob: ưu tiên BLOB_READ_WRITE_TOKEN; nếu không có thì dùng OIDC token của request + BLOB_STORE_ID.
let OIDC = null;
export function useRequest(req) {
  const t = req && req.headers && req.headers.get('x-vercel-oidc-token');
  if (t) OIDC = t;
}
function auth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  const storeId = process.env.BLOB_STORE_ID;
  const oidcToken = OIDC || process.env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) return { oidcToken, storeId };
  return {};
}
function friendly(e) {
  if (/credentials|token|store.?id|unauthori|forbidden|access denied/i.test(String(e && e.message))) {
    return Object.assign(new Error('Chưa kết nối được kho lưu trữ Blob. Kiểm tra: đã tạo Blob (Private), đã Connect vào dự án và đã Redeploy; hoặc thêm biến BLOB_READ_WRITE_TOKEN rồi Redeploy.'), { status: 500, cause: e });
  }
  return e;
}

export async function readJSON(name, { cache = false } = {}) {
  if (LOCAL) {
    try { return JSON.parse(await fs.readFile(path.join(LOCAL, name), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  const { get } = await import('@vercel/blob');
  let r;
  try { r = await get(name, { access: 'private', useCache: cache, ...auth() }); }
  catch (e) { if (/not.?found/i.test(String(e && (e.name + e.message)))) return null; throw friendly(e); }
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
  try { await put(name, body, {
    ...auth(),
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  }); } catch (e) { throw friendly(e); }
}
