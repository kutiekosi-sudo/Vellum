// This function runs on Netlify's server, never in the visitor's browser.
// Your Gemini API key lives only here, as an environment variable — it is never sent to anyone visiting the site.
// It calls Google's Gemini API but reshapes the reply to match what the frontend already expects,
// so nothing in index.html needs to change.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing GEMINI_API_KEY. Set it in Netlify site settings.' }) };
  }

  try {
    const { prompt, max_tokens } = JSON.parse(event.body || '{}');
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: max_tokens ? max_tokens * 3 : 1500,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error ? data.error.message : 'Gemini API error' }) };
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(p => p.text || '').join('')
      : '';

    // reshape into the same {content: [{text: "..."}]} format the frontend already parses,
    // plus debug info so truncation causes are visible instead of guessed at
    return {
      statusCode: 200,
      body: JSON.stringify({
        content: [{ text }],
        _debug: {
          finishReason: candidate ? candidate.finishReason : null,
          usage: data.usageMetadata || null
        }
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
