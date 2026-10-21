// Short encouragement for teachers. The first group are well-documented lines with their authors;
// the rest are written for Learnr and carry no attribution.
export const TEACHER_QUOTES = [
  { text: 'It is the supreme art of the teacher to awaken joy in creative expression and knowledge.', by: 'Albert Einstein' },
  { text: 'The art of teaching is the art of assisting discovery.', by: 'Mark Van Doren' },
  { text: 'A teacher affects eternity; he can never tell where his influence stops.', by: 'Henry Adams' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', by: 'Nelson Mandela' },
  { text: 'One student who finally understands is worth the whole hard week.' },
  { text: 'You may never see the result of today. It is still being built.' },
  { text: 'Every question a student asks is a sign they trust you with their confusion.' },
  { text: 'A tired teacher who showed up is still a teacher who made a difference.' },
  { text: 'Small explanations, repeated kindly, change how a child sees themselves.' },
  { text: 'Progress in a classroom is quiet. It rarely announces itself, but it is there.' },
  { text: 'The student who seems not to be listening often remembers the one thing you said with care.' },
  { text: 'You are not behind. You are teaching real people, and that takes real time.' },
  { text: 'Good teaching is a thousand small decisions made with a child in mind.' },
  { text: 'Rest is part of the work. A rested teacher teaches better.' },
  { text: 'Somewhere a student is using something you taught them, and you will never hear about it.' },
  { text: 'Patience, one more example, and a smile: most breakthroughs start there.' },
];

// One quote per day, the same for everyone that day; `offset` lets someone page to another.
export function quoteFor(date = new Date(), offset = 0) {
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  return TEACHER_QUOTES[(day + offset) % TEACHER_QUOTES.length];
}
