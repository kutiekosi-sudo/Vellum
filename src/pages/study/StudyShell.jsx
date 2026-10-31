import { href } from '../../lib/router.js';
import { PageHead } from '../../ui/kit.jsx';
import Focus from './Focus.jsx';
import Practice from './Practice.jsx';
import Cards from './Cards.jsx';
import Learn from './Learn.jsx';
import Insights from './Insights.jsx';

const TABS = [
  { key: '', label: 'Timer', path: '/study' },
  { key: 'learn', label: 'Prove it', path: '/study/learn' },
  { key: 'insights', label: 'Insights', path: '/study/insights' },
  { key: 'practice', label: 'Practice', path: '/study/practice' },
  { key: 'cards', label: 'Cards', path: '/study/cards' },
];

// Everything here works whether or not the student has joined a class.
export default function StudyShell({ route }) {
  const key = route.parts[1] || '';
  return (
    <div className="stack lg">
      <PageHead title="Study" sub="Your own space. It works with or without a class, and nothing here is visible to teachers." />
      <nav className="tabs" aria-label="Study sections">
        {TABS.map((t) => <a key={t.key} href={href(t.path)} aria-current={key === t.key ? 'page' : undefined}>{t.label}</a>)}
      </nav>
      {key === '' && <Focus />}
      {key === 'learn' && <Learn />}
      {key === 'insights' && <Insights />}
      {key === 'practice' && <Practice />}
      {key === 'cards' && <Cards />}
    </div>
  );
}
