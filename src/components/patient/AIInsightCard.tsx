import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Sparkles } from 'lucide-react';

interface AIInsightCardProps {
  notes: string;
}

// Medical keywords to extract from notes
const medicalKeywords = [
  { term: 'vertige', category: 'neurologique', severity: 'warning' },
  { term: 'vertiges', category: 'neurologique', severity: 'warning' },
  { term: 'bourdonnement', category: 'neurologique', severity: 'warning' },
  { term: 'fatigue', category: 'général', severity: 'info' },
  { term: 'neuropathie', category: 'neurologique', severity: 'warning' },
  { term: 'hypoglycémie', category: 'métabolique', severity: 'danger' },
  { term: 'toux', category: 'respiratoire', severity: 'info' },
  { term: 'toux sèche', category: 'respiratoire', severity: 'warning' },
  { term: 'asthme', category: 'respiratoire', severity: 'warning' },
  { term: 'hypertension', category: 'cardiovasculaire', severity: 'warning' },
  { term: 'diabète', category: 'métabolique', severity: 'warning' },
  { term: 'résistance', category: 'traitement', severity: 'danger' },
  { term: 'effet secondaire', category: 'traitement', severity: 'danger' },
  { term: 'prise de poids', category: 'métabolique', severity: 'info' },
  { term: 'œdème', category: 'cardiovasculaire', severity: 'warning' },
  { term: 'dysfonction', category: 'général', severity: 'warning' },
  { term: 'non contrôlé', category: 'traitement', severity: 'danger' },
  { term: 'mal contrôlé', category: 'traitement', severity: 'danger' },
  { term: 'insuffisant', category: 'traitement', severity: 'warning' },
  { term: 'instable', category: 'traitement', severity: 'warning' },
];

const AIInsightCard = ({ notes }: AIInsightCardProps) => {
  const extractedKeywords = useMemo(() => {
    const lowerNotes = notes.toLowerCase();
    const found: Array<{ term: string; category: string; severity: string }> = [];
    
    medicalKeywords.forEach(keyword => {
      if (lowerNotes.includes(keyword.term.toLowerCase())) {
        // Avoid duplicates
        if (!found.some(f => f.term === keyword.term)) {
          found.push(keyword);
        }
      }
    });

    return found;
  }, [notes]);

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'danger':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-primary/20 text-primary border-primary/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'neurologique': return '🧠';
      case 'cardiovasculaire': return '❤️';
      case 'respiratoire': return '🫁';
      case 'métabolique': return '⚡';
      case 'traitement': return '💊';
      default: return '📋';
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          AI Insight
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        </CardTitle>
        <CardDescription>
          Extraction automatique des symptômes et mots-clés médicaux
        </CardDescription>
      </CardHeader>
      <CardContent>
        {extractedKeywords.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {extractedKeywords.map((keyword, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className={`${getSeverityStyle(keyword.severity)} gap-1`}
                >
                  <span>{getCategoryIcon(keyword.category)}</span>
                  {keyword.term}
                </Badge>
              ))}
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p>📊 <strong>{extractedKeywords.length}</strong> terme(s) médical(aux) détecté(s)</p>
              {extractedKeywords.filter(k => k.severity === 'danger').length > 0 && (
                <p className="text-destructive">
                  ⚠️ {extractedKeywords.filter(k => k.severity === 'danger').length} alerte(s) critique(s)
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Aucun symptôme significatif détecté dans les notes.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AIInsightCard;
