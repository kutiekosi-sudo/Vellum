// Make a large number of questions or cards by splitting the notes into sections and asking for each section in turn,
// so a long set of notes is covered from start to finish instead of only the opening paragraphs.
export function splitNotes(text, parts) {
  const paras = String(text).split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean);
  if (parts <= 1 || paras.length <= parts) return parts <= 1 ? [String(text)] : paras.length ? paras.map((p) => p) : [String(text)];
  const out = Array.from({ length: parts }, () => []);
  const per = Math.ceil(paras.length / parts);
  paras.forEach((p, i) => out[Math.min(parts - 1, Math.floor(i / per))].push(p));
  return out.map((a) => a.join('\n\n')).filter(Boolean);
}

// A sensible amount for "cover everything": roughly one item per 250 characters, between 5 and max.
export const coverageCount = (text, max = 60) => Math.max(5, Math.min(max, Math.ceil(String(text).trim().length / 250)));

// Runs `call(slice, count)` over sections and collects the results. `perCall` caps how many each request asks for.
export async function runBatches({ notes, total, perCall, call, onProgress }) {
  const calls = Math.max(1, Math.ceil(total / perCall));
  const slices = splitNotes(notes, calls);
  const n = slices.length;
  const base = Math.floor(total / n); let extra = total - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const want = base + (extra-- > 0 ? 1 : 0);
    if (want <= 0) continue;
    if (onProgress) onProgress(i + 1, n);
    const part = await call(slices[i], want);
    out.push(...part);
  }
  return out;
}
