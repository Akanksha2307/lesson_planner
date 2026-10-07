import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check, LogOut, Menu, User } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { lessonPlannerApi, USE_MOCK } from '@/services/lessonPlannerApi';
import {
  extraTitles,
  LP_BASE,
  lpPages,
} from '@/routes/routeConfig';
import { ROLE_LABELS } from '@/utils/constants';

import './Topbar.css';

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', close);

    return () =>
      document.removeEventListener('mousedown', close);
  }, []);

  return {
    open,
    setOpen,
    ref,
  };
}

const timeAgo = (iso) => {
  const m = Math.round(
    (Date.now() - new Date(iso)) / 60000
  );

  if (m < 60) {
    return `${Math.max(m, 1)} min ago`;
  }

  if (m < 1440) {
    return `${Math.round(m / 60)} h ago`;
  }

  return `${Math.round(m / 1440)} d ago`;
};

export default function Topbar({ onMenu }) {
  const {
    ctx,
    role,
    setRole,
    user,
    notifications,
    setNotifications,
    logout,
  } = useApp();

  const { pathname } = useLocation();
  const navigate = useNavigate();

  const bell = usePopover();
  const profile = usePopover();

  // Check if we are on the main Lesson Planner page
  const isLessonPlannerHome =
    pathname === LP_BASE ||
    pathname === `${LP_BASE}/`;

  const page = lpPages.find(
    (p) => pathname === `${LP_BASE}/${p.path}`
  );

  const title = page
    ? (role === 'teacher' && page.teacherLabel) ||
      page.label
    : extraTitles.find((t) =>
        t.match.test(pathname)
      )?.title || 'Lesson Planner';

  // Breadcrumb: every part before the title can be clicked
  const plansPage = lpPages.find((p) => p.path === 'plans');
  const crumbs = [{ label: 'Lesson Planner', to: LP_BASE }];
  if (!page && plansPage && /\/plans\/.+/.test(pathname)) {
    crumbs.push({
      label: (role === 'teacher' && plansPage.teacherLabel) || plansPage.label,
      to: `${LP_BASE}/plans`,
    });
  }

  const unread = notifications.filter(
    (n) => !n.read
  ).length;

  const openBell = async () => {
    bell.setOpen((o) => !o);

    if (unread && user) {
      await lessonPlannerApi.markNotificationsRead({
        userId: user.id,
      });

      setTimeout(() => {
        setNotifications((ns) =>
          ns.map((n) => ({
            ...n,
            read: true,
          }))
        );
      }, 1500);
    }
  };

  return (
    <header className="topbar no-print">
      <div className="topbar-left">

        <button
          className="icon-btn menu-btn"
          onClick={onMenu}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        <button
          className="icon-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft size={22} />
        </button>

        <div className="topbar-title">

          {isLessonPlannerHome ? (
            <h1>Lesson Planner</h1>
          ) : (
            <>
              <nav className="crumbs" aria-label="Breadcrumb">
                {crumbs.map((c) => (
                  <span key={c.to} className="crumb-item">
                    <button
                      type="button"
                      className="crumb crumb-link"
                      onClick={() => navigate(c.to)}
                    >
                      {c.label}
                    </button>
                    <span className="crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </span>
                ))}
              </nav>

              <h1>{title}</h1>
            </>
          )}

        </div>
      </div>

      <div
        className="context-chips"
        aria-label="School, academic year and board"
      >
        <span className="chip-ctx">
          {ctx.school}
        </span>

        <span className="chip-ctx">
          {ctx.year}
        </span>

        <span className="chip-ctx">
          {ctx.board}
        </span>
      </div>

      <div className="topbar-right">

        {/* Notifications */}
        <div
          className="popover-wrap"
          ref={bell.ref}
        >
          <button
            className="round-btn"
            onClick={openBell}
            aria-label={`Notifications${
              unread
                ? `, ${unread} unread`
                : ''
            }`}
          >
            <Bell size={19} />

            {unread > 0 && (
              <span className="bell-count" aria-hidden="true">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {bell.open && (
            <div className="popover">

              <h4>Notifications</h4>

              {notifications.length === 0 && (
                <p
                  className="faint"
                  style={{ padding: 10 }}
                >
                  You're all caught up.
                </p>
              )}

              <div
                style={{
                  maxHeight: 380,
                  overflowY: 'auto',
                }}
              >
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    className={`pop-item ${
                      n.read
                        ? ''
                        : 'unread'
                    }`}
                    onClick={() => {
                      bell.setOpen(false);

                      if (n.link) {
                        navigate(n.link);
                      }
                    }}
                  >
                    <span
                      className="stack"
                      style={{ gap: 2 }}
                    >
                      <span className="strong small">
                        {n.title}
                      </span>

                      <span className="small muted">
                        {n.text}
                      </span>

                      <span className="faint">
                        {timeAgo(n.at)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div
          className="popover-wrap"
          ref={profile.ref}
        >
          <button
            className="round-btn"
            onClick={() =>
              profile.setOpen(
                (o) => !o
              )
            }
            aria-label="Profile"
          >
            <User size={20} />
          </button>

          {profile.open && (
            <div
              className="popover"
              style={{ width: 250 }}
            >

              <div
                style={{
                  padding:
                    '8px 10px 12px',
                  borderBottom:
                    '1px solid var(--line)',
                }}
              >
                <div className="strong">
                  {user?.name}
                </div>

                <div className="faint">
                  {ROLE_LABELS[role]}
                </div>
              </div>

              {/* Demo only: with the real backend your role comes from your login */}
              {USE_MOCK && (
                <h4
                  className="faint"
                  style={{
                    fontWeight: 500,
                  }}
                >
                  View as (demo)
                </h4>
              )}

              {USE_MOCK &&
                Object.entries(
                  ROLE_LABELS
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className={`pop-item ${
                      role === k
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => {
                      setRole(k);

                      profile.setOpen(
                        false
                      );

                      navigate(LP_BASE);
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                      }}
                    >
                      {label}
                    </span>

                    {role === k && (
                      <Check size={16} />
                    )}
                  </button>
                ))}

              {/* Log out */}
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  marginTop: 6,
                  paddingTop: 6,
                }}
              >
                <button
                  className="pop-item"
                  onClick={() => {
                    profile.setOpen(false);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                >
                  <LogOut size={16} />
                  <span style={{ flex: 1 }}>
                    Log out
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}