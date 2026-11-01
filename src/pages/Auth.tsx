import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Activity, ArrowLeft, ArrowRight, HeartPulse, BookOpen, Users, ShieldCheck } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Email invalide');
const passwordSchema = z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères');

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading } = useAuth();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erreur de validation',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Erreur de connexion',
        description: error.message === 'Invalid login credentials' 
          ? 'Email ou mot de passe incorrect' 
          : error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erreur de validation',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    if (!firstName || !lastName) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const { error } = await signUp(signupEmail, signupPassword, {
      first_name: firstName,
      last_name: lastName,
    });
    setIsSubmitting(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          title: 'Compte existant',
          description: 'Un compte existe déjà avec cet email. Veuillez vous connecter.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erreur d\'inscription',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Inscription réussie',
        description: 'Bienvenue sur Médicore !',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true" aria-label="Vérification de la session">
        <Activity className="h-7 w-7 animate-pulse text-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(360px,44%)_1fr]">
      <aside className="relative hidden min-h-screen flex-col overflow-hidden bg-[#123c45] px-12 py-11 text-white lg:flex" aria-label="Présentation de MediCore">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#3c958c]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-12 h-80 w-80 rounded-full bg-[#0b222d]/70 blur-3xl" />
        <Link to="/" className="relative flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><HeartPulse className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">MediCore</span>
        </Link>
        <div className="relative mt-auto max-w-lg pb-6">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-[#d9f7f1]">Espace de travail clinique</span>
          <h1 className="mt-7 text-[clamp(2.6rem,4vw,4rem)] font-bold leading-[1.08] tracking-tight text-white">
            L'information médicale, <span className="text-[#a6e3d9]">au bon endroit.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[#d1e3e5]">
            Des dossiers patients aux analyses croisées, retrouvez un parcours clair et des données accessibles selon vos autorisations.
          </p>
          <div className="mt-12 space-y-5 border-t border-white/20 pt-8">
            <div className="flex items-center gap-3 text-sm text-[#d6e7e8]"><Users className="h-5 w-5 text-[#a6e3d9]" /> Dossiers patients et suivi clinique</div>
            <div className="flex items-center gap-3 text-sm text-[#d6e7e8]"><BookOpen className="h-5 w-5 text-[#a6e3d9]" /> Index médical et recherche</div>
            <div className="flex items-center gap-3 text-sm text-[#d6e7e8]"><ShieldCheck className="h-5 w-5 text-[#a6e3d9]" /> Accès soumis aux droits de chaque utilisateur</div>
          </div>
        </div>
        <p className="relative text-xs text-[#a9c4c8]">MediCore · Aide à l'analyse et à la décision médicale</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10 lg:px-14">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ArrowLeft className="h-4 w-4" /> Accueil
            </Link>
            <span className="text-xs text-muted-foreground lg:hidden">MediCore</span>
          </div>
          <div className="mb-8">
            <p className="clinical-eyebrow">Espace professionnel</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Accéder à MediCore</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Connectez-vous pour accéder à votre espace clinique.</p>
          </div>

          <Card className="border-border/80 shadow-[0_12px_50px_-24px_rgba(23,49,61,0.25)]">
            <Tabs defaultValue="login">
              <CardHeader className="pb-0">
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted/80">
                  <TabsTrigger value="login" className="rounded-lg">Connexion</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg">Créer un compte</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent className="pb-6 pt-6">
                <TabsContent value="login" className="mt-0">
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Adresse e-mail</Label>
                      <Input id="login-email" type="email" autoComplete="username" placeholder="nom@etablissement.ch"
                        value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Mot de passe</Label>
                      <Input id="login-password" type="password" autoComplete="current-password"
                        value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required className="h-11" />
                    </div>
                    <Button type="submit" className="h-11 w-full gap-2" disabled={isSubmitting}>
                      {isSubmitting ? 'Connexion en cours…' : 'Se connecter'}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup" className="mt-0">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">Prénom</Label>
                        <Input id="firstName" autoComplete="given-name" value={firstName}
                          onChange={(e) => setFirstName(e.target.value)} required className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Nom</Label>
                        <Input id="lastName" autoComplete="family-name" value={lastName}
                          onChange={(e) => setLastName(e.target.value)} required className="h-11" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">E-mail professionnel</Label>
                      <Input id="signup-email" type="email" autoComplete="email" placeholder="nom@etablissement.ch"
                        value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Mot de passe</Label>
                      <Input id="signup-password" type="password" autoComplete="new-password" minLength={6}
                        value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className="h-11" />
                      <p className="text-xs text-muted-foreground">Au moins 6 caractères.</p>
                    </div>
                    <p className="rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
                      Les droits médecin, chercheur et administrateur sont attribués après vérification par un administrateur habilité.
                    </p>
                    <Button type="submit" className="h-11 w-full gap-2" disabled={isSubmitting}>
                      {isSubmitting ? 'Inscription en cours…' : 'Créer mon compte'}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </form>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
          <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">L'accès aux dossiers dépend des autorisations accordées à votre compte. Ne partagez jamais vos identifiants.</p>
        </div>
      </main>
    </div>
  );
};

export default Auth;
