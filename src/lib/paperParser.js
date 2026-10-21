// Turns a pasted question paper (with its answer key) into CBT questions, without any AI.
// Understands the layouts teachers already have:
//   1. What is 2 + 2?            (also "Q1." / "Question 1:" / "1)")
//   A. 3   B. 4                  (options on their own lines: "A." "A)" "(A)")
//   Answer: B                    (right under the question, or "Ans: B", "Correct answer: B")
// or a key at the end:  "Answers: 1. B  2. C  3. A"  /  "1-B, 2-C"  /  "1 B"
// Items with no options become written (theory) questions; "[5 marks]" sets the marks.

const ANS_INLINE = /^\s*\(?\s*(?:correct\s+)?(?:answer|ans|key)\s*[:=\-]?\s*\(?\s*([A-Ea-e])\b\s*\)?\s*(.*)$/i;
const KEY_HEADER = /^\s*(?:answers?|answer\s*key|key|solutions?|marking\s*scheme)\s*[:\-]?\s*(.*)$/i;
const Q_START = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)\]:\-]\s*(.+)$/i;
const OPT = /^\s*\(?([A-Ea-e])\s*[.)\]:]\s*(.+)$/;
const MARKS = /\s*[[(]\s*(\d{1,2})\s*marks?\s*[\])]\s*/i;

export function parsePaper(raw) {
  const lines = String(raw || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n');
  const items = [];
  const key = new Map();
  let cur = null;
  let inKey = false;

  const readKey = (s) => {
    for (const m of s.matchAll(/(\d{1,3})\s*[.):\-=]?\s*\(?([A-Ea-e])\)?(?=\s|,|;|$)/g)) key.set(Number(m[1]), m[2].toUpperCase());
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (!inKey) {
      const kh = line.match(KEY_HEADER);
      // "Answers:" on its own, or followed by the pairs. A question that merely starts with the word "Key" is not a header.
      if (kh && !Q_START.test(line) && (/^\s*(answers?|answer\s*key|solutions?|marking\s*scheme)\b/i.test(line) && !ANS_INLINE.test(line) || /^\s*key\s*[:\-]/i.test(line) && /\d/.test(kh[1]))) {
        inKey = true; readKey(kh[1] || ''); continue;
      }
    } else { readKey(line); continue; }

    const a = line.match(ANS_INLINE);
    if (a && cur) {
      cur.answer = a[1].toUpperCase();
      const ex = (a[2] || '').match(/explanation\s*[:\-]\s*(.+)$/i);
      if (ex) cur.explanation = ex[1].trim();
      continue;
    }
    const q = line.match(Q_START);
    if (q && !(cur && cur.options.length === 0 && OPT.test(line))) {
      cur = { number: Number(q[1]), text: q[2].trim(), options: [], answer: '', explanation: '' };
      items.push(cur);
      continue;
    }
    const o = line.match(OPT);
    if (o && cur) { cur.options.push({ label: o[1].toUpperCase(), text: o[2].trim() }); continue; }
    if (cur) {
      if (cur.options.length) cur.options[cur.options.length - 1].text += ' ' + line.trim();
      else cur.text += ' ' + line.trim();
    }
  }

  const questions = [];
  const theory = [];
  const warnings = [];
  for (const it of items) {
    if (it.options.length >= 2) {
      const letter = it.answer || key.get(it.number) || '';
      let correct = -1;
      if (letter) {
        const byLabel = it.options.findIndex((x) => x.label === letter);
        correct = byLabel >= 0 ? byLabel : -1;
      }
      if (correct < 0) warnings.push(`Question ${it.number} has no answer we could read. Choose it below.`);
      questions.push({ text: it.text, options: it.options.map((x) => x.text), correct, points: 1, explanation: it.explanation, topic: '', skill: '' });
    } else if (it.options.length === 1) {
      warnings.push(`Question ${it.number} has only one option, so it was skipped.`);
    } else {
      const m = it.text.match(MARKS);
      theory.push({ text: it.text.replace(MARKS, ' ').trim(), marks: m ? Number(m[1]) : 5, guide: '', topic: '' });
    }
  }
  return { questions, theory, warnings };
}
