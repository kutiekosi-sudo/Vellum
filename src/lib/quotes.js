// Short encouragement for teachers. The first four are well-documented lines with their authors;
// the rest were written for Learnr and carry no attribution.
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
  { text: "A teacher's influence is never measured by the number of students in a classroom, but by the number of lives changed beyond it." },
  { text: 'One day, your students may forget the lesson, but they will never forget the teacher who made them believe they could do something extraordinary.' },
  { text: 'You are not just teaching subjects. You are shaping minds that will one day shape the world.' },
  { text: 'Every child you teach is a future you have the power to influence. Never underestimate what one hour of your dedication can do.' },
  { text: "The world doesn't just need more intelligent people. It needs teachers willing to help create them." },
  { text: 'Your classroom may look ordinary today, but the minds sitting inside it could change history tomorrow.' },
  { text: 'Teach like the future of the world is sitting in your classroom. Because, in a way, it is.' },
  { text: 'Some students walk into your classroom believing they are nothing special. Your patience might be the first thing that makes them believe otherwise.' },
  { text: 'You may be the only person who tells a struggling child that their potential is greater than their present performance. Never underestimate that responsibility.' },
  { text: 'Behind every student who dares to dream bigger is often a teacher who refused to let them give up on themselves.' },
  { text: 'You will not always see the results of your effort immediately. Seeds grow underground long before they bloom above it.' },
  { text: 'A bad day in the classroom does not make you a bad teacher. Rest, reflect, and return to the work that matters.' },
  { text: "You cannot change every student's life in one day. But you can make today's lesson, today's encouragement, and today's kindness count." },
  { text: 'If you want to build a better nation, invest in the minds of its children. If you want to invest in those minds, invest in their teachers.' },
  { text: "A great teacher doesn't simply prepare students to pass examinations. A great teacher prepares them to face a world that examinations cannot fully predict." },
  { text: 'Doctors heal people. Engineers build the future. Leaders shape nations. And teachers help shape the minds that make all of them possible.' },
  { text: 'Never teach a child as though their future is limited by who they are today. Teach them with the understanding that you may be standing before someone whose greatest achievements have not yet begun.' },
];

// One quote per day, the same for everyone that day; `offset` lets someone page to another.
export function quoteFor(date = new Date(), offset = 0) {
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  return TEACHER_QUOTES[(day + offset) % TEACHER_QUOTES.length];
}
