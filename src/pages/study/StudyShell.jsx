import { href } from '../../lib/router.js';
import { PageHead } from '../../ui/kit.jsx';
import Focus from './Focus.jsx';
import Practice from './Practice.jsx';
import Cards from './Cards.jsx';
import Learn from './Learn.jsx';
import Insights from './Insights.jsx';
import Stats from './Stats.jsx';

// Three groups keep the bar short enough for a phone. Every page keeps its own address.
const GROUPS = [
  { key: 'focus', label: 'Focus', path: '/study', pages: [{ key: '', label: 'Timer', path: '/study' }, { key: 'stats', label: 'Statistics', path: '/study/stats' }, { key: 'insights', label: 'Insights', path: '/study/insights' }] },
  { key: 'practice', label: 'Practice', path: '/study/learn', pages: [{ key: 'learn', label: 'Prove it', path: '/study/learn' }, { key: 'practice', label: 'Quizzes', path: '/study/practice' }] },
  { key: 'cards', label: 'Flashcards', path: '/study/cards', pages: [{ key: 'cards', label: 'My decks', path: '/study/cards' }] },
];

// Everything here works whether or not the student has joined a class.
export default function StudyShell({ route }) {
  const key = route.parts[1] || '';
  const group = GROUPS.find((g) => g.pages.some((t) => t.key === key)) || GROUPS[0];
  return (
    <div className="stack lg">
      <PageHead title="Study" sub="Your own space. It works with or without a class, and nothing here is visible to teachers." />
      <nav className="tabs" aria-label="Study sections">
        {GROUPS.map((g) => <a key={g.key} href={href(g.path)} aria-current={g === group ? 'page' : undefined}>{g.label}</a>)}
      </nav>
      {group.pages.length > 1 && (
        <nav className="subnav" aria-label={`${group.label} pages`}>
          {group.pages.map((t) => <a key={t.key} href={href(t.path)} aria-current={key === t.key ? 'page' : undefined}>{t.label}</a>)}
        </nav>
      )}
      {key === '' && <Focus />}
      {key === 'learn' && <Learn />}
      {key === 'stats' && <Stats />}
      {key === 'insights' && <Insights />}
      {key === 'practice' && <Practice />}
      {key === 'cards' && <Cards />}
    </div>
  );
}
