import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PatientLoginBlock = () => {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Check password
    if (password !== '1234') {
      setError('Mot de passe incorrect');
      setIsLoading(false);
      return;
    }

    try {
      // Search for patient by patient_id
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_id', patientId.trim())
        .maybeSingle();

      if (dbError) throw dbError;

      if (!data) {
        setError('Patient non trouvé');
        setIsLoading(false);
        return;
      }

      toast.success('Accès autorisé');
      navigate(`/patients/${data.id}`);
    } catch {
      setError('Erreur lors de la recherche');
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
        <CardTitle className="text-xl text-primary font-mono">
          Accès Dossier Patient
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Entrez l'identifiant patient pour accéder au dossier médical complet
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patientId" className="text-muted-foreground">
              Identifiant Patient
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="patientId"
                type="text"
                placeholder="Ex: PAT-001"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="pl-10 bg-secondary border-border focus:border-primary font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-muted-foreground">
              Code d'accès
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-secondary border-border focus:border-primary font-mono"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/30">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !patientId || !password}
            className="w-full font-mono"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Vérification...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                Accéder au dossier
                <ArrowRight className="w-4 h-4" />
              </div>
            )}
          </Button>
        </form>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">
            Accès réservé au personnel médical autorisé
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientLoginBlock;