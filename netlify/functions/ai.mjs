// Learnr AI gateway (Gemini). The API key stays on the server (GEMINI_API_KEY in Netlify settings).
//
// The browser never sends its own system prompt. It picks a `mode`, and the prompt for that mode is built here,
// so this endpoint cannot be used as a general free AI proxy. Callers must be signed in, are rate limited,
// and teacher-only modes check the caller's role in Firestore.
//
// POST /.netlify/functions/ai  { mode, ...payload }  ->  { text } or { data }

import { handle, json, readJson, verifyIdToken, userRole, rateLimit, HttpError, store, requireTeacher, safeId } from './lib/common.mjs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash';

const s = (v, max = 2000) => String(v ?? '').slice(0, max);
const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));

// Class files a teacher ticks to base AI questions on. Gemini reads PDFs and images directly; plain text is passed as text.
const FILE_MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const FILE_TEXT = new Set(['txt', 'md', 'csv']);
const MAX_AI_FILES = 3;
const MAX_AI_FILE_BYTES = 4 * 1024 * 1024;

async function loadClassFiles(user, body) {
  await requireTeacher(body.classId, user); // only the class teacher can feed the class's files to the AI
  const ids = [...new Set(body.fileIds)].slice(0, MAX_AI_FILES).map((id) => safeId(id));
  const st = store('learnr-files');
  const parts = []; const names = [];
  for (const id of ids) {
    const meta = await st.get(`m/${body.classId}/${id}`, { type: 'json' });
    if (!meta || meta.classId !== body.classId) throw new HttpError(404, 'One of the selected files was not found.', 'not_found');
    const ext = String(meta.ext || '').toLowerCase();
    if (!FILE_MIME[ext] && !FILE_TEXT.has(ext)) throw new HttpError(415, `The AI can read PDFs, photos and text files. "${meta.name}" is a different type: copy its text into the notes box instead.`, 'bad_type');
    if (meta.size > MAX_AI_FILE_BYTES) throw new HttpError(413, `"${meta.name}" is too large for the AI to read.`, 'too_large');
    const buf = await st.get(`d/${body.classId}/${id}`, { type: 'arrayBuffer' });
    if (!buf) throw new HttpError(404, 'One of the selected files was not found.', 'not_found');
    names.push(meta.name);
    parts.push({ text: `--- Teacher's file: ${meta.name} ---` });
    if (FILE_MIME[ext]) parts.push({ inline_data: { mime_type: FILE_MIME[ext], data: Buffer.from(buf).toString('base64') } });
    else parts.push({ text: Buffer.from(buf).toString('utf8').slice(0, 30000) });
  }
  return { parts, names };
}

const STUDENT_RULES = `You are Learnr's study coach, talking to a secondary-school student.
- Help them learn. Do not simply hand over finished homework: explain the idea, give a worked example on a similar problem, then guide them through their own problem with hints and questions.
- Tone: friendly yet formal. Be polite, respectful and encouraging, in clear standard English. No slang, no emojis, no baby-talk. Be concrete. Keep answers short unless they ask for depth, and use plain language suited to their level.
- If they seem stuck or stressed, suggest a small next step (a 10-minute task, a break).
- Never diagnose medical or psychological conditions. Never shame them about their results.
- If you are not sure about a fact, say so.`;

const TEACHER_RULES = `You are Learnr's teaching coach, helping a school teacher.
- Give practical, classroom-ready help: different explanations, real-life examples, analogies, simple demonstrations with everyday materials, activities, discussion questions, revision exercises and practice questions.
- Match the age/level they mention. Use examples that work in under-resourced classrooms where possible (household items, food, farming, football, markets).
- The teacher is responsible for teaching decisions. Offer options and trade-offs, and flag common misconceptions.
- Keep language neutral and respectful about students. Never label students (lazy, slow) and never diagnose them.
- Tone: friendly yet formal. Be polite, professional and collegial, in clear standard English. No slang and no emojis.
- When asked to help the teacher improve, give honest, specific, constructive feedback on lesson plans, questions, pacing, explanations and assessment: say what works, what to change, and exactly how. Support the teacher; do not flatter.`;

const DIFFICULTY = {
  easy: 'Difficulty: easy. Mostly recall of key facts and definitions.',
  mixed: 'Difficulty: balanced. Roughly a third easy, a third moderate, a third challenging.',
  hard: 'Difficulty: hard. Mostly application and multi-step reasoning, with plausible distractors.',
  exam: 'Difficulty: match a typical end-of-term exam for this level, with plausible distractors.',
};

const JSON_ONLY = 'Respond with ONLY the raw JSON requested. No markdown fences, no commentary.';

const QUESTION_SHAPE = `[{"text":"question","options":["A","B","C","D"],"correct":0,"explanation":"why the answer is right","topic":"short topic name","skill":"recall"|"application"}]`;

function chatContents(messages) {
  const list = (Array.isArray(messages) ? messages : []).slice(-14).map((m) => ({
    role: m?.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: s(m?.content, 2500) }],
  })).filter((m) => m.parts[0].text.trim());
  if (!list.length || list[list.length - 1].role !== 'user') throw new HttpError(400, 'Say something to get started.', 'empty');
  return list;
}

const MODES = {
  student_coach: {
    maxTokens: 2048,
    build: (p) => ({
      system: `${STUDENT_RULES}\n\nWhat Learnr knows about this student (from their own study data; use it gently, never recite it back as a list):\n${s(p.context, 3000) || 'Nothing yet.'}`,
      contents: chatContents(p.messages),
    }),
  },
  teacher_coach: {
    teacherOnly: true, maxTokens: 3072,
    build: (p) => ({
      system: `${TEACHER_RULES}\n\nClass context shared by the teacher:\n${s(p.context, 3000) || 'None.'}`,
      contents: chatContents(p.messages),
    }),
  },
  explain_mistake: {
    json: true, maxTokens: 1200,
    build: (p) => ({
      system: `${STUDENT_RULES}\n${JSON_ONLY}`,
      contents: [{ role: 'user', parts: [{ text:
        `A student answered a question wrongly. Work out WHY, in a kind way.\nSubject: ${s(p.subject, 80)}\nTopic: ${s(p.topic, 80)}\nQuestion: ${s(p.question, 1500)}\nOptions: ${JSON.stringify((p.options || []).slice(0, 6).map((o) => s(o, 300)))}\nStudent chose: ${s(p.chosen, 300)}\nCorrect answer: ${s(p.correct, 300)}\n\nReturn: {"type":"formula_mixup"|"misunderstanding"|"careless_slip"|"knowledge_gap","title":"short friendly label","explanation":"2-3 sentences on what likely went wrong","fix":"one concrete thing to do next","example":"a tiny similar example (optional)"}` }] }],
    }),
  },
  flashcards: {
    json: true, maxTokens: 3000,
    build: (p) => ({
      system: JSON_ONLY,
      contents: [{ role: 'user', parts: [{ text:
        `Create exactly ${n(p.count, 3, 20, 8)} study flashcards for the topic "${s(p.topic, 120)}" in ${s(p.subject, 80) || 'the subject'}, for a student at this level: ${s(p.level, 80) || 'secondary school'}.${p.notes ? `\nBase them on these notes:\n${s(p.notes, 4000)}` : ''}\nReturn: [{"front":"question or term","back":"concise answer, 1-2 sentences"}]` }] }],
    }),
  },
  photo_flashcards: {
    json: true, maxTokens: 6000,
    build: (p) => {
      const img = p.image || {};
      if (!/^image\/(png|jpe?g|webp)$/.test(String(img.mimeType)) || typeof img.data !== 'string' || img.data.length > 5.6 * 1024 * 1024) {
        throw new HttpError(400, 'Please use a clear photo (PNG, JPG or WebP) under 4 MB.', 'bad_image');
      }
      return {
        system: JSON_ONLY,
        contents: [{ role: 'user', parts: [
          { text: `Read the WHOLE page in this photo of handwritten or printed notes${p.title ? ` about "${s(p.title, 120)}"` : ''}. Create as many flashcards as the content genuinely needs (not a fixed number), covering every key idea, definition, formula and example on the page. Return: [{"front":"question or term","back":"concise answer"}]. If the photo is unreadable, return [].` },
          { inline_data: { mime_type: img.mimeType, data: img.data } },
        ] }],
      };
    },
  },
  practice_quiz: {
    json: true, maxTokens: 4000,
    build: (p) => ({
      system: JSON_ONLY,
      contents: [{ role: 'user', parts: [{ text:
        `Write ${n(p.count, 3, 10, 5)} multiple-choice practice questions on "${s(p.topic, 120)}" (${s(p.subject, 80) || 'general'}) for a student at this level: ${s(p.level, 80) || 'secondary school'}. Each has 4 options, exactly one correct. Mix recall and application.${p.notes ? `\nBase every question ONLY on these notes the student supplied; do not test anything they do not cover:\n${s(p.notes, 12000)}` : ''}\nReturn: [{"text":"question","options":["A","B","C","D"],"correct":0,"explanation":"short explanation","topic":"${s(p.topic, 80)}"}]` }] }],
    }),
  },
  study_plan: {
    json: true, maxTokens: 2500,
    build: (p) => ({
      system: `${STUDENT_RULES}\n${JSON_ONLY}`,
      contents: [{ role: 'user', parts: [{ text:
        `Make a realistic ${n(p.days, 1, 14, 7)}-day study plan for this student using their real data. Prioritise weak topics, upcoming deadlines and tests, and spread effort sensibly. Keep sessions 15-45 minutes and include rest.\n\nStudent data:\n${s(p.context, 4000)}\n\nReturn: {"summary":"1-2 sentences","days":[{"day":"Mon","focus":"subject / topic","minutes":30,"tasks":["specific task","specific task"]}]}` }] }],
    }),
  },
  break_down: {
    json: true, maxTokens: 1500,
    build: (p) => ({
      system: `${STUDENT_RULES}\n${JSON_ONLY}`,
      contents: [{ role: 'user', parts: [{ text:
        `Break this assignment into small, doable steps for the student. Do NOT do the assignment for them.\nTitle: ${s(p.title, 200)}\nInstructions: ${s(p.instructions, 3000)}\nDue: ${s(p.due, 80) || 'not set'}\nReturn: {"steps":[{"title":"what to do","minutes":20,"tip":"one helpful hint"}]}` }] }],
    }),
  },
  teacher_generate: {
    teacherOnly: true, maxTokens: 4000,
    build: (p) => {
      const kind = s(p.kind, 40);
      const concepts = Array.isArray(p.concepts) ? p.concepts.slice(0, 8).map((c) => s(c, 120)).filter(Boolean) : [];
      const fromNotes = kind === 'cbt_questions' || kind === 'revision_questions';
      const ctx = `Class: ${s(p.className, 120) || 'n/a'}. Subject: ${s(p.subject, 80) || 'n/a'}. Level: ${s(p.level, 80) || 'n/a'}.\nTopic / request: ${s(p.topic, 600)}${concepts.length ? `\nConcepts: ${concepts.map((c, i) => `${i + 1}. ${c}`).join('; ')}` : ''}\nExtra notes: ${s(p.notes, fromNotes ? 12000 : 2500)}`;
      const asks = {
        announcement: 'Draft a short, friendly announcement to students. Plain text, ready to edit.',
        assignment_ideas: 'Suggest 4 assignment ideas with clear instructions, expected output and a simple marking idea for each.',
        lesson_outline: 'Write a lesson outline: objectives, a hook, main teaching steps with timings, a check-for-understanding, and a closing task.',
        class_summary: 'Write a short, neutral summary of how the class is doing from the data given, naming strengths and topics needing reinforcement. Do not label individual students negatively.',
        intervention: 'Suggest practical, respectful ways to support students who may benefit from additional academic support, based on the data given. Do not diagnose anyone.',
        differentiated: 'Create differentiated practice at three levels (support, core, stretch) for the topic, with 3 tasks each.',
        misconceptions: 'List the most common student misconceptions for the topic, why they happen, and a quick way to address each in class.',
        explain_many: 'The teacher listed SEVERAL concepts (below). For EACH concept, in order, give: a plain one-sentence explanation; a real-life example or instance from students\' everyday world; an analogy students can relate to; and one common misconception with a quick fix. Then add a short section showing how the concepts connect to one another. Use a clear heading per concept.',
        explain: 'Give three different ways to explain this to students: a plain explanation, a real-life example, and an analogy. Add a simple demonstration and 3 discussion questions.',
        theory_notes: 'Write clear revision notes for students on this topic: key concepts, definitions, formulas (if any), one worked example, and 3 quick self-check questions. Use short paragraphs and plain text.',
      };
      const files = p._files ? p._files.parts : [];
      const fromFiles = files.length ? `\nBase the questions ONLY on the teacher's attached file(s) and notes; do not test anything they do not cover.` : '';
      const teacherPrompt = p.instructions ? `\nTeacher's own instructions (follow them closely): ${s(p.instructions, 1500)}` : '';
      if (kind === 'theory_questions') {
        return {
          system: `${TEACHER_RULES}\n${JSON_ONLY}`,
          contents: [{ role: 'user', parts: [{ text:
            `${ctx}${teacherPrompt}\n\nWrite ${n(p.count, 1, 10, 4)} written (theory) exam questions at this class level. For each give "marks" (1 to 20, matching how much is expected) and a concise "guide": the points a good answer should contain, for the teacher's marking.${DIFFICULTY[s(p.difficulty, 20)] ? `\n${DIFFICULTY[s(p.difficulty, 20)]}` : ''}${fromFiles}\nReturn: [{"text":"question","marks":5,"guide":"key points","topic":"short topic name"}]` }, ...files] }],
          json: true,
        };
      }
      if (kind === 'cbt_questions' || kind === 'revision_questions') {
        return {
          system: `${TEACHER_RULES}\n${JSON_ONLY}`,
          contents: [{ role: 'user', parts: [{ text:
            `${ctx}${teacherPrompt}\n\nWrite ${n(p.count, 3, 20, 8)} multiple-choice ${kind === 'revision_questions' ? 'revision' : 'assessment'} questions. 4 options each, exactly one correct, a clear explanation, a short topic name, and "skill" as "recall" or "application". Mix both skills.\n${DIFFICULTY[s(p.difficulty, 20)] || DIFFICULTY.mixed}\nPitch every question for students at this class level: ${s(p.level, 80) || 'secondary school'}.${p.notes ? '\nBase the questions ONLY on the notes provided; do not test anything the notes do not cover.' : ''}${fromFiles}\nReturn: ${QUESTION_SHAPE}` }, ...files] }],
          json: true,
        };
      }
      if (!asks[kind]) throw new HttpError(400, 'Unknown generator.', 'bad_kind');
      return {
        system: TEACHER_RULES,
        contents: [{ role: 'user', parts: [{ text: `${ctx}\n\n${asks[kind]}` }] }],
        json: false,
      };
    },
  },
};

function parseJsonLoose(text) {
  let t = String(text || '').replace(/```json|```/gi, '').trim();
  const a = Math.min(...['[', '{'].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  const b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (a === Infinity || b <= a) throw new Error('no json');
  return JSON.parse(t.slice(a, b + 1));
}

async function callGemini({ system, contents, maxTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(500, 'The AI is not configured yet (GEMINI_API_KEY is missing in Netlify).', 'ai_not_configured');
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    // Headroom: newer Gemini models spend part of this budget on internal reasoning before they answer.
    generationConfig: { maxOutputTokens: Math.min(16000, maxTokens * 2) },
  });
  // Google sometimes answers "high demand" (503) or rate-limits (429) for a few seconds. Retry quietly,
  // and on the last try switch to a lighter fallback model so the teacher still gets an answer.
  const models = [MODEL, 'gemini-2.5-flash-lite', FALLBACK_MODEL, 'gemini-2.5-flash', 'gemini-flash-lite-latest'].filter((m, i, a) => m && a.indexOf(m) === i);
  let res, data;
  for (let i = 0; i < models.length; i++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[i]}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
    });
    data = await res.json().catch(() => ({}));
    if (res.ok || ![404, 429, 500, 503, 504].includes(res.status) || i === models.length - 1) break;
    if (res.status !== 404) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  if (!res.ok) {
    const msg = data?.error?.message || 'The AI service returned an error.';
    if ([429, 503].includes(res.status) || /high demand|overloaded|try again later/i.test(msg)) {
      throw new HttpError(503, 'The AI is very busy right now. Wait about a minute and press Generate again. Your notes and settings are still here. (Google said ' + res.status + ': ' + String(msg).slice(0, 160) + ')', 'ai_busy');
    }
    throw new HttpError(502, `The AI could not answer: ${msg}`.slice(0, 300), 'ai_error');
  }
  const cand = data.candidates && data.candidates[0];
  const text = cand?.content?.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  if (!text.trim()) {
    throw new HttpError(502, `The AI returned an empty answer${cand?.finishReason ? ` (${cand.finishReason})` : ''}. Please try again.`, 'ai_empty');
  }
  return { text, finishReason: cand?.finishReason || null };
}

export default handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'method');
  const user = await verifyIdToken(req);
  const body = await readJson(req, 7 * 1024 * 1024);
  delete body._files; // only the server may set this
  const mode = MODES[body.mode];
  if (!mode) throw new HttpError(400, 'Unknown AI mode.', 'bad_mode');

  if (mode.teacherOnly) {
    const role = await userRole(user);
    if (role !== 'teacher') throw new HttpError(403, 'That AI tool is for teacher accounts.', 'forbidden');
  }
  await rateLimit(user, 'ai', (now) => [
    ['hour', 60, now.toISOString().slice(0, 13)],
    ['day', 300, now.toISOString().slice(0, 10)],
  ]);

  if (body.mode === 'teacher_generate' && Array.isArray(body.fileIds) && body.fileIds.length) body._files = await loadClassFiles(user, body);
  const built = mode.build(body);
  const wantsJson = built.json ?? mode.json ?? false;
  const { text, finishReason } = await callGemini({ system: built.system, contents: built.contents, maxTokens: mode.maxTokens });

  if (!wantsJson) return json({ text, finishReason });
  try {
    return json({ data: parseJsonLoose(text), finishReason });
  } catch {
    throw new HttpError(502, 'The AI answered in an unexpected format. Please try again.', 'ai_bad_format');
  }
});
