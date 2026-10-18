// Small helpers that work in both Node (Netlify functions) and the browser (the offline test build),
// so they must not import anything platform-specific.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

// Random URL-safe id using Web Crypto (available in Node 19+ and every browser).
export function newId(bytes = 9) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const safeId = (s, max = 64) => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s) || s.length > max) throw new HttpError(400, 'Invalid id.', 'bad_id');
  return s;
};
