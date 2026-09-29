import { json, clearCookie } from './_lib/auth.js';

export default {
  async fetch() {
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  },
};
