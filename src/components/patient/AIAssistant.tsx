import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Send, Loader2, Sparkles, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAI } from '@/contexts/AIContext';
import ExplainabilityPanel, { type ExplainabilityData } from './ExplainabilityPanel';
import type { ExtendedLabResults, PatientAlert } from '@/hooks/usePatientAlerts';

// ============================================
// COMPREHENSIVE PATIENT DATA INTERFACE
// ============================================

interface Pathology {
  id?: string;
  name: string;
  icd_code?: string;
  category?: string;
}

interface Vaccine {
  name: string;
  date?: string;
  dose?: string;
  batchNumber?: string;
}

interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  prescriber?: string;
}

interface Allergy {
  allergen: string;
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe';
}

interface MedicalHistory {
  condition: string;
  date?: string;
  notes?: string;
  resolved?: boolean;
}

/**
 * Comprehensive patient data structure for AI context
 * Includes ALL data visible on the patient detail page
 */
export interface ComprehensivePatient {
  // Identification
  id: string;
  patient_id: string;

  // Profile
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;

  // Demographics
  age: number;
  gender: string;
  nationality?: string;

  // Biometrics
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;

  // Clinical status
  outcome?: string;
  created_at?: string;

  // Pathologies
  pathologies?: Pathology | Pathology[] | null;

  // Treatment
  treatment?: string;

  // Clinical notes
  medical_notes_nlp?: string;

  // Complete lab results
  lab_results_json: ExtendedLabResults;

  // Active alerts
  alerts?: PatientAlert[];

  // Real Database Relations
  medications?: any[];
  vaccinations?: any[];
  allergies?: any[];
  medical_history?: any[];
  consultations?: any[];
  mental_health?: any[];
  reproductive_health?: any[];
  clinical_data?: any[];
  lab_results_data?: any[];

  // Risk score
  risk_score?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  explainability?: ExplainabilityData;
}

interface AIAssistantProps {
  patient: ComprehensivePatient;
}

const suggestedQuestions = [
  "Résume le dossier complet de ce patient",
  "Quelles sont les alertes critiques et pourquoi ?",
  "Le traitement est-il adapté aux résultats biologiques ?",
  "Y a-t-il des interactions médicamenteuses ?",
  "Quels examens complémentaires recommander ?",
];

const AIAssistant = ({ patient }: AIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { llmMode, localLLMConfig } = useAI();
  const [showExplainability, setShowExplainability] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (userMessage: string) => {
    setIsLoading(true);
    const userMsg: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      // Helper to format patient context identically to the Cloud Edge Function
      const formatPatientContext = (ctx: any): string => {
        if (!ctx) return "Aucune donnée patient disponible.";

        const meds = ctx.medications?.map((m: any) => `- ${m.medication_name || m.name} (${m.dosage || ''}, ${m.frequency || ''})`).join('\n') || 'Aucun';
        const history = ctx.medical_history?.map((h: any) => `- ${h.condition_name || h.condition} (${h.diagnosis_date || h.date || ''}): ${h.status || (h.resolved ? 'Résolu' : 'Actif')}`).join('\n') || 'Aucun';
        const allergies = ctx.allergies?.map((a: any) => `- ${a.allergen} (${a.reaction || ''}) - ${a.severity || ''}`).join('\n') || 'Aucune';
        const consults = ctx.consultations?.map((c: any) => `- ${c.consultation_date || ''}: ${c.reason || ''} (${c.physician_name || ''})`).join('\n') || 'Aucune';
        const vaccines = ctx.vaccinations?.map((v: any) => `- ${v.vaccine_name || v.name} (${v.vaccination_date || v.date || ''})`).join('\n') || 'Aucun';

        const clinical = ctx.clinical_data?.map((d: any) => `- ${d.data_name || ''}: ${d.data_value || ''} ${d.unit || ''}`).join('\n') || 'Aucune donnée';
        const labList = ctx.lab_results_list?.map((l: any) => `- ${l.test_name}: ${l.test_value} ${l.unit} (${l.status})`).join('\n') || 'Aucune donnée';

        return `
## 👤 PROFIL PATIENT
- Âge: ${ctx.age} ans | Genre: ${ctx.gender} | Nationalité: ${ctx.nationality || 'N/A'}
- Statut: ${ctx.outcome || 'N/A'}

## 💊 TRAITEMENTS ACTUELS
${meds}

## 🏥 ANTÉCÉDENTS & PATHOLOGIES
${history}

## ⚠️ ALLERGIES
${allergies}

## 🔬 RÉSULTATS BIOLOGIQUES
${labList}

## 🧬 DONNÉES CLINIQUES & CONSTANTES
${clinical}

## 💉 VACCINATIONS
${vaccines}

## 📅 CONSULTATIONS RÉCENTES
${consults}
`;
      };

      const rawContext = {
        prenom: patient.first_name,
        nom: patient.last_name,
        age: patient.age,
        gender: patient.gender === 'M' ? 'Homme' : 'Femme',
        nationality: patient.nationality,
        medications: patient.medications,
        allergies: patient.allergies,
        vaccinations: patient.vaccinations,
        medical_history: patient.medical_history,
        consultations: patient.consultations,
        clinical_data: patient.clinical_data,
        lab_results_list: patient.lab_results_data,
        outcome: patient.outcome,
      };

      const formattedContext = formatPatientContext(rawContext);

      if (llmMode === 'cloud') {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: userMessage,
            patient: rawContext, // Pass the standardized context
            conversationHistory: messages.slice(-10),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur de communication avec l\'assistant');
        }

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        let buffer = '';

        // Add empty assistant message that we'll update
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process line by line
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // Incomplete JSON, put back and continue
              buffer = line + '\n' + buffer;
              break;
            }
          }
        }
      } else {
        // LOCAL MODE (Streaming with Meditron/OpenAI format)
        console.log('[AI-Local] Streaming with local LLM (standardized)...');

        // For local mode, we need to be very careful with n_ctx (2048 limit)
        // Patient context + prompt + history must leave room for response (~512 tokens)
        const historyToShow = messages.slice(-1); // Only last message for local
        const historyStr = historyToShow.map(m => `${m.role === 'user' ? 'Directeur' : 'Assistant'}: ${m.content}`).join('\n');

        const systemPrompt = `Tu es l'Assistant MediCore expert. Tu partages le même moteur analytique que la Synthèse de Santé.
Ton analyse doit être rigoureuse, profonde et factuelle.
RÈGLES: 
- Pas de diagnostic définitif. 
- Base-toi UNIQUEMENT sur le contexte fourni. 
- Indique si l'information est manquante. 
- Sépare les faits des suppositions. 
- Inclus TOUJOURS une section "Red Flags".`;

        const userPrompt = `[CONTEXTE PATIENT STANDARD]
${formattedContext}

[CONVERSATION]
${historyStr}
Directeur : ${userMessage}
Assistant :`;

        const response = await fetch(`${localLLMConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: localLLMConfig.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            stream: true,
            temperature: 0.1,
            max_tokens: 600,
            stop: ['\nUser:', '\nDirecteur:', '\nSystem:', '</s>', '###'],
          }),
        });

        if (!response.ok) throw new Error(`Local LLM stream error: ${response.statusText}`);
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        let buffer = '';

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                const content = data.choices?.[0]?.delta?.content || '';
                if (content) {
                  assistantContent += content;
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                    return updated;
                  });
                }
              } catch (e) {
                // Ignore incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('AI Assistant error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de l\'assistant IA');
      setMessages(prev => prev.slice(0, -1)); // Remove empty assistant message on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    streamChat(input.trim());
  };

  const handleSuggestion = (question: string) => {
    if (isLoading) return;
    streamChat(question);
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden border-none shadow-none bg-transparent">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Brain className="h-5 w-5 text-primary" />
          Assistant MediCore (RAG)
          <Sparkles className="h-4 w-4 text-primary" />
        </CardTitle>
        <CardDescription className="text-xs">
          Posez une question sur le patient {patient.patient_id.slice(0, 6)}...
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col p-4 pt-0 overflow-hidden">
        {/* Messages and Suggestions Area - This one scrolls */}
        <div
          className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0"
          ref={scrollRef}
        >
          {/* Suggested Questions (only if no messages) */}
          {messages.length === 0 && (
            <div className="space-y-3 mb-6">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70">
                Suggestions d'analyse :
              </p>
              <div className="flex flex-col gap-2">
                {suggestedQuestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs justify-start h-auto py-2 px-3 bg-background/50 border-primary/10 hover:border-primary/30 text-left whitespace-normal"
                    onClick={() => handleSuggestion(q)}
                    disabled={isLoading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-muted rounded-tl-none border border-border/30'
                    }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                </div>

                {/* Explainability toggle */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="mt-1.5 flex items-center gap-2 ml-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground hover:text-primary px-1"
                      onClick={() => setShowExplainability(showExplainability === i ? null : i)}
                    >
                      <Info className="h-3 w-3 mr-1" />
                      {showExplainability === i ? 'Masquer' : 'Expliquer la réponse'}
                    </Button>
                  </div>
                )}

                {/* Explainability Panel */}
                {showExplainability === i && msg.role === 'assistant' && (
                  <div className="mt-2 w-full">
                    <ExplainabilityPanel
                      data={{
                        overallConfidence: 0.78,
                        confidenceFactors: {
                          dataQuality: 0.85,
                          sourceReliability: 0.82,
                          consensusLevel: 0.70,
                          patientSpecificity: 0.75,
                        },
                        sources: [
                          {
                            id: '1',
                            type: 'pubmed',
                            title: 'Guidelines for Diabetes Management 2024',
                            url: 'https://pubmed.ncbi.nlm.nih.gov/',
                            authors: 'American Diabetes Association',
                            year: 2024,
                            relevance: 0.92,
                          },
                          {
                            id: '2',
                            type: 'clinical_guideline',
                            title: 'HAS - Recommandations sur le traitement du diabète',
                            relevance: 0.88,
                          },
                          {
                            id: '3',
                            type: 'drug_database',
                            title: 'Vidal - Interactions médicamenteuses',
                            relevance: 0.75,
                          },
                        ],
                        reasoningChain: [
                          {
                            id: 'r1',
                            step: 1,
                            title: 'Analyse des données patient',
                            description: 'Extraction des valeurs biologiques et du traitement actuel.',
                            confidence: 0.95,
                            sources: ['1'],
                          },
                          {
                            id: 'r2',
                            step: 2,
                            title: 'Recherche de preuves',
                            description: 'Consultation des guidelines et bases de données médicales.',
                            confidence: 0.82,
                            sources: ['1', '2'],
                          },
                          {
                            id: 'r3',
                            step: 3,
                            title: 'Synthèse et recommandation',
                            description: 'Formulation de la réponse basée sur les preuves collectées.',
                            confidence: 0.78,
                            sources: ['1', '2', '3'],
                          },
                        ],
                        limitations: [
                          'Données historiques du patient non disponibles',
                          'Allergies médicamenteuses non renseignées',
                        ],
                        alternativeConsiderations: [
                          'Consultation néphrologique si DFG < 30',
                          'Adaptation posologique selon fonction rénale',
                        ],
                      }}
                      className="bg-card/30"
                    />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2 border border-border/30">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input - This remains sticked to the bottom */}
        <div className="shrink-0 pt-3 mt-auto">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question..."
              disabled={isLoading}
              className="flex-1 pr-12 bg-background/50 border-primary/20 focus-visible:ring-primary/30 h-11"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              className="absolute right-1 h-9 w-9 rounded-lg"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="text-[9px] text-center text-muted-foreground mt-2 opacity-60 italic">
            MediCore peut faire des erreurs. Vérifiez les informations critiques.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIAssistant;
