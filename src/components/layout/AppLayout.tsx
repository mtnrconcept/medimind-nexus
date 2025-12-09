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

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
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
              <SheetContent side="left" className="w-[280px] p-0 bg-card border-border">
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                        <Activity className="h-6 w-6 text-primary-foreground" />
                      </div>
                      <div>
                        <span className="text-lg font-bold">Médicore</span>
                        <p className="text-xs text-muted-foreground">Plateforme Médicale</p>
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

            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold hidden sm:inline">Médicore</span>
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
      <main className="container py-4 md:py-6 px-4 animate-fade-in">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;