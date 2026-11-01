import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Activity } from 'lucide-react';
import { resolveRouteAccess, type AppRole } from './access-policy';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole;
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, role, loading, roleLoading } = useAuth();
  const decision = resolveRouteAccess({ userId: user?.id || null, role, loading, roleLoading, requiredRole });

  if (decision === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <div className="text-center">
          <Activity className="h-10 w-10 animate-pulse text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (decision === 'login') return <Navigate to="/auth" replace />;
  if (decision === 'denied') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
