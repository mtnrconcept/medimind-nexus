import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, ArrowRight, AlertCircle, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { preparePatientLookup } from '@/components/auth/access-policy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PatientLoginBlock = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [patientId, setPatientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const identifier = preparePatientLookup(user?.id ?? null, patientId);
    if (!identifier) {
      setError('Connexion professionnelle et identifiant patient valide requis.');
      return;
    }
    setIsLoading(true);
    try {
      // The authenticated user's explicit grants are checked by patients RLS.
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_id', identifier)
        .maybeSingle();
      if (dbError) throw dbError;
      if (!data) {
        setError('Dossier introuvable ou accès non autorisé.');
        return;
      }
      toast.success('Dossier autorisé');
      navigate(`/patients/${data.id}`);
    } catch (cause) {
      console.error('Patient lookup failed:', cause);
      setError('Recherche impossible. Vérifiez votre connexion et vos droits.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-card/80 border-primary/30 backdrop-blur-sm">
      <CardHeader className="text-center pb-2">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center border border-primary/30">
          <User className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-xl text-primary">Accès sécurisé aux dossiers</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Identifiez-vous avec votre compte professionnel. Chaque dossier est soumis à des autorisations explicites.
        </p>
      </CardHeader>
      <CardContent>
        {!user ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LockKeyhole className="w-4 h-4 flex-shrink-0" />
              {loading ? 'Vérification de la session…' : 'Connexion Supabase Auth requise avant la recherche.'}
            </p>
            <Button onClick={() => navigate('/auth')} disabled={loading} className="w-full">
              Se connecter <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patientId">Identifiant patient autorisé</Label>
              <Input
                id="patientId" type="text" placeholder="Ex. PAT-001"
                value={patientId} onChange={(event) => setPatientId(event.target.value)}
                maxLength={80} autoComplete="off" required
              />
            </div>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isLoading || !patientId.trim()}>
              {isLoading ? 'Recherche…' : 'Ouvrir le dossier autorisé'}
              {!isLoading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>
        )}
        <p className="mt-4 pt-4 border-t border-border text-xs text-center text-muted-foreground">
          Aucune modification de traitement sans validation médicale.
        </p>
      </CardContent>
    </Card>
  );
};

export default PatientLoginBlock;
