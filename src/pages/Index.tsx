import PatientLoginBlock from '@/components/patient/PatientLoginBlock';
import { Activity, Shield, Brain } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-primary flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">MediCore</h1>
              <p className="text-xs text-muted-foreground">Système Médical Avancé</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            <div className="flex items-center gap-1">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>Sécurisé</span>
            </div>
            <div className="flex items-center gap-1">
              <Brain className="w-4 h-4 text-cyan-400" />
              <span>IA Activée</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              Portail <span className="text-cyan-400">Patient</span>
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Accédez au dossier médical complet avec jumeau numérique 3D, 
              alertes de sécurité et prédictions IA.
            </p>
          </div>

          <PatientLoginBlock />

          {/* Features grid */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Jumeau Numérique</h3>
              <p className="text-xs text-muted-foreground">
                Visualisation 3D avec 4 calques anatomiques interactifs
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Alertes Temps Réel</h3>
              <p className="text-xs text-muted-foreground">
                Détection automatique des contre-indications et interactions
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-white mb-1">Prédictions IA</h3>
              <p className="text-xs text-muted-foreground">
                Analyse prédictive des risques à 3 mois avec confiance IA
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-slate-800 text-center">
        <p className="text-xs text-muted-foreground">
          © 2024 MediCore - Système de gestion médicale avancée
        </p>
      </footer>
    </div>
  );
};

export default Index;
