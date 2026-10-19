// Route table. Each role has its own list so a student can never render a teacher page, whatever the URL says.
// (Real access control is the backend's job; this just keeps the interface honest.)
import { Empty } from './ui/kit.jsx';
import { PageHead } from './ui/kit.jsx';
import Profile from './pages/Profile.jsx';
import Classes from './pages/Classes.jsx';
import ClassPage from './pages/ClassPage.jsx';

function Soon({ title, art = 'desk' }) {
  return (
    <>
      <PageHead title={title} />
      <Empty art={art} title="Coming together" text="This part of Learnr is still being built." />
    </>
  );
}
const soon = (title, art) => () => <Soon title={title} art={art} />;

const SHARED = {
  '/profile': { title: 'Profile', Page: Profile },
  '/notifications': { title: 'Notifications', Page: soon('Notifications', 'bell') },
  '/search': { title: 'Search', Page: soon('Search', 'search') },
};
const STUDENT = {
  '/': { title: 'Home', Page: soon('Home', 'desk') },
  '/classes': { title: 'Classes', Page: Classes },
  '/study': { title: 'Study', Page: soon('Study', 'focus') },
  '/coach': { title: 'Coach', Page: soon('Coach', 'coach') },
  '/pod': { title: 'Study Pod', Page: soon('Study Pod', 'pod') },
  ...SHARED,
};
const TEACHER = {
  '/': { title: 'Home', Page: soon('Home', 'classroom') },
  '/classes': { title: 'Classes', Page: Classes },
  '/coach': { title: 'Coach', Page: soon('Coach', 'coach') },
  ...SHARED,
};

export function routeFor(role, route) {
  const table = role === 'teacher' ? TEACHER : STUDENT;
  if (route.parts[0] === 'class' && route.parts[1]) return { title: 'Class', Page: ClassPage, props: { route } };
  const hit = table[route.path];
  return hit ? { ...hit, props: { route } } : { title: 'Not found', Page: null };
}
