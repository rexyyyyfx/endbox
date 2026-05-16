import { useEffect } from 'react';
import { Switch, Route, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from './store/auth';
import { initSocket } from './lib/socket';
import AuthPage from './pages/auth';
import MainPage from './pages/main';
import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { token } = useAuthStore();

  useEffect(() => {
    if (!token) {
      navigate('/auth');
    }
  }, [token, navigate]);

  if (!token) return null;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { token } = useAuthStore();

  useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  if (token) return null;
  return <>{children}</>;
}

function SocketInit() {
  const { token } = useAuthStore();

  useEffect(() => {
    if (token) {
      initSocket(token);
    }
  }, [token]);

  return null;
}

function ThemeInit() {
  // Theme is managed per-user via ig CSS vars
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth">
        <GuestGuard>
          <AuthPage />
        </GuestGuard>
      </Route>
      <Route path="/chat/:id">
        <AuthGuard>
          <MainPage />
        </AuthGuard>
      </Route>
      <Route path="/">
        <AuthGuard>
          <MainPage />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeInit />
        <SocketInit />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
