import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
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
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  const tools = [
    {
      title: 'Gestion des Patients',
      description: 'Accédez aux dossiers patients complets avec historique médical, résultats biologiques et suivi en temps réel',
      icon: Users,
      link: '/patients',
      color: 'from-cyan-500 to-blue-500',
      stats: `${stats.totalPatients} patients`,
    },
    {
      title: 'Assistant IA Médical',
      description: 'Intelligence artificielle conversationnelle pour l\'analyse des dossiers et recommandations personnalisées',
      icon: Brain,
      link: '/patients',
      color: 'from-blue-500 to-indigo-500',
      stats: `${stats.aiAnalyses} analyses`,
    },
    {
      title: 'Analyse Prédictive',
      description: 'Détection automatique des risques, interactions médicamenteuses et recommandations triées par urgence',
      icon: TrendingUp,
      link: '/patients',
      color: 'from-indigo-500 to-purple-500',
      stats: `${stats.criticalAlerts} alertes critiques`,
    },
    {
      title: 'Jumeau Numérique 3D',
      description: 'Visualisation anatomique interactive en 3D avec marqueurs d\'alertes sur les organes affectés',
      icon: Activity,
      link: '/patients',
      color: 'from-purple-500 to-pink-500',
      stats: 'Modèle 3D interactif',
    },
    {
      title: 'Graphiques de Santé',
      description: 'Évolution de l\'IMC, poids, glycémie, tension artérielle et timeline des périodes de maladies',
      icon: BarChart3,
      link: '/patients',
      color: 'from-pink-500 to-rose-500',
      stats: '5 types de graphiques',
    },
    {
      title: 'Analyse Croisée Mondiale',
      description: 'Comparaison avec 10,000+ pathologies, 1,800+ symptômes et 6,700+ médicaments de la base mondiale',
      icon: Sparkles,
      link: '/patients',
      color: 'from-rose-500 to-orange-500',
      stats: '19,000+ références',
    },
    {
      title: 'Matrice Pharmacologique',
      description: 'Détection des interactions médicamenteuses, contre-indications et effets secondaires',
      icon: Heart,
      link: '/patients',
      color: 'from-orange-500 to-amber-500',
      stats: 'Sécurité maximale',
    },
    {
      title: 'Surveillance Active',
      description: 'Monitoring en temps réel des constantes vitales et alertes automatiques en cas d\'anomalie',
      icon: Stethoscope,
      link: '/patients',
      color: 'from-amber-500 to-cyan-500',
      stats: `${stats.activeMonitoring} patients surveillés`,
    },
  ];

  return (
    <AppLayout>
      {/* Parallax Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50"
          style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        />
        <div
          className="absolute top-0 left-0 w-full h-full opacity-30"
          style={{ transform: `translateY(${scrollY * 0.3}px)` }}
        >
          <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
          <div className="absolute top-40 right-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
        </div>
      </div>

      <div className="space-y-8 pb-12">
        {/* Hero Section with Glassmorphism */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 backdrop-blur-xl border border-white/20 shadow-2xl">
          <div className="absolute inset-0 bg-white/5" />
          <div className="relative p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
                  <Sparkles className="h-4 w-4 text-cyan-600" />
                  <span className="text-sm font-medium text-cyan-900">MediMind Nexus</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {getGreeting()}, {user?.user_metadata?.first_name || 'Docteur'}
                </h1>
                <p className="text-lg text-slate-600 max-w-2xl">
                  Plateforme médicale intelligente avec IA, visualisation 3D et analyse prédictive
                </p>
              </div>
              <div className="flex gap-3">
                <Link to="/patients">
                  <Button size="lg" className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/50">
                    <Users className="h-5 w-5" />
                    Patients
                  </Button>
                </Link>
                <Link to="/pathologies">
                  <Button size="lg" variant="outline" className="gap-2 border-2 border-cyan-200 hover:bg-cyan-50">
                    <FileText className="h-5 w-5" />
                    Index
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards with Glassmorphism */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'cyan' },
            { label: 'Alertes Critiques', value: stats.criticalAlerts, icon: Activity, color: 'blue' },
            { label: 'Analyses IA', value: stats.aiAnalyses, icon: Brain, color: 'indigo' },
            { label: 'Surveillance Active', value: stats.activeMonitoring, icon: Stethoscope, color: 'purple' },
          ].map((stat, idx) => (
            <div
              key={idx}
              className="group relative overflow-hidden rounded-2xl bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br from-${stat.color}-400/20 to-${stat.color}-500/20`}>
                    <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tools Grid */}
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Outils Disponibles</h2>
            <p className="text-slate-600">Explorez toutes les fonctionnalités de la plateforme</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((tool, idx) => (
              <Link key={idx} to={tool.link}>
                <div className="group h-full relative overflow-hidden rounded-2xl bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
                  {/* Gradient Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${tool.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

                  {/* Content */}
                  <div className="relative p-6 h-full flex flex-col">
                    {/* Icon */}
                    <div className={`mb-4 p-3 rounded-xl bg-gradient-to-br ${tool.color} w-fit`}>
                      <tool.icon className="h-6 w-6 text-white" />
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-cyan-600 transition-colors">
                      {tool.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-slate-600 mb-4 flex-1 line-clamp-3">
                      {tool.description}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/50">
                      <span className="text-xs font-medium text-slate-500">{tool.stats}</span>
                      <ArrowRight className="h-4 w-4 text-cyan-500 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 backdrop-blur-xl border border-white/20 shadow-xl p-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Actions Rapides</h2>
          <div className="grid gap-4 md:grid-cols-3">
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
    </AppLayout>
  );
};

export default Dashboard;
