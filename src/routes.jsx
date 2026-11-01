// Route table. Each role has its own list so a student can never render a teacher page, whatever the URL says.
// (Real access control is the backend's job; this just keeps the interface honest.)
import { Empty } from './ui/kit.jsx';
import { PageHead } from './ui/kit.jsx';
import Profile from './pages/Profile.jsx';
import Classes from './pages/Classes.jsx';
import ClassPage from './pages/ClassPage.jsx';
import Pod from './pages/Pod.jsx';
import Coach from './pages/Coach.jsx';
import Home from './pages/Home.jsx';
import StudyShell from './pages/study/StudyShell.jsx';
import Calendar from './pages/Calendar.jsx';

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
  '/': { title: 'Home', Page: Home },
  '/classes': { title: 'Classes', Page: Classes },
  '/study': { title: 'Study', Page: StudyShell },
  '/study/learn': { title: 'Study', Page: StudyShell },
  '/study/stats': { title: 'Study', Page: StudyShell },
  '/study/insights': { title: 'Study', Page: StudyShell },
  '/study/practice': { title: 'Study', Page: StudyShell },
  '/study/cards': { title: 'Study', Page: StudyShell },
  '/coach': { title: 'Coach', Page: Coach },
  '/pod': { title: 'Study Pod', Page: Pod },
  ...SHARED,
};
const TEACHER = {
  '/': { title: 'Home', Page: Home },
  '/classes': { title: 'Classes', Page: Classes },
  '/calendar': { title: 'Calendar', Page: Calendar },
  '/coach': { title: 'Coach', Page: soon('Coach', 'coach') },
  ...SHARED,
};

export function routeFor(role, route) {
  const table = role === 'teacher' ? TEACHER : STUDENT;
  if (route.parts[0] === 'class' && route.parts[1]) return { title: 'Class', Page: ClassPage, props: { route } };
  const hit = table[route.path];
  return hit ? { ...hit, props: { route } } : { title: 'Not found', Page: null };
}
