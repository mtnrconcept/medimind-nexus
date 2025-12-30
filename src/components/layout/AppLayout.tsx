import { ReactNode, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Activity,
  Search,
  BookOpen,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Stethoscope,
  FlaskConical,
  Shield,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSelector } from '@/components/ui/language-selector';
import { useTheme } from 'next-themes';
import CursorCSS from '@/components/nexus/CursorCSS';
import { useEffect, useRef } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme } = useTheme();
  const scrollRef = useRef<number>(0);

  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  // Subtle parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      scrollRef.current = window.scrollY;
      const parallaxBg = document.getElementById('parallax-bg');
      if (parallaxBg) {
        parallaxBg.style.transform = `translateY(${window.scrollY * 0.2}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getRoleIcon = () => {
    switch (role) {
      case 'doctor': return <Stethoscope className="h-4 w-4" />;
      case 'researcher': return <FlaskConical className="h-4 w-4" />;
      case 'admin': return <Shield className="h-4 w-4" />;
      default: return null;
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'doctor': return t('nav.doctor', 'Médecin');
      case 'researcher': return t('nav.researcher', 'Chercheur');
      case 'admin': return t('nav.admin', 'Administrateur');
      default: return t('nav.user', 'Utilisateur');
    }
  };

  const navItems = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/patients', label: t('nav.patients'), icon: Users },
    { path: '/pathologies', label: t('nav.pathologies'), icon: BookOpen },
    { path: '/cross-data-analysis', label: t('analysis.crossDataAnalysis', 'Analyse Cross-Data'), icon: Sparkles },
    { path: '/continuous-discovery', label: 'Discovery Engine', icon: FlaskConical },
    { path: '/search', label: t('common.search'), icon: Search },
  ];

  // TEMPORAIRE: Admin visible pour tous pendant la config initiale
  // if (role === 'admin') {
  navItems.push({ path: '/admin', label: t('nav.admin'), icon: Settings });
  // }

  const initials = user?.user_metadata?.first_name?.[0]?.toUpperCase() +
    user?.user_metadata?.last_name?.[0]?.toUpperCase() || 'U';

  const NavLink = ({ item, mobile = false }: { item: typeof navItems[0], mobile?: boolean }) => (
    <Link
      to={item.path}
      onClick={() => mobile && setMobileMenuOpen(false)}
      className="block"
    >
      <Button
        variant={location.pathname === item.path || location.pathname.startsWith(item.path + '/') ? 'secondary' : 'ghost'}
        className={cn(
          "gap-2 transition-all duration-200",
          mobile ? "w-full justify-start text-base py-6" : "",
          location.pathname === item.path && "bg-primary/10 text-primary border border-primary/20"
        )}
        size={mobile ? "lg" : "default"}
      >
        <item.icon className={cn("h-4 w-4", mobile && "h-5 w-5")} />
        {item.label}
      </Button>
    </Link>
  );

  const [mouseAtTop, setMouseAtTop] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Show header if mouse is near top (top 40px)
      if (e.clientY < 40) {
        setMouseAtTop(true);
      }
      // Hide if mouse leaves header area (header height is 64px)
      else if (e.clientY > 80 && mouseAtTop) {
        setMouseAtTop(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseAtTop]);

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-700 relative overflow-x-hidden",
      theme === 'dark' ? 'bg-[#020617] text-slate-200' : 'bg-[#fcfdfe] text-slate-900'
    )}>
      {/* CSS-based cursor effect - no WebGL conflicts */}
      <CursorCSS />


      {/* Parallax Background Ambience */}
      <div id="parallax-bg" className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={cn(
          "absolute top-0 right-0 w-[1000px] h-[1000px] blur-[140px] rounded-full -translate-y-1/2 translate-x-1/2 transition-colors duration-700",
          theme === 'dark' ? 'bg-cyan-500/10' : 'bg-cyan-400/20'
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-[800px] h-[800px] blur-[120px] rounded-full translate-y-1/2 -translate-x-1/4 transition-colors duration-700",
          theme === 'dark' ? 'bg-indigo-600/10' : 'bg-indigo-400/15'
        )} />

        {/* Floating background grids */}
        <div className={cn(
          "absolute inset-0 opacity-[0.03]",
          theme === 'dark' ? 'invert-0' : 'invert'
        )} style={{ backgroundImage: 'radial-gradient(#22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Hover Trigger Area (Invisible) */}
      <div
        className="fixed top-0 left-0 right-0 h-2 z-[60]"
        onMouseEnter={() => setMouseAtTop(true)}
      />

      {/* Header */}
      <header className={cn(
        "fixed top-0 z-50 w-full border-b backdrop-blur-xl transition-all duration-500 ease-in-out transform",
        !mouseAtTop ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
        theme === 'dark'
          ? "bg-[#020617]/80 border-white/5"
          : "bg-white/80 border-slate-200/50"
      )}>
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className={cn(
                "w-[280px] p-0",
                theme === 'dark' ? "bg-[#0a0f1a] border-white/10" : "bg-white border-slate-200"
              )}>
                <div className="flex flex-col h-full">
                  <div className={cn(
                    "p-4 border-b",
                    theme === 'dark' ? "border-white/10" : "border-slate-200"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg",
                        theme === 'dark'
                          ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-400"
                          : "bg-cyan-600/10 border border-cyan-600/30 text-cyan-600"
                      )}>
                        N
                      </div>
                      <div>
                        <span className={cn(
                          "text-lg font-bold",
                          theme === 'dark' ? "text-cyan-400" : "text-cyan-600"
                        )}>NEXUS<span className={theme === 'dark' ? "text-slate-300" : "text-slate-700"}>MED</span></span>
                        <p className={cn(
                          "text-[10px] -mt-0.5 font-mono",
                          theme === 'dark' ? "text-slate-500" : "text-slate-400"
                        )}>Medical Platform</p>
                      </div>
                    </div>
                  </div>
                  <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                      <NavLink key={item.path} item={item} mobile />
                    ))}
                  </nav>
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium">Apparence</span>
                      <ThemeToggle />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user?.user_metadata?.first_name} {user?.user_metadata?.last_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {getRoleIcon()}
                          {getRoleLabel()}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full gap-2"
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4" />
                      Se déconnecter
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/dashboard" className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center font-black text-base",
                theme === 'dark'
                  ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-400"
                  : "bg-cyan-600/10 border border-cyan-600/30 text-cyan-600"
              )}>
                N
              </div>
              <span className={cn(
                "text-lg font-bold hidden sm:inline",
                theme === 'dark' ? "text-cyan-400" : "text-cyan-600"
              )}>NEXUS<span className={theme === 'dark' ? "text-slate-300" : "text-slate-700"}>MED</span></span>
            </Link>


            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 ml-4">
              {navItems.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline-block text-sm">
                    {user?.user_metadata?.first_name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.user_metadata?.first_name} {user?.user_metadata?.last_name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                    <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                      {getRoleIcon()}
                      {getRoleLabel()}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-4 md:py-6 px-4 animate-fade-in relative z-10">
        {children}
      </main>

      {/* Footer / Status Bar (Nexus Style) */}
      <footer className={cn(
        "fixed bottom-0 left-0 right-0 h-8 backdrop-blur-md border-t border-white/5 flex items-center justify-between px-6 z-50 overflow-hidden text-[9px] uppercase tracking-widest",
        theme === 'dark' ? 'bg-[#020617]/80 text-slate-400' : 'bg-white/80 text-slate-500'
      )}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
            <span className="font-bold">Core Status: Optimal</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <span>Encryption: AES-256-QUANTUM</span>
          <div className="h-3 w-px bg-white/10" />
          <span>Network: LIFI-V6</span>
        </div>
        <div className="flex items-center gap-6 font-mono">
          <span className="hidden md:inline">Global Health Index: 92.4%</span>
          <span className="text-slate-500">© 2024 NexusMed AI</span>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;