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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  Database,
  Calculator,
  Beaker,
  Network
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

  // Expanded menu structure
  const menuGroups = [
    {
      title: "Clinique",
      icon: Stethoscope,
      items: [
        { path: '/dashboard', label: t('nav.dashboard', 'Tableau de bord'), icon: LayoutDashboard },
        { path: '/patients', label: t('nav.patients', 'Patients'), icon: Users },
        { path: '/pathologies', label: t('nav.pathologies', 'Pathologies'), icon: BookOpen },
      ]
    },
    {
      title: "Recherche",
      icon: FlaskConical,
      items: [
        { path: '/cross-data-analysis', label: t('analysis.crossDataAnalysis', 'Analyse Cross-Data'), icon: Network },
        { path: '/continuous-discovery', label: 'Discovery Engine', icon: Sparkles },
        { path: '/discovery-platform', label: 'Plateforme de Découverte', icon: Activity },
      ]
    },
    {
      title: "Outils",
      icon: Beaker,
      items: [
        { path: '/tools/molecule-workbench', label: 'Molecule Workbench', icon: Beaker },
        { path: '/tools/switch-calculator', label: 'Switch Calculator', icon: Calculator },
        { path: '/search', label: t('common.search', 'Recherche Globale'), icon: Search },
      ]
    },
    {
      title: "Système",
      icon: Settings,
      items: [
        { path: '/populate-data', label: 'Injection de Données', icon: Database },
        { path: '/admin', label: t('nav.admin', 'Administration'), icon: Shield },
      ]
    }
  ];

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

  const initials = user?.user_metadata?.first_name?.[0]?.toUpperCase() +
    user?.user_metadata?.last_name?.[0]?.toUpperCase() || 'U';

  const [mouseAtTop, setMouseAtTop] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 40) {
        setMouseAtTop(true);
      }
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
      <CursorCSS />

      <div id="parallax-bg" className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={cn(
          "absolute top-0 right-0 w-[1000px] h-[1000px] blur-[140px] rounded-full -translate-y-1/2 translate-x-1/2 transition-colors duration-700",
          theme === 'dark' ? 'bg-cyan-500/10' : 'bg-cyan-400/20'
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-[800px] h-[800px] blur-[120px] rounded-full translate-y-1/2 -translate-x-1/4 transition-colors duration-700",
          theme === 'dark' ? 'bg-indigo-600/10' : 'bg-indigo-400/15'
        )} />
        <div className={cn(
          "absolute inset-0 opacity-[0.03]",
          theme === 'dark' ? 'invert-0' : 'invert'
        )} style={{ backgroundImage: 'radial-gradient(#22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div
        className="fixed top-0 left-0 right-0 h-2 z-[60]"
        onMouseEnter={() => setMouseAtTop(true)}
      />

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
                "w-[300px] p-0 overflow-y-auto",
                theme === 'dark' ? "bg-[#0a0f1a] border-white/10" : "bg-white border-slate-200"
              )}>
                <div className="flex flex-col min-h-full">
                  <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
                        N
                      </div>
                      <div>
                        <span className="text-lg font-bold text-cyan-400">NEXUS<span className="text-slate-500">MED</span></span>
                      </div>
                    </div>
                  </div>

                  <nav className="flex-1 p-4 space-y-2">
                    {menuGroups.map((group, idx) => (
                      <Collapsible key={idx} defaultOpen={idx === 0} className="space-y-2">
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
                          <div className="flex items-center gap-2">
                            <group.icon className="w-4 h-4" />
                            {group.title}
                          </div>
                          <ChevronDown className="w-3 h-3 transition-transform duration-200" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pl-6">
                          {group.items.map((item) => (
                            <Link
                              key={item.path}
                              to={item.path}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-md text-sm transition-colors",
                                location.pathname === item.path
                                  ? "bg-cyan-500/10 text-cyan-400"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                              )}
                            >
                              <item.icon className="w-4 h-4" />
                              {item.label}
                            </Link>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </nav>

                  <div className="p-4 border-t border-white/5 mt-auto">
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
            <nav className="hidden md:flex items-center gap-2 ml-6">
              {menuGroups.map((group, idx) => (
                <DropdownMenu key={idx}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                      <group.icon className="w-4 h-4" />
                      {group.title}
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 p-2">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link
                          to={item.path}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            location.pathname === item.path && "bg-accent text-accent-foreground"
                          )}
                        >
                          <item.icon className="w-4 h-4 text-muted-foreground" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
      <main className="container py-4 md:py-6 px-4 animate-fade-in relative z-10 pt-24">
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
            <span className="font-bold">Status: Optimal</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <span>AES-256</span>
          <div className="h-3 w-px bg-white/10" />
          <span>v2.4.0</span>
        </div>
        <div className="flex items-center gap-6 font-mono">
          <span className="hidden md:inline">Health Index: 98%</span>
          <span className="text-slate-500">© 2026 NexusMed</span>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;