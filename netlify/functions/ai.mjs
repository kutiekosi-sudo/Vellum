// Learnr AI gateway (Gemini). The API key stays on the server (GEMINI_API_KEY in Netlify settings).
//
// The browser never sends its own system prompt. It picks a `mode`, and the prompt for that mode is built here,
// so this endpoint cannot be used as a general free AI proxy. Callers must be signed in, are rate limited,
// and teacher-only modes check the caller's role in Firestore.
//
// POST /.netlify/functions/ai  { mode, ...payload }  ->  { text } or { data }

import { handle, json, readJson, verifyIdToken, userRole, rateLimit, HttpError } from './lib/common.mjs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const s = (v, max = 2000) => String(v ?? '').slice(0, max);
const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));

const STUDENT_RULES = `You are Learnr's study coach, talking to a secondary-school student.
- Help them learn. Do not simply hand over finished homework: explain the idea, give a worked example on a similar problem, then guide them through their own problem with hints and questions.
- Be warm, encouraging and concrete. Keep answers short unless they ask for depth. Use plain language suited to their level.
- If they seem stuck or stressed, suggest a small next step (a 10-minute task, a break).
- Never diagnose medical or psychological conditions. Never shame them about their results.
- If you are not sure about a fact, say so.`;

const TEACHER_RULES = `You are Learnr's teaching coach, helping a school teacher.
- Give practical, classroom-ready help: different explanations, real-life examples, analogies, simple demonstrations with everyday materials, activities, discussion questions, revision exercises and practice questions.
- Match the age/level they mention. Use examples that work in under-resourced classrooms where possible (household items, food, farming, football, markets).
- The teacher is responsible for teaching decisions. Offer options and trade-offs, and flag common misconceptions.
- Keep language neutral and respectful about students. Never label students (lazy, slow) and never diagnose them.`;

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
        `Write ${n(p.count, 3, 10, 5)} multiple-choice practice questions on "${s(p.topic, 120)}" (${s(p.subject, 80) || 'general'}) for a student at this level: ${s(p.level, 80) || 'secondary school'}. Each has 4 options, exactly one correct. Mix recall and application.\nReturn: [{"text":"question","options":["A","B","C","D"],"correct":0,"explanation":"short explanation","topic":"${s(p.topic, 80)}"}]` }] }],
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
      const ctx = `Class: ${s(p.className, 120) || 'n/a'}. Subject: ${s(p.subject, 80) || 'n/a'}. Level: ${s(p.level, 80) || 'n/a'}.\nTopic / request: ${s(p.topic, 600)}\nExtra notes: ${s(p.notes, 2500)}`;
      const asks = {
        announcement: 'Draft a short, friendly announcement to students. Plain text, ready to edit.',
        assignment_ideas: 'Suggest 4 assignment ideas with clear instructions, expected output and a simple marking idea for each.',
        lesson_outline: 'Write a lesson outline: objectives, a hook, main teaching steps with timings, a check-for-understanding, and a closing task.',
        class_summary: 'Write a short, neutral summary of how the class is doing from the data given, naming strengths and topics needing reinforcement. Do not label individual students negatively.',
        intervention: 'Suggest practical, respectful ways to support students who may benefit from additional academic support, based on the data given. Do not diagnose anyone.',
        differentiated: 'Create differentiated practice at three levels (support, core, stretch) for the topic, with 3 tasks each.',
        misconceptions: 'List the most common student misconceptions for the topic, why they happen, and a quick way to address each in class.',
        explain: 'Give three different ways to explain this to students: a plain explanation, a real-life example, and an analogy. Add a simple demonstration and 3 discussion questions.',
        theory_notes: 'Write clear revision notes for students on this topic: key concepts, definitions, formulas (if any), one worked example, and 3 quick self-check questions. Use short paragraphs and plain text.',
      };
      if (kind === 'cbt_questions' || kind === 'revision_questions') {
        return {
          system: `${TEACHER_RULES}\n${JSON_ONLY}`,
          contents: [{ role: 'user', parts: [{ text:
            `${ctx}\n\nWrite ${n(p.count, 3, 20, 8)} multiple-choice ${kind === 'revision_questions' ? 'revision' : 'assessment'} questions. 4 options each, exactly one correct, a clear explanation, a short topic name, and "skill" as "recall" or "application". Mix both skills.\nReturn: ${QUESTION_SHAPE}` }] }],
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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      // Headroom: newer Gemini models spend part of this budget on internal reasoning before they answer.
      generationConfig: { maxOutputTokens: Math.min(16000, maxTokens * 2) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || 'The AI service returned an error.';
    if (res.status === 429) throw new HttpError(503, 'The AI is busy right now. Please try again in a moment.', 'ai_busy');
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
