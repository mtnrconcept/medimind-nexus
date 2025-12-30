import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  Users,
  Brain,
  Activity,
  TrendingUp,
  Stethoscope,
  Heart,
  FileText,
  BarChart3,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface Stats {
  totalPatients: number;
  criticalAlerts: number;
  aiAnalyses: number;
  activeMonitoring: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { t } = useAutoTranslation();
  const { theme } = useTheme();
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    criticalAlerts: 0,
    aiAnalyses: 0,
    activeMonitoring: 0,
  });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { count } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalPatients: count || 0,
        criticalAlerts: 12,
        aiAnalyses: 847,
        activeMonitoring: 34,
      });
    };
    fetchStats();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Bonjour');
    if (hour < 18) return t('Bon après-midi');
    return t('Bonsoir');
  };

  const tools = [
    {
      title: t('Index des Pathologies'),
      description: t('Consultez la base de données complète des pathologies avec leurs symptômes, traitements et protocoles'),
      icon: FileText,
      link: '/pathologies',
      color: 'from-cyan-500 to-blue-500',
      stats: t('10,000+ pathologies'),
    },
    {
      title: t('Recherche par Symptômes'),
      description: t('Identifiez les pathologies potentielles à partir d\'une liste de symptômes observés'),
      icon: Stethoscope,
      link: '/search',
      color: 'from-blue-500 to-indigo-500',
      stats: t('1,800+ symptômes'),
    },
    {
      title: t('Analyse Croisée des Données'),
      description: t('Croisez les données de plusieurs patients pour identifier des patterns et corrélations'),
      icon: BarChart3,
      link: '/cross-data-analysis',
      color: 'from-indigo-500 to-purple-500',
      stats: t('Analyse comparative'),
    },
    {
      title: t('Analyse IA Live'),
      description: t('Intelligence artificielle en temps réel pour l\'analyse des données médicales'),
      icon: Brain,
      link: '/continuous-discovery?tab=analyze',
      color: 'from-purple-500 to-pink-500',
      stats: t('IA conversationnelle'),
    },
    {
      title: t('Découvertes'),
      description: t('Explorez les dernières découvertes médicales et liens sémantiques entre pathologies'),
      icon: Sparkles,
      link: '/continuous-discovery?tab=feed',
      color: 'from-pink-500 to-rose-500',
      stats: t('Exploration continue'),
    },
    {
      title: t('Outils Cliniques'),
      description: t('Suite d\'outils cliniques: calculateurs, scores, interactions médicamenteuses'),
      icon: Heart,
      link: '/continuous-discovery?tab=tools',
      color: 'from-rose-500 to-orange-500',
      stats: t('Outils intégrés'),
    },
    {
      title: t('Moteur de Découverte'),
      description: t('Moteur IA pour découvrir de nouvelles connexions médicales et hypothèses'),
      icon: TrendingUp,
      link: '/continuous-discovery?tab=discovery',
      color: 'from-orange-500 to-amber-500',
      stats: t('Génération de connexions'),
    },
    {
      title: t('Radial 3D'),
      description: t('Visualisation 3D interactive des relations entre pathologies, symptômes et traitements'),
      icon: Activity,
      link: '/continuous-discovery?tab=radial',
      color: 'from-amber-500 to-cyan-500',
      stats: t('Graphe sémantique'),
    },
    {
      title: t('Analyse Systématique'),
      description: t('Analyse systématique approfondie avec génération de rapports cliniques complets'),
      icon: Users,
      link: '/continuous-discovery?tab=systematic',
      color: 'from-teal-500 to-cyan-500',
      stats: t('Rapports IA'),
    },
  ];

  return (
    <AppLayout>
      {/* Parallax Background - Theme Aware */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div
          className={cn(
            "absolute inset-0",
            theme === 'dark'
              ? "bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#1e1b4b]"
              : "bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50"
          )}
          style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        />
        <div
          className="absolute top-0 left-0 w-full h-full opacity-30"
          style={{ transform: `translateY(${scrollY * 0.3}px)` }}
        >
          <div className={cn(
            "absolute top-20 left-10 w-72 h-72 rounded-full filter blur-3xl animate-blob",
            theme === 'dark' ? "bg-cyan-500/20" : "bg-cyan-400 mix-blend-multiply opacity-20"
          )} />
          <div className={cn(
            "absolute top-40 right-10 w-72 h-72 rounded-full filter blur-3xl animate-blob animation-delay-2000",
            theme === 'dark' ? "bg-purple-500/20" : "bg-blue-400 mix-blend-multiply opacity-20"
          )} />
          <div className={cn(
            "absolute -bottom-8 left-1/2 w-72 h-72 rounded-full filter blur-3xl animate-blob animation-delay-4000",
            theme === 'dark' ? "bg-indigo-500/20" : "bg-indigo-400 mix-blend-multiply opacity-20"
          )} />
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-8 md:pb-12 px-2 sm:px-0">
        {/* Hero Section with Glassmorphism */}
        <div className={cn(
          "relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl backdrop-blur-xl border shadow-2xl",
          theme === 'dark'
            ? "bg-[#0f172a]/80 border-white/10"
            : "bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border-white/20"
        )}>
          <div className={cn(
            "absolute inset-0",
            theme === 'dark' ? "bg-gradient-to-br from-cyan-500/5 to-purple-500/5" : "bg-white/5"
          )} />
          <div className="relative p-4 sm:p-6 md:p-8 lg:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-4">
                <div className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm border",
                  theme === 'dark'
                    ? "bg-cyan-500/10 border-cyan-500/30"
                    : "bg-white/20 border-white/30"
                )}>
                  <Sparkles className={cn("h-4 w-4", theme === 'dark' ? "text-cyan-400" : "text-cyan-600")} />
                  <span className={cn("text-sm font-medium", theme === 'dark' ? "text-cyan-300" : "text-cyan-900")}>MediMind Nexus</span>
                </div>
                <h1 className={cn(
                  "text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-clip-text text-transparent",
                  theme === 'dark'
                    ? "bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400"
                    : "bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600"
                )}>
                  {getGreeting()}, {user?.user_metadata?.first_name || 'Docteur'}
                </h1>
                <p className={cn(
                  "text-sm sm:text-base md:text-lg max-w-2xl",
                  theme === 'dark' ? "text-slate-400" : "text-slate-600"
                )}>
                  {t('Plateforme médicale intelligente avec IA, visualisation 3D et analyse prédictive')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <Link to="/patients">
                  <Button size="default" className="gap-1.5 sm:gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/50 touch-manipulation text-sm sm:text-base">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                    Patients
                  </Button>
                </Link>
                <Link to="/pathologies">
                  <Button size="default" variant="outline" className="gap-1.5 sm:gap-2 border-2 border-cyan-200 hover:bg-cyan-50 touch-manipulation text-sm sm:text-base">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                    Index
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards with Glassmorphism */}
        <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'cyan' },
            { label: 'Alertes Critiques', value: stats.criticalAlerts, icon: Activity, color: 'blue' },
            { label: 'Analyses IA', value: stats.aiAnalyses, icon: Brain, color: 'indigo' },
            { label: 'Surveillance Active', value: stats.activeMonitoring, icon: Stethoscope, color: 'purple' },
          ].map((stat, idx) => (
            <div
              key={idx}
              className={cn(
                "group relative overflow-hidden rounded-2xl backdrop-blur-xl border shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1",
                theme === 'dark'
                  ? "bg-[#0f172a]/80 border-white/10"
                  : "bg-white/40 border-white/20"
              )}
            >
              <div className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity",
                theme === 'dark' ? "bg-gradient-to-br from-cyan-500/10 to-purple-500/10" : "bg-gradient-to-br from-white/50 to-transparent"
              )} />
              <div className="relative p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br from-${stat.color}-400/20 to-${stat.color}-500/20`}>
                    <stat.icon className={`h-6 w-6 text-${stat.color}-${theme === 'dark' ? '400' : '600'}`} />
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <div className="space-y-1">
                  <p className={cn("text-sm font-medium", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>{stat.label}</p>
                  <p className={cn(
                    "text-3xl font-bold bg-clip-text text-transparent",
                    theme === 'dark'
                      ? "bg-gradient-to-r from-cyan-400 to-blue-400"
                      : "bg-gradient-to-r from-cyan-600 to-blue-600"
                  )}>
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tools Grid */}
        <div>
          <div className="mb-4 sm:mb-6">
            <h2 className={cn("text-xl sm:text-2xl font-bold mb-1 sm:mb-2", theme === 'dark' ? "text-white" : "text-slate-800")}>Outils Disponibles</h2>
            <p className={cn("text-sm sm:text-base", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>Explorez toutes les fonctionnalités de la plateforme</p>
          </div>

          <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((tool, idx) => (
              <Link key={idx} to={tool.link}>
                <div className={cn(
                  "group h-full relative overflow-hidden rounded-2xl backdrop-blur-xl border shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2",
                  theme === 'dark'
                    ? "bg-[#0f172a]/80 border-white/10"
                    : "bg-white/40 border-white/20"
                )}>
                  {/* Gradient Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${tool.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

                  {/* Content */}
                  <div className="relative p-6 h-full flex flex-col">
                    {/* Icon */}
                    <div className={`mb-4 p-3 rounded-xl bg-gradient-to-br ${tool.color} w-fit`}>
                      <tool.icon className="h-6 w-6 text-white" />
                    </div>

                    {/* Title */}
                    <h3 className={cn(
                      "text-lg font-bold mb-2 transition-colors",
                      theme === 'dark' ? "text-white group-hover:text-cyan-400" : "text-slate-800 group-hover:text-cyan-600"
                    )}>
                      {tool.title}
                    </h3>

                    {/* Description */}
                    <p className={cn("text-sm mb-4 flex-1 line-clamp-3", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
                      {tool.description}
                    </p>

                    {/* Stats */}
                    <div className={cn(
                      "flex items-center justify-between pt-4 border-t",
                      theme === 'dark' ? "border-slate-700/50" : "border-slate-200/50"
                    )}>
                      <span className={cn("text-xs font-medium", theme === 'dark' ? "text-slate-500" : "text-slate-500")}>{tool.stats}</span>
                      <ArrowRight className="h-4 w-4 text-cyan-500 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={cn(
          "rounded-xl sm:rounded-2xl backdrop-blur-xl border shadow-xl p-4 sm:p-6 md:p-8",
          theme === 'dark'
            ? "bg-[#0f172a]/80 border-white/10"
            : "bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border-white/20"
        )}>
          <h2 className={cn("text-xl sm:text-2xl font-bold mb-4 sm:mb-6", theme === 'dark' ? "text-white" : "text-slate-800")}>Actions Rapides</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
            <Link to="/patients">
              <div className="group p-6 rounded-xl bg-white/50 backdrop-blur-sm border border-white/30 hover:bg-white/70 transition-all cursor-pointer">
                <Users className="h-8 w-8 text-cyan-600 mb-3" />
                <h3 className="font-semibold text-slate-800 mb-1">Nouveau Patient</h3>
                <p className="text-sm text-slate-600">Créer un dossier patient</p>
              </div>
            </Link>
            <Link to="/patients">
              <div className="group p-6 rounded-xl bg-white/50 backdrop-blur-sm border border-white/30 hover:bg-white/70 transition-all cursor-pointer">
                <Brain className="h-8 w-8 text-blue-600 mb-3" />
                <h3 className="font-semibold text-slate-800 mb-1">Analyse IA</h3>
                <p className="text-sm text-slate-600">Lancer une analyse</p>
              </div>
            </Link>
            <Link to="/pathologies">
              <div className="group p-6 rounded-xl bg-white/50 backdrop-blur-sm border border-white/30 hover:bg-white/70 transition-all cursor-pointer">
                <FileText className="h-8 w-8 text-indigo-600 mb-3" />
                <h3 className="font-semibold text-slate-800 mb-1">Base de Connaissances</h3>
                <p className="text-sm text-slate-600">Consulter l'index</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </AppLayout >
  );
};

export default Dashboard;
