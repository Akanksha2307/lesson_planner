import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { lessonPlannerApi, USE_MOCK } from '@/services/lessonPlannerApi';
import { setApiContext } from '@/services/apiClient';
import { clearSession, getSession, saveSession } from '@/services/session';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Top bar context – in Qshikshak these come from the existing chips
  const [ctx] = useState({ school: 'one', year: '2024-2025', board: 'SSC' });
  // Logged-in person ({ token, user }) – null until they log in on /login
  const [session, setSession] = useState(() => getSession());
  // Role: from the login. In mock mode the "View as (demo)" switch can still change it.
  const [role, setRole] = useState(() => getSession()?.user.role || 'teacher');
  const [masters, setMasters] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // Set before the first render so the login request already carries the school id
  setApiContext(ctx);

  const login = useCallback(async (username, password) => {
    const res = await lessonPlannerApi.login({ username, password });
    saveSession(res.data);
    setSession(res.data);
    setRole(res.data.user.role);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setMasters(null);
    setNotifications([]);
  }, []);

  const loadMasters = useCallback(async () => {
    const res = await lessonPlannerApi.getMasters();
    setMasters(res.data);
  }, []);
  useEffect(() => {
    // An expired login answers 401 – apiClient then sends the browser to /login
    if (session) loadMasters().catch(() => {});
  }, [session, loadMasters]);

  const user = useMemo(() => {
    if (!masters || !session) return null;
    // Real backend: always the person who logged in. Mock: whoever "View as" points to.
    if (!USE_MOCK || role === session.user.role) {
      return masters.staff.find((s) => s.id === session.user.id) || session.user;
    }
    return masters.staff.find((s) => s.id === masters.usersByRole[role]);
  }, [masters, role, session]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const res = await lessonPlannerApi.getNotifications({ userId: user.id });
    setNotifications(res.data);
  }, [user]);
  useEffect(() => {
    loadNotifications().catch(() => {});
  }, [loadNotifications]);

  // Lookup helpers used across pages
  const helpers = useMemo(() => {
    if (!masters) return {};
    const find = (list, id) => masters[list].find((x) => x.id === id);
    return {
      className: (id) => find('classes', id)?.name,
      sectionsOf: (classId) => masters.sections.filter((s) => s.classId === classId),
      subjectName: (id) => find('subjects', id)?.name,
      staffName: (id) => find('staff', id)?.name,
      sectionLabel: (sectionId) => {
        const s = find('sections', sectionId);
        return s ? `${find('classes', s.classId).name}-${s.name}` : '';
      },
      // Class/section/subject combos the current teacher teaches (from timetable)
      myAssignments: (teacherId) => {
        const seen = new Map();
        masters.timetable
          .filter((t) => t.teacherId === teacherId)
          .forEach((t) => {
            const key = `${t.sectionId}|${t.subjectId}`;
            if (!seen.has(key)) {
              const sec = find('sections', t.sectionId);
              seen.set(key, { ...t, classId: sec.classId, periodsPerWeek: 0 });
            }
            seen.get(key).periodsPerWeek += 1;
          });
        return [...seen.values()];
      },
    };
  }, [masters]);

  const value = {
    ctx,
    session,
    isLoggedIn: Boolean(session),
    login,
    logout,
    role,
    setRole,
    user,
    masters,
    loadMasters,
    notifications,
    loadNotifications,
    setNotifications,
    ...helpers,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);