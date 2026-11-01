import { Link } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-14">
      <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-8 text-center shadow-sm sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileQuestion className="h-7 w-7" /></div>
        <p className="clinical-eyebrow mt-6">Page introuvable</p>
        <h1 className="mt-2 text-2xl font-bold">Cette page n’existe pas</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">L’adresse demandée n’est pas disponible. Revenez à votre espace clinique pour poursuivre.</p>
        <Button asChild className="mt-7 gap-2"><Link to="/"><ArrowLeft className="h-4 w-4" /> Retour à l’accueil</Link></Button>
      </div>
    </main>
  );
};

export default NotFound;
