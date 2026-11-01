import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeSignupMetadata } from '@/components/auth/access-policy';

type AppRole = 'admin' | 'researcher' | 'doctor';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, metadata: { first_name: string; last_name: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const roleRequestVersion = useRef(0);

  const fetchUserRole = async (userId: string, version: number) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .limit(1);

      if (version !== roleRequestVersion.current) return;
      if (error) throw error;
      setRole(data && data.length > 0 ? (data[0].role as AppRole) : null);
    } catch (err) {
      if (version === roleRequestVersion.current) {
        setRole(null);
        console.error('Error fetching user role:', err);
      }
    } finally {
      if (version === roleRequestVersion.current) setRoleLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const requestVersion = roleRequestVersion;
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      const version = ++roleRequestVersion.current;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setRole(null);
      setRoleLoading(Boolean(nextSession?.user));
      setLoading(false);
      if (nextSession?.user) {
        // Supabase auth listeners must not synchronously make other Supabase requests.
        setTimeout(() => {
          if (mounted && version === roleRequestVersion.current) {
            void fetchUserRole(nextSession.user.id, version);
          }
        }, 0);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => applySession(nextSession)
    );
    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => applySession(currentSession))
      .catch((error) => {
        console.error('Session initialization failed:', error);
        applySession(null);
      });
    return () => { mounted = false; ++requestVersion.current; subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    metadata: { first_name: string; last_name: string }
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: sanitizeSignupMetadata(metadata),
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setRoleLoading(false);
    ++roleRequestVersion.current;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, roleLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
