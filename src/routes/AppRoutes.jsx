import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LessonPlannerHome from '@/pages/lesson-planner/LessonPlannerHome';
import LoginPage from '@/pages/LoginPage';
import DashboardLayout from '@/layout/DashboardLayout';
import { useApp } from '@/context/AppContext';
import {
  LP_BASE,
  lpPages,
} from './routeConfig';
import TodayPage from '@/pages/lesson-planner/TodayPage';
import CalendarPage from '@/pages/lesson-planner/CalendarPage';
import PlansPage from '@/pages/lesson-planner/PlansPage';
import CreatePlanPage from '@/pages/lesson-planner/CreatePlanPage';
import PlanDetailPage from '@/pages/lesson-planner/PlanDetailPage';
import DeliveryPage from '@/pages/lesson-planner/DeliveryPage';
import HistoryPage from '@/pages/lesson-planner/HistoryPage';
import ApprovalsPage from '@/pages/lesson-planner/ApprovalsPage';
import LibraryPage from '@/pages/lesson-planner/LibraryPage';
import SyllabusPage from '@/pages/lesson-planner/SyllabusPage';
import ReportsPage from '@/pages/lesson-planner/ReportsPage';
import SettingsPage from '@/pages/lesson-planner/SettingsPage';
import ExaminationsPage from '@/pages/lesson-planner/ExaminationsPage';
import HolidaysPage from '@/pages/lesson-planner/HolidaysPage';
import HomeworkPage from '@/pages/lesson-planner/HomeworkPage';
import MasterDataPage from '@/pages/lesson-planner/MasterDataPage';
import LessonInfoPage from '@/pages/lesson-planner/LessonInfoPage';

const pages = {
  today: TodayPage,
  calendar: CalendarPage,
  plans: PlansPage,
  delivery: DeliveryPage,
  history: HistoryPage,
  approvals: ApprovalsPage,
  library: LibraryPage,
  syllabus: SyllabusPage,
  reports: ReportsPage,
  settings: SettingsPage,
  examinations: ExaminationsPage,
  holidays: HolidaysPage,
  homework: HomeworkPage,
  'master-data': MasterDataPage,
  'lesson-information': LessonInfoPage,
};
// Not logged in → the login page (it comes back to the page they asked for afterwards)
function RequireLogin({ children }) {
  const { isLoggedIn } = useApp();
  const location = useLocation();
  return isLoggedIn ? children : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}
// Sends users to their landing page if their role can't open this page
function Guard({ path, roles, children }) {
  const { role } = useApp();

  const allowed = (
    roles ||
    lpPages.find(
      (p) => p.path === path
    )?.roles ||
    []
  ).includes(role);

  return allowed
    ? children
    : <Navigate to={LP_BASE} replace />;
}

export default function AppRoutes() {
  
  return (
        <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path={LP_BASE}
        element={
          <RequireLogin>
            <DashboardLayout />
          </RequireLogin>
        }
      >
        <Route
  index
  element={<LessonPlannerHome />}
/>
        {Object.entries(pages).map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={
              <Guard path={path}>
                <Page />
              </Guard>
            }
          />
        ))}
        <Route
          path="plans/new"
          element={
            <Guard roles={['teacher']}>
              <CreatePlanPage />
            </Guard>
          }
        />
        <Route path="plans/:id" element={<PlanDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to={LP_BASE} replace />} />
    </Routes>
  );
}
