import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeCheck, CalendarRange, Eye, EyeOff, ListTree, LogIn } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { USE_MOCK } from '@/services/lessonPlannerApi';
import { LP_BASE } from '@/routes/routeConfig';
import './LoginPage.css';

// One-click demo accounts (seeded by the backend's `npm run seed`, and in the mock)
const DEMO_PASSWORD = 'demo123';
const DEMO_ACCOUNTS = [
  { username: 't1', role: 'Teacher', name: 'Priya Sharma' },
  { username: 't3', role: 'HOD', name: 'Anitha Rao' },
  { username: 'p1', role: 'Principal', name: 'Dr. Meena Iyer' },
  { username: 'a1', role: 'Admin', name: 'Suresh Varma' },
];
const showDemo = USE_MOCK || import.meta.env.DEV;
const footLine = USE_MOCK ? 'Demo mode · data stays in this browser' : `© ${new Date().getFullYear()} Qshikshak`;

export default function LoginPage() {
  const { isLoggedIn, login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Where to go after login: the page they tried to open, or the Lesson Planner home
  const next = location.state?.from || LP_BASE;
  if (isLoggedIn) return <Navigate to={next} replace />;

  const signIn = async (u = username, p = password) => {
    if (!u.trim() || !p) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(u.trim(), p);
      navigate(next, { replace: true });
    } catch (e) {
      setError(e.message || 'Could not sign in. Try again.');
      setBusy(false);
    }
  };

  const signInAs = (acc) => {
    setUsername(acc.username);
    setPassword(DEMO_PASSWORD);
    signIn(acc.username, DEMO_PASSWORD);
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-hidden="true">
        <div className="login-brand-top">
          <span className="login-logo" />
          <span className="login-wordmark">Qshikshak</span>
        </div>
        <div className="login-brand-body">
          <p className="login-kicker">Lesson Planner</p>
          <h1>Plan every class.<br />Get it approved.<br />Cover the syllabus.</h1>
          <ul className="login-points">
            <li>
              <CalendarRange size={18} />
              <span>Plans built from your syllabus and timetable</span>
            </li>
            <li>
              <BadgeCheck size={18} />
              <span>Submit to your HOD and track every review</span>
            </li>
            <li>
              <ListTree size={18} />
              <span>Approved lessons saved against each topic</span>
            </li>
          </ul>
        </div>
        <p className="login-brand-foot">{footLine}</p>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <div className="login-mobile-brand">
            <span className="login-logo small" />
            <span className="strong">Qshikshak</span>
          </div>

          <h2>Sign in</h2>
          <p className="muted small">Use your school account to open the Lesson Planner.</p>

          {params.get('expired') && !error && (
            <div className="login-note" role="status">
              Your session ended. Please sign in again.
            </div>
          )}

          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
            noValidate
          >
            <div className="field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className="input"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. t1"
                disabled={busy}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="login-password">
                <input
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn primary login-submit" disabled={busy}>
              <LogIn size={17} />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {showDemo && (
            <div className="login-demo">
              <div className="login-demo-head">
                <span className="small strong">Demo accounts</span>
                <span className="faint">password {DEMO_PASSWORD}</span>
              </div>
              <div className="login-demo-grid">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button key={acc.username} type="button" className="login-demo-btn" onClick={() => signInAs(acc)} disabled={busy}>
                    <span className="strong small">{acc.role}</span>
                    <span className="faint">
                      {acc.name} · {acc.username}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}