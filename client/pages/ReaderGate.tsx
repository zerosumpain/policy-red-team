import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { reader } from '../api';
import { Button, ButtonGroup, ErrorSummary, Input } from '../govuk';
import { Template, usePageTitle } from '../layout/Template';

/**
 * Pages a visitor must reach WITHOUT the reader password: the admin panel and
 * the guided setup (each gates itself, and the owner may hold only the admin
 * password), and the pages that say what this service is.
 */
const OPEN = ['/admin', '/setup', '/about', '/accessibility', '/design'];

/**
 * THE READER SIGN-IN, in front of every page that shows an assessment.
 *
 * Asks the server once whether it wants a reader password and whether this
 * browser already has the cookie — the admin cookie counts, which is why the
 * owner signed in at /admin never sees this. While it asks, nothing renders:
 * drawing the page first would fire the very requests that 401.
 */
export function ReaderGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [state, setState] = useState<'asking' | 'open' | 'closed'>('asking');

  useEffect(() => {
    let live = true;
    reader.status()
      .then((s) => { if (live) setState(!s.gated || s.signedIn ? 'open' : 'closed'); })
      // A status that cannot be read is not a reason to lock the page: the data
      // requests still carry their own 401, which is the real lock.
      .catch(() => { if (live) setState('open'); });
    return () => { live = false; };
  }, []);

  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <>{children}</>;
  if (state === 'asking') return null;
  if (state === 'open') return <>{children}</>;
  return <Template><ReaderSignIn onSignedIn={() => setState('open')} /></Template>;
}

function ReaderSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  usePageTitle('Sign in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) { setError('Enter the password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await reader.signIn(password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {error ? <ErrorSummary errors={[{ text: error, href: '#reader-password' }]} /> : null}
        <h1 className="govuk-heading-xl">Sign in to read the assessments</h1>
        <p className="govuk-body">This service needs a password before it shows any assessment.</p>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <Input
            id="reader-password"
            name="password"
            type="password"
            label="Password"
            labelSize="s"
            hint="Ask the person who runs this service for it."
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={error ?? undefined}
            disabled={busy}
          />
          <ButtonGroup>
            <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</Button>
          </ButtonGroup>
        </form>
        <p className="govuk-body">
          Run this service? <Link className="govuk-link" to="/admin">Sign in on the admin page</Link> instead — that opens
          the assessments too.
        </p>
      </div>
    </div>
  );
}
