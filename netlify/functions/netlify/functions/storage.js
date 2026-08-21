// Simple key-value storage backed by Netlify Blobs — free, built into your Netlify site,
// no separate database account needed. Personal data is namespaced by a per-browser device id
// (added on the frontend); shared data (like the Study Room) uses a plain key so everyone sees it.
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { action, key, value } = JSON.parse(event.body || '{}');
    if (!key) return { statusCode: 400, body: JSON.stringify({ error: 'Missing key' }) };

    const store = getStore('vellum-data');

    if (action === 'get') {
      const val = await store.get(key);
      return { statusCode: 200, body: JSON.stringify({ value: val || null }) };
    }

    if (action === 'set') {
      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
