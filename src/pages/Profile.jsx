import { useApp } from '../lib/store.jsx';
import { PageHead, Card, Avatar, Badge, Button } from '../ui/kit.jsx';

export default function Profile() {
  const { profile, signOut } = useApp();
  return (
    <>
      <PageHead title="Profile" />
      <Card className="stack" style={{ maxWidth: 520 }}>
        <div className="row"><Avatar name={profile.displayName} src={profile.photoURL} size="lg" />
          <div className="grow"><h2 className="break" style={{ fontSize: 21 }}>{profile.displayName}</h2><div className="muted break">{profile.email}</div></div></div>
        <div><Badge tone="info">{profile.role === 'teacher' ? 'Teacher' : 'Student'}</Badge></div>
        <Button variant="secondary" icon="logout" onClick={signOut}>Sign out</Button>
      </Card>
    </>
  );
}
