import { Brain, TrendingUp, AlertTriangle, Eye, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { PatientAlert, ExtendedLabResults } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface AIPredictionsCardProps {
  alerts: PatientAlert[];
  labResults: ExtendedLabResults;
  pathologyName?: string;
  age: number;
}

interface Prediction {
  id: string;
  risk: string;
  confidence: number;
  timeframe: string;
  icon: React.ReactNode;
  severity: 'high' | 'medium' | 'low';
}

interface Surveillance {
  id: string;
  action: string;
  frequency: string;
  priority: 'urgent' | 'important' | 'routine';
}

const AIPredictionsCard = ({ alerts, labResults, pathologyName, age }: AIPredictionsCardProps) => {
  // Generate predictions based on patient data
  const generatePredictions = (): Prediction[] => {
    const predictions: Prediction[] = [];
    
    // Diabetes complications
    if (pathologyName?.toLowerCase().includes('diabète') || labResults.glucose_mg_dl > 180) {
      predictions.push({
        id: 'nephropathy',
        risk: 'Néphropathie diabétique',
        confidence: labResults.gfr_ml_min && labResults.gfr_ml_min < 60 ? 85 : 45,
        timeframe: '6-12 mois',
        icon: <TrendingUp className="h-4 w-4" />,
        severity: labResults.gfr_ml_min && labResults.gfr_ml_min < 60 ? 'high' : 'medium'
      });
      predictions.push({
        id: 'retinopathy',
        risk: 'Rétinopathie diabétique',
        confidence: age > 50 ? 60 : 35,
        timeframe: '12-24 mois',
        icon: <Eye className="h-4 w-4" />,
        severity: 'medium'
      });
    }

    // Cardiovascular risk
    if (labResults.blood_pressure_sys > 140 || alerts.some(a => a.organ === 'heart')) {
      predictions.push({
        id: 'cv-event',
        risk: 'Événement cardiovasculaire',
        confidence: age > 60 ? 70 : 40,
        timeframe: '12 mois',
        icon: <AlertTriangle className="h-4 w-4" />,
        severity: 'high'
      });
    }

    // Renal progression
    if (labResults.gfr_ml_min && labResults.gfr_ml_min < 60) {
      predictions.push({
        id: 'renal-prog',
        risk: 'Progression insuffisance rénale',
        confidence: 75,
        timeframe: '6 mois',
        icon: <TrendingUp className="h-4 w-4" />,
        severity: 'high'
      });
    }

    // Add generic prediction if none
    if (predictions.length === 0) {
      predictions.push({
        id: 'stable',
        risk: 'État stable prévisible',
        confidence: 80,
        timeframe: '3 mois',
        icon: <TrendingUp className="h-4 w-4" />,
        severity: 'low'
      });
    }

    return predictions.slice(0, 4);
  };

  const generateSurveillance = (): Surveillance[] => {
    const items: Surveillance[] = [];

    if (labResults.glucose_mg_dl > 126) {
      items.push({
        id: 'hba1c',
        action: 'Contrôle HbA1c',
        frequency: 'Tous les 3 mois',
        priority: 'important'
      });
    }

    if (labResults.gfr_ml_min && labResults.gfr_ml_min < 60) {
      items.push({
        id: 'creat',
        action: 'Créatinine + Microalbuminurie',
        frequency: 'Mensuel',
        priority: 'urgent'
      });
    }

    if (labResults.potassium_meq_l && labResults.potassium_meq_l > 5) {
      items.push({
        id: 'k',
        action: 'Kaliémie',
        frequency: 'Hebdomadaire',
        priority: 'urgent'
      });
    }

    if (labResults.blood_pressure_sys > 140) {
      items.push({
        id: 'bp',
        action: 'Auto-mesure tensionnelle',
        frequency: 'Quotidien',
        priority: 'important'
      });
    }

    // Default surveillance
    if (items.length === 0) {
      items.push({
        id: 'routine',
        action: 'Bilan sanguin de contrôle',
        frequency: 'Tous les 6 mois',
        priority: 'routine'
      });
    }

    return items;
  };

  const predictions = generatePredictions();
  const surveillanceItems = generateSurveillance();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-destructive';
      case 'medium': return 'text-orange-500';
      default: return 'text-green-500';
    }
  };

  const getProgressColor = (confidence: number) => {
    if (confidence > 70) return 'bg-destructive';
    if (confidence > 50) return 'bg-orange-500';
    return 'bg-primary';
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'important':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      default:
        return 'bg-primary/10 text-primary border-primary/30';
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Prédictions IA - Risques à 3 mois
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Predictions */}
        <div className="space-y-3">
          {predictions.map((pred) => (
            <div key={pred.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={getSeverityColor(pred.severity)}>{pred.icon}</span>
                  <span className="text-xs font-medium">{pred.risk}</span>
                </div>
                <span className="text-xs text-muted-foreground">{pred.timeframe}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all", getProgressColor(pred.confidence))}
                    style={{ width: `${pred.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                  {pred.confidence}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Surveillance */}
        <div className="pt-3 border-t border-border/50">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Points de surveillance
          </h4>
          <div className="space-y-2">
            {surveillanceItems.map((item) => (
              <div 
                key={item.id} 
                className={cn(
                  "flex items-center justify-between text-xs p-2 rounded-md border",
                  getPriorityBadge(item.priority)
                )}
              >
                <span className="font-medium">{item.action}</span>
                <span className="text-[10px]">{item.frequency}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIPredictionsCard;
