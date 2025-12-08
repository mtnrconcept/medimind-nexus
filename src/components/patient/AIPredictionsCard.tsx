import { useState, useEffect, useMemo } from 'react';
import { Brain, TrendingUp, AlertTriangle, Activity, Pill, Dumbbell, Apple, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PatientAlert, ExtendedLabResults } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AIPredictionsCardProps {
  alerts: PatientAlert[];
  labResults: ExtendedLabResults;
  pathologyName?: string;
  age: number;
  patientId: string;
  gender?: string;
  treatment?: string;
  medicalNotes?: string;
}

interface AIRecommendation {
  type: 'urgent' | 'important' | 'routine';
  category: 'medication' | 'exercise' | 'nutrition' | 'monitoring' | 'lifestyle';
  title: string;
  description: string;
  urgency: number; // 1-10, 10 being most urgent
}

interface AIAnalysis {
  summary: string;
  recommendations: AIRecommendation[];
  riskScore: number;
  keyFindings: string[];
}

const AIPredictionsCard = ({
  alerts,
  labResults,
  pathologyName,
  age,
  patientId,
  gender,
  treatment,
  medicalNotes
}: AIPredictionsCardProps) => {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stabilize dependencies to avoid infinite loop
  const labResultsKey = useMemo(() => JSON.stringify(labResults), [labResults]);
  const alertsKey = useMemo(() => JSON.stringify(alerts), [alerts]);

  useEffect(() => {
    const fetchAIAnalysis = async () => {
      setIsLoading(true);
      setError(null);

      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        // Generate analysis based on patient data
        const recommendations: AIRecommendation[] = [];
        let riskScore = 30;
        const keyFindings: string[] = [];

        // ANALYZE PATHOLOGIES FIRST
        const pathologyLower = pathologyName?.toLowerCase() || '';
        const hasPathology = pathologyName && pathologyName !== 'Non spécifiée';

        if (hasPathology) {
          keyFindings.push(`Pathologie identifiée: ${pathologyName}`);

          // Diabetes
          if (pathologyLower.includes('diabète') || pathologyLower.includes('diabetes')) {
            riskScore += 15;

            // Check for complications
            if (labResults.gfr_ml_min && labResults.gfr_ml_min < 60) {
              keyFindings.push('Risque de néphropathie diabétique');
            }

            recommendations.push({
              type: 'important',
              category: 'monitoring',
              title: 'Surveillance diabète',
              description: 'Contrôle HbA1c tous les 3 mois, fond d\'œil annuel, examen des pieds régulier. Surveillance de la fonction rénale et du bilan lipidique.',
              urgency: 7
            });
          }

          // Hypertension
          if (pathologyLower.includes('hypertension') || pathologyLower.includes('hta')) {
            riskScore += 10;
            recommendations.push({
              type: 'important',
              category: 'lifestyle',
              title: 'Gestion de l\'HTA',
              description: 'Auto-mesure tensionnelle régulière, réduction du sel (<6g/jour), activité physique régulière, gestion du stress.',
              urgency: 7
            });
          }

          // Gout
          if (pathologyLower.includes('goutte') || pathologyLower.includes('gout')) {
            riskScore += 5;
            recommendations.push({
              type: 'routine',
              category: 'nutrition',
              title: 'Prévention des crises de goutte',
              description: 'Limiter les aliments riches en purines (abats, fruits de mer, viande rouge). Éviter l\'alcool, surtout la bière. Boire 2L d\'eau par jour. Maintenir un poids santé.',
              urgency: 6
            });
          }

          // Renal insufficiency
          if (pathologyLower.includes('rénale') || pathologyLower.includes('renal')) {
            riskScore += 20;
            keyFindings.push('Insuffisance rénale - Adaptation médicamenteuse nécessaire');
            recommendations.push({
              type: 'urgent',
              category: 'medication',
              title: 'Adaptation des doses en insuffisance rénale',
              description: 'Vérifier la posologie de tous les médicaments. Éviter les AINS, certains antibiotiques et produits de contraste iodés. Surveillance rénale rapprochée.',
              urgency: 9
            });
          }
        }

        // Analyze blood pressure
        if (labResults.blood_pressure_sys > 140) {
          riskScore += 20;
          keyFindings.push(`Hypertension artérielle non contrôlée (${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia} mmHg)`);
          recommendations.push({
            type: 'urgent',
            category: 'medication',
            title: 'Ajustement du traitement antihypertenseur',
            description: `La tension artérielle actuelle (${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia} mmHg) nécessite une optimisation du traitement. Envisager une augmentation de dose ou l'ajout d'un second antihypertenseur.`,
            urgency: 9
          });
          recommendations.push({
            type: 'important',
            category: 'lifestyle',
            title: 'Réduction du sel et de l alcool',
            description: 'Limiter la consommation de sel à moins de 6g par jour et réduire l alcool à maximum 2 verres par jour pour améliorer le contrôle tensionnel.',
            urgency: 7
          });
        }


        // Analyze glucose - HYPOGLYCEMIA FIRST (CRITICAL!)
        if (labResults.glucose_mg_dl < 70 && labResults.glucose_mg_dl > 0) {
          riskScore += 35; // Hypoglycémie est plus dangereuse que hyperglycémie
          keyFindings.push(`HYPOGLYCÉMIE CRITIQUE (${labResults.glucose_mg_dl} mg/dL)`);

          recommendations.push({
            type: 'urgent',
            category: 'medication',
            title: 'Ajustement URGENT du traitement hypoglycémiant',
            description: `Glycémie dangereusement basse à ${labResults.glucose_mg_dl} mg/dL (norme: 70-120). ${treatment?.toLowerCase().includes('glibenclamide') ? 'La Glibenclamide est fortement suspectée. Réduire la dose ou remplacer par un antidiabétique à moindre risque hypoglycémique (inhibiteur DPP-4, SGLT2).' : 'Revoir immédiatement le traitement antidiabétique.'}`,
            urgency: 10
          });

          recommendations.push({
            type: 'urgent',
            category: 'monitoring',
            title: 'Resucrage immédiat et surveillance',
            description: 'Resucrage oral immédiat (15g de glucides rapides). Contrôle glycémique toutes les 15 minutes jusqu\'à normalisation. Identifier la cause (saut de repas, dose excessive, exercice).',
            urgency: 10
          });

          recommendations.push({
            type: 'important',
            category: 'nutrition',
            title: 'Prévention des hypoglycémies',
            description: 'Repas réguliers et équilibrés. Toujours avoir du sucre rapide à portée. Éviter les efforts intenses à jeun. Collations si délai entre repas > 4h.',
            urgency: 8
          });

          recommendations.push({
            type: 'important',
            category: 'lifestyle',
            title: 'Éducation thérapeutique renforcée',
            description: 'Apprendre à reconnaître les signes d\'hypoglycémie (tremblements, sueurs, palpitations, confusion). Savoir réagir rapidement. Informer l\'entourage.',
            urgency: 7
          });
        }
        // Hyperglycemia (only if NOT hypoglycemic)
        else if (labResults.glucose_mg_dl > 126) {
          riskScore += 15;
          keyFindings.push(`Glycémie élevée (${labResults.glucose_mg_dl} mg/dL)`);
          recommendations.push({
            type: 'important',
            category: 'medication',
            title: 'Contrôle glycémique',
            description: `Glycémie à ${labResults.glucose_mg_dl} mg/dL. Surveillance HbA1c tous les 3 mois et ajustement du traitement antidiabétique si nécessaire.`,
            urgency: 8
          });
          recommendations.push({
            type: 'important',
            category: 'nutrition',
            title: 'Régime alimentaire adapté',
            description: 'Privilégier les aliments à index glycémique bas, augmenter les fibres, limiter les sucres rapides et les glucides raffinés.',
            urgency: 7
          });
        }


        // Check for treatment side effects
        if (treatment?.toLowerCase().includes('lisinopril') && medicalNotes?.toLowerCase().includes('toux')) {
          riskScore += 10;
          keyFindings.push('Toux sèche probablement liée au traitement par IEC');
          recommendations.push({
            type: 'urgent',
            category: 'medication',
            title: 'Changement de classe thérapeutique',
            description: 'La toux sèche est un effet secondaire fréquent des IEC. Envisager un switch vers un ARA2 (ex: Losartan) qui offre une efficacité similaire sans cet effet indésirable.',
            urgency: 9
          });
        }

        // Renal function
        if (labResults.gfr_ml_min && labResults.gfr_ml_min < 60) {
          riskScore += 25;
          keyFindings.push(`Insuffisance rénale modérée (DFG: ${labResults.gfr_ml_min} mL/min)`);
          recommendations.push({
            type: 'urgent',
            category: 'monitoring',
            title: 'Surveillance rénale renforcée',
            description: `DFG à ${labResults.gfr_ml_min} mL/min. Contrôle mensuel de la créatinine et adaptation des posologies médicamenteuses. Éviter les néphrotoxiques.`,
            urgency: 9
          });
        }

        // General recommendations
        recommendations.push({
          type: 'important',
          category: 'exercise',
          title: 'Activité physique régulière',
          description: 'Pratiquer 30 minutes d activité modérée 5 fois par semaine (marche rapide, vélo, natation) pour améliorer la santé cardiovasculaire et le contrôle glycémique.',
          urgency: 6
        });

        recommendations.push({
          type: 'routine',
          category: 'monitoring',
          title: 'Bilans de surveillance',
          description: 'Bilan sanguin complet tous les 3-6 mois incluant glycémie, HbA1c, fonction rénale, bilan lipidique et ionogramme.',
          urgency: 5
        });

        // Sort by urgency
        recommendations.sort((a, b) => b.urgency - a.urgency);

        // Generate summary
        let summary = `Patient de ${age} ans ${gender === 'M' ? 'masculin' : 'féminin'} avec ${pathologyName || 'pathologie non spécifiée'}. `;

        // Add critical status if hypoglycemia or high risk
        if (labResults.glucose_mg_dl < 70 && labResults.glucose_mg_dl > 0) {
          summary += `⚠️ SITUATION CRITIQUE: Hypoglycémie sévère nécessitant une intervention immédiate. Le patient n'est PAS en bonne santé optimale.`;
        } else if (riskScore >= 70) {
          summary += `État de santé préoccupant nécessitant une attention médicale urgente.`;
        } else if (keyFindings.length > 0) {
          summary += `Points d'attention: ${keyFindings.slice(0, 2).join(', ')}.`;
        } else {
          summary += `Situation clinique stable nécessitant une surveillance régulière.`;
        }


        setAnalysis({
          summary,
          recommendations: recommendations.slice(0, 6), // Limit to 6 recommendations
          riskScore: Math.min(riskScore, 100),
          keyFindings
        });
      } catch (err) {
        console.error('AI Analysis error:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        toast.error('Impossible de charger l analyse IA');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAIAnalysis();
  }, [patientId, age, gender, pathologyName, treatment, medicalNotes, labResultsKey, alertsKey]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'medication': return <Pill className="h-3.5 w-3.5" />;
      case 'exercise': return <Dumbbell className="h-3.5 w-3.5" />;
      case 'nutrition': return <Apple className="h-3.5 w-3.5" />;
      case 'monitoring': return <Activity className="h-3.5 w-3.5" />;
      default: return <TrendingUp className="h-3.5 w-3.5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'urgent': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'important': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      default: return 'bg-primary/10 text-primary border-primary/30';
    }
  };

  const getUrgencyBadge = (urgency: number) => {
    if (urgency >= 8) return { label: 'URGENT', color: 'bg-destructive text-destructive-foreground' };
    if (urgency >= 5) return { label: 'Important', color: 'bg-orange-500 text-white' };
    return { label: 'Routine', color: 'bg-primary text-primary-foreground' };
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary animate-pulse" />
            Analyse IA en cours...
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analyse des données du patient...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !analysis) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-destructive" />
            Erreur d'analyse IA
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-xs text-muted-foreground">{error || 'Impossible de charger l analyse'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Analyse IA Personnalisée
          <span className={cn(
            "ml-auto text-xs px-2 py-0.5 rounded-full font-mono",
            analysis.riskScore >= 70 ? "bg-destructive/20 text-destructive" :
              analysis.riskScore >= 40 ? "bg-orange-500/20 text-orange-500" :
                "bg-green-500/20 text-green-500"
          )}>
            Risque: {analysis.riskScore}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
          <p className="text-xs leading-relaxed">{analysis.summary}</p>
        </div>

        {/* Key Findings */}
        {analysis.keyFindings && analysis.keyFindings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Points clés
            </h4>
            <div className="space-y-1">
              {analysis.keyFindings.map((finding, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <span className="text-primary mt-0.5">•</span>
                  <span className="flex-1">{finding}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Recommandations (triées par urgence)
          </h4>
          <div className="space-y-2">
            {analysis.recommendations.map((rec, idx) => {
              const urgencyBadge = getUrgencyBadge(rec.urgency);
              return (
                <div
                  key={idx}
                  className={cn(
                    "p-2.5 rounded-md border text-xs space-y-1.5",
                    getTypeColor(rec.type)
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      {getCategoryIcon(rec.category)}
                      <span>{rec.title}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                      urgencyBadge.color
                    )}>
                      {urgencyBadge.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90 pl-5">
                    {rec.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIPredictionsCard;
