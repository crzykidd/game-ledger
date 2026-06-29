import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { ToastProvider } from '../components/ui/Toast';
import { InstallWizard } from './InstallWizard';
import { Login } from './Login';
import { AcceptInvite } from './AcceptInvite';
import { PasswordReset } from './PasswordReset';
import { Dashboard } from './Dashboard';
import { Profile } from './Profile';
import { AdminLayout } from '../admin/AdminLayout';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminUserDetail } from '../admin/AdminUserDetail';
import { AdminInvites } from '../admin/AdminInvites';
import { AdminResets } from '../admin/AdminResets';
import { AdminGroups } from '../admin/AdminGroups';
import { AdminAudit } from '../admin/AdminAudit';
import { AdminMaintenance } from '../admin/AdminMaintenance';
import { PlayersPage } from '../play/PlayersPage';
import { StartGamePage } from '../play/StartGamePage';
import { GamePage } from '../play/GamePage';
import { ResultsPage } from '../play/ResultsPage';
import { HistoryPage } from '../play/HistoryPage';
import { getSetupStatus } from '../api/setup';
import { Spinner } from '../components/ui/Spinner';
import { useLocation } from 'react-router-dom';

function SetupGate({ children }: { children: React.ReactNode }) {
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState(false);

  const checkSetup = React.useCallback(() => {
    setSetupError(false);
    setSetupChecked(false);
    getSetupStatus()
      .then((res) => {
        setSetupComplete(res.setupComplete);
      })
      .catch(() => {
        // Failed to reach the API — show an error rather than silently
        // assuming setup is complete (which would send fresh installs to /login).
        setSetupError(true);
      })
      .finally(() => setSetupChecked(true));
  }, []);

  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  if (!setupChecked) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Spinner size="lg" />
      </div>
    );
  }

  if (setupError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: '1rem',
        }}
      >
        <p>Could not reach the server. Please check your connection.</p>
        <button onClick={checkSetup}>Retry</button>
      </div>
    );
  }

  // When setup is not yet complete, redirect declaratively — avoids races with
  // ProtectedRoute that imperative navigate() inside a useEffect can cause.
  if (setupComplete === false) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

function LoginWithState() {
  const location = useLocation();
  const state = location.state as { successMessage?: string } | null;
  return <Login successMessage={state?.successMessage} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public setup route */}
            <Route path="/setup" element={<InstallWizard />} />

            {/* All other routes are inside the setup gate */}
            <Route
              path="*"
              element={
                <SetupGate>
                  <Routes>
                    <Route path="/login" element={<LoginWithState />} />
                    <Route path="/invite/:token" element={<AcceptInvite />} />
                    <Route path="/reset/:token" element={<PasswordReset />} />
                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/players"
                      element={
                        <ProtectedRoute>
                          <PlayersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/play/new"
                      element={
                        <ProtectedRoute>
                          <StartGamePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/play/:id/results"
                      element={
                        <ProtectedRoute>
                          <ResultsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/play/:id"
                      element={
                        <ProtectedRoute>
                          <GamePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/history"
                      element={
                        <ProtectedRoute>
                          <HistoryPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute>
                          <AdminLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="/admin/users" replace />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="users/:id" element={<AdminUserDetail />} />
                      <Route path="invites" element={<AdminInvites />} />
                      <Route path="resets" element={<AdminResets />} />
                      <Route path="groups" element={<AdminGroups />} />
                      <Route path="audit" element={<AdminAudit />} />
                      <Route path="maintenance" element={<AdminMaintenance />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </SetupGate>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
