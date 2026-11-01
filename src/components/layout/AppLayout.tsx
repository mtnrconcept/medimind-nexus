import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowUpRight, Beaker, BookOpen, BrainCircuit, Calculator, ChartNoAxesCombined,
  ChevronDown, Cloud, Cpu, Database, FlaskConical, HeartPulse, LayoutDashboard, LogOut,
  Menu, Search, ShieldCheck, Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAI } from '@/contexts/AIContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSelector } from '@/components/ui/language-selector';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  buildNavigation, getRouteInfo, isNavigationActive,
  type WorkspaceGroup, type WorkspaceLink,
} from './navigation';

interface AppLayoutProps { children: ReactNode }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  patients: Users,
  pathologies: BookOpen,
  analysis: ChartNoAxesCombined,
  search: Search,
  discovery: BrainCircuit,
  research: FlaskConical,
  microsignals: Activity,
  molecule: Beaker,
  calculator: Calculator,
  admin: ShieldCheck,
  import: Database,
};

const roleLabel = {
  admin: 'Administrateur',
  doctor: 'Médecin',
  researcher: 'Chercheur',
} as const;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="MediCore — Vue d’ensemble">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-primary text-primary-foreground shadow-sm">
        <HeartPulse className="h-5 w-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[17px] font-bold tracking-tight text-foreground">MediCore</span>
          <span className="block text-[11px] font-medium text-muted-foreground">Espace clinique</span>
        </span>
      )}
    </Link>
  );
}

function NavigationItem({ item, pathname, onNavigate }: {
  item: WorkspaceLink;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = iconMap[item.icon] ?? Activity;
  const active = isNavigationActive(item.path, pathname);
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active && <span className="sr-only">Page actuelle</span>}
    </Link>
  );
}

function Navigation({ groups, pathname, onNavigate, mobile = false }: {
  groups: WorkspaceGroup[];
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  return (
    <nav aria-label="Navigation principale" className="space-y-5">
      {groups.map((group, index) => (
        <div key={group.id}>
          {index === 0 ? (
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              {group.label}
            </div>
          ) : (
            <details open={mobile || group.items.some(item => isNavigationActive(item.path, pathname))} className="group/section" key={`${group.id}-${mobile ? 'mobile' : 'desktop'}`}>
              <summary className="mb-1 flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {group.label}
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/section:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-1">
                {group.items.map((item) => <NavigationItem key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />)}
              </div>
            </details>
          )}
          {index === 0 && (
            <div className="space-y-1">
              {group.items.map((item) => <NavigationItem key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />)}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, signOut } = useAuth();
  const { llmMode, setLLMMode } = useAI();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = useMemo(() => buildNavigation(role), [role]);
  const current = getRouteInfo(location.pathname);
  const first = typeof user?.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '';
  const last = typeof user?.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : '';
  const userDisplay = [first, last].filter(Boolean).join(' ') || user?.email || 'Compte utilisateur';
  const initials = ([first?.[0], last?.[0]].filter(Boolean).join('') || user?.email?.[0] || 'U').toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="clinical-workspace min-h-screen bg-background text-foreground">
      <a href="#clinical-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg">
        Aller au contenu principal
      </a>

      {/* A calm, persistent navigation avoids multi-level dropdown hunting. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-border/80 bg-card/95 lg:flex" aria-label="Menu de l’espace clinique">
        <div className="border-b border-border/70 px-6 py-5"><Brand /></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6">
          <Navigation groups={groups} pathname={location.pathname} />
        </div>
        <div className="border-t border-border/70 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">Aide à l’analyse médicale · Les résultats nécessitent une validation clinique.</p>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[252px]">
        <header className="sticky top-0 z-20 border-b border-border/75 bg-card/95 backdrop-blur-xl">
          <div className="flex h-[70px] items-center gap-3 px-4 sm:px-6 lg:px-9">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Ouvrir la navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[300px] flex-col overflow-y-auto p-0 sm:w-[320px]">
                <SheetHeader className="border-b border-border px-5 py-5">
                  <SheetTitle className="sr-only">Navigation MediCore</SheetTitle>
                  <Brand />
                </SheetHeader>
                <div className="flex-1 px-3 py-5">
                  <Navigation groups={groups} pathname={location.pathname} mobile onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden sm:inline">MediCore</span>
                <span className="hidden sm:inline" aria-hidden="true">/</span>
                <span>{current.section}</span>
                {current.parentPath && <>
                  <span aria-hidden="true">/</span>
                  <Link to={current.parentPath} className="font-medium text-primary hover:underline">{getRouteInfo(current.parentPath).title}</Link>
                </>}
              </div>
              <p className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">{current.title}</p>
            </div>

            <Link to="/search" className="hidden min-h-9 items-center gap-2 rounded-xl border border-border bg-background/70 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex" aria-label="Ouvrir la recherche médicale (Ctrl K)">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Rechercher</span>
              <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-[10px] xl:inline">Ctrl K</kbd>
            </Link>
            <div className="hidden sm:block"><LanguageSelector /></div>
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 rounded-xl px-1.5 sm:px-2" aria-label="Ouvrir le menu du compte">
                  <Avatar className="h-8 w-8 border border-primary/15">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-32 truncate text-xs font-semibold xl:inline">{first || 'Compte'}</span>
                  <ChevronDown className="hidden h-3 w-3 text-muted-foreground sm:block" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 shadow-xl">
                <DropdownMenuLabel className="space-y-1 px-3 py-2 font-normal">
                  <div className="truncate text-sm font-semibold text-foreground">{userDisplay}</div>
                  <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                  <div className="text-xs font-medium text-primary">{role ? roleLabel[role] : 'Accès limité'}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/dashboard')} className="gap-2 rounded-lg"><LayoutDashboard className="h-4 w-4" /> Tableau de bord</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLLMMode(llmMode === 'cloud' ? 'local' : 'cloud')} className="gap-2 rounded-lg">
                  {llmMode === 'cloud' ? <Cloud className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
                  Préférence IA : {llmMode === 'cloud' ? 'Cloud' : 'Local'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 rounded-lg text-destructive focus:text-destructive"><LogOut className="h-4 w-4" /> Se déconnecter</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="clinical-main" tabIndex={-1} className="mx-auto w-full max-w-[1640px] px-4 pb-16 pt-7 outline-none sm:px-6 lg:px-9 lg:pt-9">
          {children}
        </main>
        <div className="mx-auto flex max-w-[1640px] items-center justify-between border-t border-border/55 px-4 py-5 text-[11px] text-muted-foreground sm:px-6 lg:px-9">
          <span>MediCore · Espace clinique</span>
          <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3" aria-hidden="true" /> Aide à la décision</span>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
