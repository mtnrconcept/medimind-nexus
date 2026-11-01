import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, HeartPulse, Search, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PatientLoginBlock from '@/components/patient/PatientLoginBlock';

const pathways = [
  { icon: Users, title: 'Consulter un dossier', description: 'Accéder au suivi clinique d’un patient autorisé.' },
  { icon: BookOpen, title: 'Explorer les pathologies', description: 'Parcourir le référentiel et les informations médicales.' },
  { icon: Search, title: 'Comparer et rechercher', description: 'Retrouver des données communes et des pistes d’analyse.' },
];

const Index = () => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border/70 bg-card">
      <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="MediCore — Accueil">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><HeartPulse className="h-5 w-5" /></span>
          <span><strong className="block text-[17px] font-bold leading-none tracking-tight">MediCore</strong><span className="mt-1 block text-[11px] text-muted-foreground">Plateforme clinique</span></span>
        </Link>
        <Button asChild className="h-10 gap-2"><Link to="/auth">Espace professionnel <ArrowRight className="h-4 w-4" /></Link></Button>
      </div>
    </header>
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <div className="space-y-6">
          <p className="clinical-eyebrow">Le bon parcours, au bon moment</p>
          <h1 className="max-w-2xl text-[clamp(2.5rem,5vw,4.4rem)] font-bold leading-[1.08] tracking-tight">
            Des dossiers médicaux <span className="text-primary">plus faciles à explorer.</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Un espace de travail pour consulter les informations patients, retrouver les pathologies et analyser les données accessibles selon les droits de chacun.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2"><Link to="/auth">Accéder à l’application <ArrowRight className="h-4 w-4" /></Link></Button>
            <span className="flex items-center gap-2 px-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Accès avec autorisation individuelle</span>
          </div>
          <div className="grid gap-3 border-t border-border pt-7 sm:grid-cols-3">
            {pathways.map(({ icon: Icon, title, description }) => (
              <div key={title} className="space-y-2 rounded-2xl border border-border/70 bg-card/70 p-4">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-sm font-bold tracking-tight">{title}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-5 -z-10 rounded-[40px] bg-gradient-to-br from-primary/[0.09] via-secondary/50 to-transparent" />
          <PatientLoginBlock />
        </div>
      </section>
      <section className="border-t border-border/70 bg-card/80 px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> MediCore · Gestion et analyse de données médicales</span>
          <span className="text-xs">Les résultats d’aide à la décision nécessitent une validation clinique.</span>
        </div>
      </section>
    </main>
  </div>
);

export default Index;
