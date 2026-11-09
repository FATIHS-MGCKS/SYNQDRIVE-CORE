import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getStoredUser } from './lib/auth';
import { AppThemeProvider } from './context/AppThemeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import MasterApp from './master/App';
import RentalApp from './rental/App';
import OperatorApp from './operator/OperatorApp';
import LoginPage from './pages/LoginPage';
import VerificationDonePage from './pages/VerificationDonePage';
import ServiceInfoV3DevFixturePage from './pages/dev/ServiceInfoV3DevFixturePage';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (requiredRole) {
    const user = getStoredUser();
    if (user && user.platformRole !== requiredRole) {
      return <Navigate to="/rental" replace />;
    }
  }
  return <>{children}</>;
}

function LoginRoute() {
  if (isAuthenticated()) {
    const user = getStoredUser();
    if (user?.platformRole === 'MASTER_ADMIN') {
      return <Navigate to="/master" replace />;
    }
    return <Navigate to="/rental" replace />;
  }
  return <LoginPage />;
}

function DefaultRedirect() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  const user = getStoredUser();
  if (user?.platformRole === 'MASTER_ADMIN') {
    return <Navigate to="/master" replace />;
  }
  return <Navigate to="/rental" replace />;
}

export default function App() {
  return (
    <AppThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/verification/done" element={<VerificationDonePage />} />
            {import.meta.env.DEV ? (
              <Route path="/dev/service-info-v3" element={<ServiceInfoV3DevFixturePage />} />
            ) : null}
            <Route
              path="/master"
              element={
                <ProtectedRoute requiredRole="MASTER_ADMIN">
                  <MasterApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rental"
              element={
                <ProtectedRoute>
                  <RentalApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/operator/*"
              element={
                <ProtectedRoute>
                  <OperatorApp />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AppThemeProvider>
  );
}
