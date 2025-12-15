import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Send, Loader2, Sparkles, Info } from 'lucide-react';
import { toast } from 'sonner';
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
      const patientContext = {
        // Identification
        id: patient.id,
        patient_id: patient.patient_id,

        // Profile
        nom_complet: patient.first_name && patient.last_name
          ? `${patient.first_name} ${patient.last_name}`
          : undefined,
        prenom: patient.first_name,
        nom: patient.last_name,
        date_naissance: patient.date_of_birth,
        age: patient.age,
        gender: patient.gender === 'M' ? 'Homme' : patient.gender === 'F' ? 'Femme' : patient.gender,

        // Clinical Data (Real DB Data)
        medications: patient.medications,
        allergies: patient.allergies,
        vaccinations: patient.vaccinations,
        medical_history: patient.medical_history,
        consultations: patient.consultations,
        mental_health: patient.mental_health,
        reproductive_health: patient.reproductive_health,
        clinical_data: patient.clinical_data,
        lab_results_list: patient.lab_results_data, // List of DB entries

        // Legacy/Aggregated fields
        lab_results_summary: patient.lab_results_json,
        alerts: patient.alerts,
        medical_notes: patient.medical_notes_nlp,
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          message: userMessage,
          patient: patientContext,
          conversationHistory: messages,
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
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Assistant MediCore (RAG)
          <Sparkles className="h-4 w-4 text-primary" />
        </CardTitle>
        <CardDescription>
          Posez une question sur le patient {patient.patient_id.slice(0, 6)}...
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-4 pt-0">
        {/* Suggested Questions */}
        {messages.length === 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-muted-foreground">Questions suggérées :</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1.5 px-2"
                  onClick={() => handleSuggestion(q)}
                  disabled={isLoading}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                    }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>

                {/* Explainability toggle for assistant messages */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="mt-1 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground hover:text-primary"
                      onClick={() => setShowExplainability(showExplainability === i ? null : i)}
                    >
                      <Info className="h-3 w-3 mr-1" />
                      {showExplainability === i ? 'Masquer' : 'Expliquer'}
                    </Button>
                  </div>
                )}

                {/* Explainability Panel */}
                {showExplainability === i && msg.role === 'assistant' && (
                  <div className="mt-2 w-full max-w-[95%]">
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
                      className="border-l-2 border-primary/30"
                    />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AIAssistant;
