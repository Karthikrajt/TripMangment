import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession, useIsAdmin } from './store/session';
import { AppShell } from './components/layout/AppShell';
import { FullPageSpinner, Spinner, ErrorState } from './components/ui/Feedback';
import { Toaster } from './components/ui/Toast';
import { ConfirmHost } from './components/ui/Confirm';
import { UpdatePrompt } from './components/UpdatePrompt';
import { DocViewerHost } from './components/DocViewer';
import { WhoAreYou } from './components/WhoAreYou';
import { env, missingConfig } from './config/env';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Setup from './pages/Setup';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Live = lazy(() => import('./pages/Live'));
const Itinerary = lazy(() => import('./pages/Itinerary'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Accommodation = lazy(() => import('./pages/Accommodation'));
const Rooms = lazy(() => import('./pages/Rooms'));
const Transport = lazy(() => import('./pages/Transport'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Checklist = lazy(() => import('./pages/Checklist'));
const Call = lazy(() => import('./pages/Call'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ExpenseForm = lazy(() => import('./pages/ExpenseForm'));
const Settlements = lazy(() => import('./pages/Settlements'));
const Chat = lazy(() => import('./pages/Chat'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Members = lazy(() => import('./pages/Members'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
const TripSettings = lazy(() => import('./pages/admin/TripSettings'));
const Approvals = lazy(() => import('./pages/admin/Approvals'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Audit = lazy(() => import('./pages/admin/Audit'));

/** UI guard only – firestore.rules is what actually protects admin data. */
function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : <ErrorState message="This page is only available to the trip admin." />;
}

function ConfigMissing() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Configuration needed</h1>
      <p className="mt-2 text-slate-600">Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase settings. Missing: {missingConfig.join(', ')}.</p>
    </div>
  );
}

function Gate() {
  const { authReady, user, memberLoaded, member, summary } = useSession();
  if (!authReady) return <FullPageSpinner />;
  if (!user) return <Login />;
  if (!memberLoaded) return <FullPageSpinner label="Checking your access…" />;
  if (member?.status === 'approved') return <ApprovedApp />;
  if (summary === undefined) return <FullPageSpinner />;
  if (summary === null && !member && user.email?.toLowerCase() === env.bootstrapAdminEmail && user.emailVerified) return <Setup />;
  return <Pending />;
}

function ApprovedApp() {
  return (
    <AppShell>
      <WhoAreYou />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<Live />} />
          <Route path="/itinerary" element={<Itinerary />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/accommodation" element={<Accommodation />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/transport" element={<Transport />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/call" element={<Call />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/expenses/new" element={<ExpenseForm />} />
          <Route path="/expenses/:id/edit" element={<ExpenseForm />} />
          <Route path="/settlements" element={<Settlements />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/members" element={<Members />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin/settings" element={<AdminOnly><TripSettings /></AdminOnly>} />
          <Route path="/admin/approvals" element={<AdminOnly><Approvals /></AdminOnly>} />
          <Route path="/admin/reports" element={<AdminOnly><Reports /></AdminOnly>} />
          <Route path="/admin/audit" element={<AdminOnly><Audit /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  if (missingConfig.length) return <ConfigMissing />;
  return (
    <BrowserRouter>
      <Gate />
      <Toaster />
      <ConfirmHost />
      <UpdatePrompt />
      <DocViewerHost />
    </BrowserRouter>
  );
}
