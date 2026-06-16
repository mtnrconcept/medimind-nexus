import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import {
  Brain,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Link2,
  Activity,
  Pill,
  Stethoscope,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Globe,
  ExternalLink,
  BookOpen,
  Search,
  X,
  CheckSquare,
  Square,
  Tablets,
  Network,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAI } from '@/contexts/AIContext';
import { resolveAIJob, type AIJobProgress } from '@/lib/aiJobs';
import { VideoLoader } from './VideoLoader';
import { RelationshipMatrix } from './RelationshipMatrix';
import { RiskNetworkGraph } from './RiskNetworkGraph';
import useMedicalStats from '@/hooks/useMedicalStats';
import {
  getAppropriatenessBadgeLabel,
  isAppropriatenessSuccess,
  isAppropriatenessWarning,
  supportsAppropriatenessBadge,
} from './crossDataDisplay';

interface Pathology {
  id: string;
  name: string;
  category: string | null;
  specialty: string | null;
  severity: string | null;
  isExternal?: boolean;
}

interface Symptom {
  id: string;
  name: string;
  body_system: string | null;
  isExternal?: boolean;
}

interface Treatment {
  id: string;
  name: string;
  pathology_id: string;
  type: string | null;
}

interface Medication {
  id: string;
  name: string;
  atc_code: string | null;
  substance: string | null;
  isExternal?: boolean;
}

interface WebSource {
  title: string;
  url: string;
}

interface WebResearch {
  query: string;
  findings: string[];
  sources: WebSource[];
}

interface CausalLink {
  from: string;
  fromType: 'symptom' | 'pathology' | 'treatment' | 'medication';
  to: string;
  toType: 'symptom' | 'pathology' | 'treatment' | 'medication';
  relationship: string;
  probability: 'high' | 'medium' | 'low';
  evidence: string;
  patientCount: number;
  webSources?: string[];
  isAppropriate?: boolean; // Pour les traitements: indique si adapté à la pathologie
  effectType?: 'therapeutic' | 'adverse' | 'both'; // Type d'effet: thérapeutique, indésirable ou les deux
  therapeuticDetails?: string; // Détails de l'effet thérapeutique
  adverseDetails?: string; // Détails de l'effet indésirable
  dangerLevel?: 'critical' | 'high' | 'moderate' | 'low';
  interactionType?: 'drug-drug' | 'drug-treatment' | 'pathology-danger';
  symptomFrequency?: 'principal' | 'frequent' | 'possible' | 'rare';
}

interface Alternative {
  for: string;
  forType: string;
  reason: string;
  suggestions: string[];
  evidence?: string;
}

interface ProposedChange {
  action: 'replace' | 'remove' | 'add';
  target: string;
  targetType: 'medication' | 'treatment';
  reason: string;
  replacement?: string;
  replacementType?: 'medication' | 'treatment';
  improvementScore: number;
}

interface SchemaStats {
  redLinks: number;
  orangeLinks: number;
  greenLinks: number;
  totalDangerScore: number;
  inappropriateCount: number;
  adverseEffectCount: number;
}

interface SchemaComparison {
  currentScore: number;
  proposedScore: number;
  improvementPercent: number;
  currentStats: SchemaStats;
  proposedStats: SchemaStats;
  proposedChanges: ProposedChange[];
  benefitRiskRatio: { current: number; proposed: number };
  clinicalSummary: string;
}

interface TreatmentSchemaStep {
  action: 'keep' | 'replace' | 'remove' | 'add' | 'monitor';
  target: string;
  targetType: 'medication' | 'treatment' | 'monitoring';
  replacement?: string;
  rationale: string;
  monitoring?: string[];
  riskMitigation?: string[];
}

interface TreatmentSchema {
  title: string;
  priority: 'preferred' | 'alternative' | 'cautious';
  rationale: string;
  expectedBenefits: string[];
  residualRisks: string[];
  steps: TreatmentSchemaStep[];
  monitoringPlan: string[];
  patientWarnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
  webResearch: WebResearch[];
  alternatives?: Alternative[];
  schemaComparison?: SchemaComparison;
  treatmentSchemas?: TreatmentSchema[];
}

interface PatientData {
  linked_pathologies?: { pathologies?: { id: string; name: string } }[];
  linked_medications?: { medications?: { id: string; name: string } }[];
  linked_symptoms?: { symptoms?: { id: string; name: string } }[];
  linked_treatments?: { treatments?: { id: string; name: string } }[];
  pathologies?: { name: string };
  medical_notes_nlp?: string;
  treatment?: string;
}

interface CrossDataAnalyzerProps {
  patientData?: PatientData;
}

interface NCBIConcept {
  id: string;
  name: string;
  description?: string;
}

const CrossDataAnalyzer = ({ patientData }: CrossDataAnalyzerProps) => {
  const { invokeAI } = useAI();
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingTreatmentSchemas, setGeneratingTreatmentSchemas] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AIJobProgress | null>(null);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'network'>('list');

  const [selectedPathologies, setSelectedPathologies] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);

  // Filtres de recherche texte
  const [searchPathologies, setSearchPathologies] = useState('');
  const [searchSymptoms, setSearchSymptoms] = useState('');
  const [searchTreatments, setSearchTreatments] = useState('');
  const [searchMedications, setSearchMedications] = useState('');

  // Filtres avancés
  const [filterPathologyCategory, setFilterPathologyCategory] = useState<string>('all');
  const [filterPathologySpecialty, setFilterPathologySpecialty] = useState<string>('all');
  const [filterPathologySeverity, setFilterPathologySeverity] = useState<string>('all');
  const [filterSymptomBodySystem, setFilterSymptomBodySystem] = useState<string>('all');
  const [filterTreatmentType, setFilterTreatmentType] = useState<string>('all');
  const [filterMedicationAtc, setFilterMedicationAtc] = useState<string>('all');

  // Hook de traduction automatique
  const { t } = useAutoTranslation();

  // NEW: Statistiques médicales globales (21M+)
  const { stats: medicalStats } = useMedicalStats();

  // Debounce search terms
  const [debouncedSearchPathologies, setDebouncedSearchPathologies] = useState(searchPathologies);
  const [debouncedSearchSymptoms, setDebouncedSearchSymptoms] = useState(searchSymptoms);
  const [debouncedSearchTreatments, setDebouncedSearchTreatments] = useState(searchTreatments);
  const [debouncedSearchMedications, setDebouncedSearchMedications] = useState(searchMedications);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchPathologies(searchPathologies), 300);
    return () => clearTimeout(timer);
  }, [searchPathologies]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchSymptoms(searchSymptoms), 300);
    return () => clearTimeout(timer);
  }, [searchSymptoms]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTreatments(searchTreatments), 300);
    return () => clearTimeout(timer);
  }, [searchTreatments]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchMedications(searchMedications), 300);
    return () => clearTimeout(timer);
  }, [searchMedications]);

  // Recherche externe NCBI
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);

  const searchExternalConcepts = useCallback(async (query: string, type: 'pathology' | 'medication' | 'symptom', isAuto = false) => {
    if (!query || query.length < 3) {
      if (!isAuto) toast.error("Veuillez saisir au moins 3 caractères pour la recherche en ligne");
      return;
    }

    // Avoid searching if we already have the exact match to prevent spam
    if (type === 'pathology' && pathologies.some(p => p.name.toLowerCase() === query.toLowerCase())) return;
    if (type === 'symptom' && symptoms.some(s => s.name.toLowerCase() === query.toLowerCase())) return;
    if (type === 'medication' && medications.some(m => m.name.toLowerCase() === query.toLowerCase())) return;

    setIsSearchingWeb(true);
    try {
      const { data, error } = await invokeAI('search-medical-concepts', {
        query, type
      });

      if (error) throw error;

      if (data?.concepts) {
        let addedCount = 0;

        if (type === 'pathology') {
          const newItems: Pathology[] = data.concepts
            .filter((c: NCBIConcept) => !pathologies.some(p => p.id === c.id || p.name.toLowerCase() === c.name.toLowerCase()))
            .map((c: NCBIConcept) => ({
              id: c.id,
              name: c.name,
              category: 'NCBI',
              specialty: 'Importé',
              severity: 'unknown',
              isExternal: true
            }));
          if (newItems.length > 0) {
            setPathologies(prev => [...prev, ...newItems]);
            addedCount = newItems.length;
          }
        }
        else if (type === 'medication') {
          const newItems: Medication[] = data.concepts
            .filter((c: NCBIConcept) => !medications.some(m => m.id === c.id || m.name.toLowerCase() === c.name.toLowerCase()))
            .map((c: NCBIConcept) => ({
              id: c.id,
              name: c.name,
              atc_code: null,
              substance: c.description || null,
              isExternal: true
            }));
          if (newItems.length > 0) {
            setMedications(prev => [...prev, ...newItems]);
            addedCount = newItems.length;
          }
        }
        else if (type === 'symptom') {
          const newItems: Symptom[] = data.concepts
            .filter((c: NCBIConcept) => !symptoms.some(s => s.id === c.id || s.name.toLowerCase() === c.name.toLowerCase()))
            .map((c: NCBIConcept) => ({
              id: c.id,
              name: c.name,
              body_system: 'NCBI',
              isExternal: true
            }));
          if (newItems.length > 0) {
            setSymptoms(prev => [...prev, ...newItems]);
            addedCount = newItems.length;
          }
        }

        if (addedCount > 0 && !isAuto) {
          toast.success(`${addedCount} éléments ajoutés depuis NCBI`);
        } else if (!isAuto) {
          toast.info("Aucun nouvel élément trouvé sur NCBI");
        }
      }
    } catch (err) {
      console.error('Erreur recherche NCBI:', err);
      if (!isAuto) toast.error("Erreur lors de la recherche NCBI");
    } finally {
      setIsSearchingWeb(false);
    }
  }, [pathologies, symptoms, medications]);

  // Triggers automatiques pour la recherche externe (Smart Autocomplete)
  useEffect(() => {
    if (debouncedSearchPathologies.length >= 3) {
      searchExternalConcepts(debouncedSearchPathologies, 'pathology', true);
    }
  }, [debouncedSearchPathologies, searchExternalConcepts]);

  useEffect(() => {
    if (debouncedSearchSymptoms.length >= 3) {
      searchExternalConcepts(debouncedSearchSymptoms, 'symptom', true);
    }
  }, [debouncedSearchSymptoms, searchExternalConcepts]);

  useEffect(() => {
    if (debouncedSearchMedications.length >= 3) {
      searchExternalConcepts(debouncedSearchMedications, 'medication', true);
    }
  }, [debouncedSearchMedications, searchExternalConcepts]);

  // Options de filtres extraites des données
  const pathologyCategories = useMemo(() => {
    const cats = new Set<string>();
    pathologies.forEach(p => p.category && cats.add(p.category));
    return Array.from(cats).sort();
  }, [pathologies]);

  const pathologySpecialties = useMemo(() => {
    const specs = new Set<string>();
    pathologies.forEach(p => p.specialty && specs.add(p.specialty));
    return Array.from(specs).sort();
  }, [pathologies]);

  const pathologySeverities = useMemo(() => {
    const sevs = new Set<string>();
    pathologies.forEach(p => p.severity && sevs.add(p.severity));
    return Array.from(sevs).sort();
  }, [pathologies]);

  const symptomBodySystems = useMemo(() => {
    const systems = new Set<string>();
    symptoms.forEach(s => s.body_system && systems.add(s.body_system));
    return Array.from(systems).sort();
  }, [symptoms]);

  const treatmentTypes = useMemo(() => {
    const types = new Set<string>();
    treatments.forEach(t => t.type && types.add(t.type));
    return Array.from(types).sort();
  }, [treatments]);

  const medicationAtcCodes = useMemo(() => {
    const codes = new Set<string>();
    medications.forEach(m => {
      if (m.atc_code) {
        // Extraire la première lettre du code ATC pour le groupe principal
        codes.add(m.atc_code.substring(0, 1));
      }
    });
    return Array.from(codes).sort();
  }, [medications]);

  // Filtrage des données
  const filteredPathologies = useMemo(() => {
    return pathologies.filter(p => {
      const matchesSearch = !debouncedSearchPathologies.trim() ||
        p.name.toLowerCase().includes(debouncedSearchPathologies.toLowerCase());
      const matchesCategory = filterPathologyCategory === 'all' ||
        p.category === filterPathologyCategory;
      const matchesSpecialty = filterPathologySpecialty === 'all' ||
        p.specialty === filterPathologySpecialty;
      const matchesSeverity = filterPathologySeverity === 'all' ||
        p.severity === filterPathologySeverity;
      return matchesSearch && matchesCategory && matchesSpecialty && matchesSeverity;
    });
  }, [pathologies, debouncedSearchPathologies, filterPathologyCategory, filterPathologySpecialty, filterPathologySeverity]);

  const filteredSymptoms = useMemo(() => {
    return symptoms.filter(s => {
      const matchesSearch = !debouncedSearchSymptoms.trim() ||
        s.name.toLowerCase().includes(debouncedSearchSymptoms.toLowerCase());
      const matchesBodySystem = filterSymptomBodySystem === 'all' ||
        s.body_system === filterSymptomBodySystem;
      return matchesSearch && matchesBodySystem;
    });
  }, [symptoms, debouncedSearchSymptoms, filterSymptomBodySystem]);

  const filteredTreatments = useMemo(() => {
    return treatments.filter(t => {
      const matchesSearch = !debouncedSearchTreatments.trim() ||
        t.name.toLowerCase().includes(debouncedSearchTreatments.toLowerCase());
      const matchesType = filterTreatmentType === 'all' ||
        t.type === filterTreatmentType;
      return matchesSearch && matchesType;
    });
  }, [treatments, debouncedSearchTreatments, filterTreatmentType]);

  const filteredMedications = useMemo(() => {
    return medications.filter(m => {
      const matchesSearch = !debouncedSearchMedications.trim() ||
        m.name.toLowerCase().includes(debouncedSearchMedications.toLowerCase()) ||
        (m.substance && m.substance.toLowerCase().includes(debouncedSearchMedications.toLowerCase()));
      const matchesAtc = filterMedicationAtc === 'all' ||
        (m.atc_code && m.atc_code.startsWith(filterMedicationAtc));
      return matchesSearch && matchesAtc;
    });
  }, [medications, debouncedSearchMedications, filterMedicationAtc]);

  useEffect(() => {
    const fetchAllRows = async <T,>(
      table: 'pathologies' | 'symptoms' | 'treatments' | 'medications',
      selectQuery: string
    ): Promise<T[]> => {
      const pageSize = 1000;
      let allData: T[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select(selectQuery)
          .order('name', { ascending: true })
          .order('id', { ascending: true }) // Tri stable pour éviter les doublons de pagination
          .range(from, from + pageSize - 1);

        if (error) {
          console.error(`Erreur chargement ${table}:`, error);
          break;
        }

        if (data) {
          allData = [...allData, ...data as unknown as T[]];
          hasMore = data.length === pageSize;
          from += pageSize;
        } else {
          hasMore = false;
        }
      }

      // Déduplication de sécurité sur l'ID
      return Array.from(new Map(allData.map((item: T & { id: string }) => [item.id, item])).values());
    };

    const fetchData = async () => {
      setLoading(true);

      const [pathologiesData, symptomsData, treatmentsData, medicationsData] = await Promise.all([
        fetchAllRows<Pathology>('pathologies', 'id, name, category, specialty, severity'),
        fetchAllRows<Symptom>('symptoms', 'id, name, body_system'),
        fetchAllRows<Treatment>('treatments', 'id, name, pathology_id, type'),
        fetchAllRows<Medication>('medications', 'id, name, atc_code, substance')
      ]);

      setPathologies(pathologiesData);
      setSymptoms(symptomsData);
      setTreatments(treatmentsData);
      setMedications(medicationsData);
      setLoading(false);

      setMedications(medicationsData);
      setLoading(false);

      // Les stats réelles sont gérées par useMedicalStats
    };

    fetchData();
  }, []);

  // Pré-sélection automatique des données patient
  useEffect(() => {
    if (!patientData || loading || pathologies.length === 0) return;

    const autoSelectPatientData = async () => {
      setIsAutoSelecting(true);
      setShowLoader(true);
      setFadeOut(false);

      try {
        const selectedPathIds: string[] = [];
        const selectedTreatIds: string[] = [];
        const selectedMedIds: string[] = [];
        const selectedSymptIds: string[] = [];

        console.log('🔍 Données patient reçues:', patientData);

        // Fonction de nuance pour comparer les termes FR/EN
        const matchesWithNuance = (dbName: string, searchTerm: string): boolean => {
          const normalize = (str: string) => str.toLowerCase().trim()
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[ñ]/g, 'n');

          const dbNorm = normalize(dbName);
          const searchNorm = normalize(searchTerm);

          if (dbNorm === searchNorm) return true;
          if (dbNorm.includes(searchNorm) || searchNorm.includes(dbNorm)) return true;

          // Dictionnaire de traductions FR <-> EN
          const translations: Record<string, string[]> = {
            'diabetes': ['diabète', 'diabete'], 'diabète': ['diabetes'],
            'hypertension': ['hypertension artérielle', 'hta'],
            'allergic rhinitis': ['rhinite allergique'], 'rhinite allergique': ['allergic rhinitis'],
            'gout': ['goutte'], 'goutte': ['gout'],
            'hypercholesterolemia': ['hypercholestérolémie'], 'hypercholestérolémie': ['hypercholesterolemia'],
            'asthma': ['asthme'], 'asthme': ['asthma'],
            'metformin': ['metformine'], 'metformine': ['metformin'],
            'glibenclamide': ['glyburide'], 'glyburide': ['glibenclamide'],
            'atorvastatin': ['atorvastatine'], 'atorvastatine': ['atorvastatin'],
            'simvastatin': ['simvastatine'], 'simvastatine': ['simvastatin'],
            'aspirin': ['aspirine'], 'aspirine': ['aspirin'],
            'paracetamol': ['paracétamol', 'acetaminophen'], 'paracétamol': ['paracetamol'],
            'ibuprofen': ['ibuprofène'], 'ibuprofène': ['ibuprofen'],
            'omeprazole': ['oméprazole'], 'oméprazole': ['omeprazole'],
            'insulin': ['insuline'], 'insuline': ['insulin'],
          };

          const searchLower = searchNorm.toLowerCase();
          for (const [key, values] of Object.entries(translations)) {
            if (normalize(key) === searchLower) {
              return values.some(v => dbNorm.includes(normalize(v)));
            }
            if (values.some(v => normalize(v) === searchLower)) {
              return dbNorm.includes(normalize(key));
            }
          }
          return false;
        };

        // ========== PRIORITÉ 1: Tables de liaison ==========

        // 1a. Pathologies depuis tables de liaison
        if (patientData.linked_pathologies?.length && patientData.linked_pathologies.length > 0) {
          console.log('📦 Utilisation des pathologies liées:', patientData.linked_pathologies.length);
          patientData.linked_pathologies.forEach((lp) => {
            if (lp.pathologies?.id && !selectedPathIds.includes(lp.pathologies.id)) {
              selectedPathIds.push(lp.pathologies.id);
              console.log('✅ Pathologie liée:', lp.pathologies.name);
            }
          });
        }

        // 1b. Médicaments depuis tables de liaison
        if (patientData.linked_medications?.length && patientData.linked_medications.length > 0) {
          console.log('📦 Utilisation des médicaments liés:', patientData.linked_medications.length);
          patientData.linked_medications.forEach((lm) => {
            if (lm.medications?.id && !selectedMedIds.includes(lm.medications.id)) {
              selectedMedIds.push(lm.medications.id);
              console.log('✅ Médicament lié:', lm.medications.name);
            }
          });
        }

        // 1c. Symptômes depuis tables de liaison
        if (patientData.linked_symptoms?.length && patientData.linked_symptoms.length > 0) {
          console.log('📦 Utilisation des symptômes liés:', patientData.linked_symptoms.length);
          patientData.linked_symptoms.forEach((ls) => {
            if (ls.symptoms?.id && !selectedSymptIds.includes(ls.symptoms.id)) {
              selectedSymptIds.push(ls.symptoms.id);
              console.log('✅ Symptôme lié:', ls.symptoms.name);
            }
          });
        }

        // 1d. Traitements depuis tables de liaison
        if (patientData.linked_treatments?.length && patientData.linked_treatments.length > 0) {
          console.log('📦 Utilisation des traitements liés:', patientData.linked_treatments.length);
          patientData.linked_treatments.forEach((lt) => {
            if (lt.treatments?.id && !selectedTreatIds.includes(lt.treatments.id)) {
              selectedTreatIds.push(lt.treatments.id);
              console.log('✅ Traitement lié:', lt.treatments.name);
            }
          });
        }

        // ========== PRIORITÉ 2: Fallback sur données texte ==========

        // 2a. Pathologie principale (ancienne méthode)
        if (selectedPathIds.length === 0 && patientData.pathologies?.name) {
          const pathologyName = patientData.pathologies.name;
          console.log('🔍 Recherche pathologie (fallback):', pathologyName);

          const foundPathology = pathologies.find(p => matchesWithNuance(p.name, pathologyName));
          if (foundPathology) {
            selectedPathIds.push(foundPathology.id);
            console.log('✅ Pathologie trouvée:', foundPathology.name);
          }
        }

        // 2. Extraire pathologies depuis medical_notes_nlp
        if (patientData.medical_notes_nlp) {
          const notesText = patientData.medical_notes_nlp.toLowerCase();
          console.log('🔍 Analyse notes médicales');

          const commonPathologies = [
            'diabetes', 'diabète', 'hypertension', 'rhinite', 'rhinitis',
            'gout', 'goutte', 'cholesterol', 'cholestérol'
          ];

          commonPathologies.forEach(term => {
            if (notesText.includes(term.toLowerCase())) {
              const foundPath = pathologies.find(p => matchesWithNuance(p.name, term));
              if (foundPath && !selectedPathIds.includes(foundPath.id)) {
                selectedPathIds.push(foundPath.id);
                console.log('✅ Pathologie trouvée dans notes:', foundPath.name);
              }
            }
          });
        }

        // 3. Extraire médicaments du traitement
        if (patientData.treatment) {
          const treatmentText = patientData.treatment.toLowerCase();
          console.log('🔍 Analyse traitement:', treatmentText);

          const medicationKeywords = [
            'metformin', 'metformine', 'glibenclamide', 'glyburide',
            'lisinopril', 'atorvastatin', 'atorvastatine', 'simvastatin', 'simvastatine',
            'aspirin', 'aspirine', 'paracetamol', 'paracétamol',
            'ibuprofen', 'ibuprofène', 'omeprazole', 'oméprazole',
            'insulin', 'insuline', 'allopurinol', 'colchicine', 'cetirizine', 'cétirizine'
          ];

          medicationKeywords.forEach(medKeyword => {
            if (treatmentText.includes(medKeyword)) {
              const foundMed = medications.find(m =>
                matchesWithNuance(m.name, medKeyword) ||
                (m.substance && matchesWithNuance(m.substance, medKeyword))
              );

              if (foundMed && !selectedMedIds.includes(foundMed.id)) {
                selectedMedIds.push(foundMed.id);
                console.log('✅ Médicament trouvé:', foundMed.name);
              }
            }
          });
        }

        // 4. Sélectionner traitements liés (seulement si pas déjà rempli par les tables de liaison)
        if (selectedTreatIds.length === 0 && selectedPathIds.length > 0) {
          const relatedTreatments = treatments.filter(t =>
            selectedPathIds.includes(t.pathology_id)
          );
          relatedTreatments.slice(0, 5).forEach(t => {
            if (!selectedTreatIds.includes(t.id)) {
              selectedTreatIds.push(t.id);
              console.log('✅ Traitement lié (auto):', t.name);
            }
          });
        }

        // Appliquer les sélections
        setSelectedPathologies(selectedPathIds);
        setSelectedTreatments(selectedTreatIds);
        setSelectedMedications(selectedMedIds);
        setSelectedSymptoms(selectedSymptIds);

        console.log('📊 Résumé:', {
          pathologies: selectedPathIds.length,
          symptômes: selectedSymptIds.length,
          traitements: selectedTreatIds.length,
          médicaments: selectedMedIds.length
        });

        const totalSelected = selectedPathIds.length + selectedSymptIds.length +
          selectedTreatIds.length + selectedMedIds.length;

        if (totalSelected > 0) {
          const parts = [];
          if (selectedPathIds.length > 0) parts.push(`${selectedPathIds.length} pathologie(s)`);
          if (selectedSymptIds.length > 0) parts.push(`${selectedSymptIds.length} symptôme(s)`);
          if (selectedTreatIds.length > 0) parts.push(`${selectedTreatIds.length} traitement(s)`);
          if (selectedMedIds.length > 0) parts.push(`${selectedMedIds.length} médicament(s)`);

          toast.success(
            `${totalSelected} éléments pré-sélectionnés : ${parts.join(', ')}`,
            { duration: 5000 }
          );
        } else {
          toast.warning(
            'Aucun élément correspondant trouvé. Sélectionnez manuellement.',
            { duration: 5000 }
          );
        }

        setTimeout(() => {
          setFadeOut(true);
          setTimeout(() => {
            setShowLoader(false);
            setIsAutoSelecting(false);
          }, 700);
        }, 2000);

      } catch (err) {
        console.error('❌ Erreur pré-sélection:', err);
        toast.error('Erreur lors de la pré-sélection automatique');
        setIsAutoSelecting(false);
        setShowLoader(false);
      }
    };

    autoSelectPatientData();
  }, [patientData, loading, pathologies, treatments, medications]);

  const toggleSelection = (
    id: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  // Sélectionner/Désélectionner tous les éléments filtrés
  const selectAllFiltered = (
    filteredItems: { id: string }[],
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const filteredIds = filteredItems.map(item => item.id);
    const allSelected = filteredIds.every(id => selected.includes(id));

    if (allSelected) {
      // Désélectionner tous les filtrés
      setSelected(selected.filter(id => !filteredIds.includes(id)));
    } else {
      // Sélectionner tous les filtrés
      const newSelected = [...new Set([...selected, ...filteredIds])];
      setSelected(newSelected);
    }
  };

  const areAllFilteredSelected = (
    filteredItems: { id: string }[],
    selected: string[]
  ) => {
    if (filteredItems.length === 0) return false;
    return filteredItems.every(item => selected.includes(item.id));
  };

  const getTotalSelected = () =>
    selectedPathologies.length + selectedSymptoms.length + selectedTreatments.length + selectedMedications.length;

  const buildAnalysisRequestBody = () => {
    const dbPathologyIds = selectedPathologies.filter(id => !pathologies.find(p => p.id === id && p.category === 'NCBI'));
    const extPathologies = selectedPathologies
      .map(id => pathologies.find(p => p.id === id && p.category === 'NCBI'))
      .filter(Boolean);

    const dbSymptomIds = selectedSymptoms.filter(id => !symptoms.find(s => s.id === id && s.body_system === 'NCBI'));
    const extSymptoms = selectedSymptoms
      .map(id => symptoms.find(s => s.id === id && s.body_system === 'NCBI'))
      .filter(Boolean);

    const dbMedicationIds = selectedMedications.filter(id => !medications.find(m => m.id === id && !m.atc_code));
    const extMedications = selectedMedications
      .map(id => medications.find(m => m.id === id && !m.atc_code))
      .filter(Boolean);

    return {
      pathologyIds: dbPathologyIds,
      symptomIds: dbSymptomIds,
      treatmentIds: selectedTreatments,
      medicationIds: dbMedicationIds,
      externalPathologies: extPathologies,
      externalSymptoms: extSymptoms,
      externalMedications: extMedications
    };
  };

  const runAnalysis = async () => {
    if (getTotalSelected() < 2) {
      toast.error('Sélectionnez au moins 2 éléments pour analyser les liens de causalité');
      return;
    }

    setAnalyzing(true);
    setAnalysisProgress(null);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await invokeAI('cross-data-analyzer', {
        ...buildAnalysisRequestBody(),
        async: true,
      });

      if (fnError) throw fnError;

      if (data.error) {
        if (data.error.includes('Crédits insuffisants') || data.error.includes('402')) {
          setError('Crédits IA insuffisants. Rechargez votre compte dans Paramètres → Workspace → Usage.');
        } else if (data.error.includes('Limite') || data.error.includes('429')) {
          setError('Limite de requêtes atteinte. Réessayez dans quelques instants.');
        } else {
          setError(data.error);
        }
        return;
      }

      const resolvedData = await resolveAIJob<{
        analysis: AnalysisResult;
        context?: { pubmedSearches?: number };
      }>(invokeAI, 'cross-data-analyzer', data, {
        onProgress: setAnalysisProgress,
      });

      setResult(resolvedData.analysis);
      toast.success(`Analyse terminée : ${resolvedData.context?.pubmedSearches || 0} recherches PubMed effectuées`);
    } catch (err) {
      console.error('Erreur d\'analyse:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'analyse. Veuillez réessayer.');
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const runTreatmentSchemaGeneration = async () => {
    if (!result) {
      toast.error('Lancez d’abord une analyse des liens avant de générer les schémas alternatifs');
      return;
    }

    setGeneratingTreatmentSchemas(true);
    setAnalysisProgress(null);
    setError(null);

    try {
      const { data, error: fnError } = await invokeAI('cross-data-analyzer', {
        ...buildAnalysisRequestBody(),
        analysisMode: 'treatment_schemas',
        currentAnalysis: result,
        async: true,
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      const resolvedData = await resolveAIJob<{
        treatmentSchemas?: TreatmentSchema[];
        analysis?: AnalysisResult;
      }>(invokeAI, 'cross-data-analyzer', data, {
        onProgress: setAnalysisProgress,
      });

      const treatmentSchemas = resolvedData.treatmentSchemas || resolvedData.analysis?.treatmentSchemas || [];
      setResult(prev => prev ? {
        ...prev,
        treatmentSchemas,
        schemaComparison: resolvedData.analysis?.schemaComparison || prev.schemaComparison,
      } : prev);
      toast.success(`${treatmentSchemas.length} schéma(s) thérapeutique(s) alternatif(s) généré(s)`);
    } catch (err) {
      console.error('Erreur génération schémas alternatifs:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération des schémas thérapeutiques alternatifs.');
    } finally {
      setGeneratingTreatmentSchemas(false);
      setAnalysisProgress(null);
    }
  };



  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'symptom': return 'Symptôme';
      case 'pathology': return 'Pathologie';
      case 'treatment': return 'Traitement';
      case 'medication': return 'Médicament';
      default: return type;
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'mild': return 'Légère';
      case 'moderate': return 'Modérée';
      case 'severe': return 'Sévère';
      case 'critical': return 'Critique';
      default: return severity;
    }
  };

  const getTreatmentTypeLabel = (type: string) => {
    switch (type) {
      case 'medication': return 'Médicament';
      case 'surgery': return 'Chirurgie';
      case 'therapy': return 'Thérapie';
      case 'lifestyle': return 'Mode de vie';
      case 'other': return 'Autre';
      default: return type;
    }
  };

  const getAtcGroupLabel = (code: string) => {
    const labels: Record<string, string> = {
      'A': 'A - Appareil digestif',
      'B': 'B - Sang et organes hématopoïétiques',
      'C': 'C - Système cardiovasculaire',
      'D': 'D - Dermatologie',
      'G': 'G - Système génito-urinaire',
      'H': 'H - Hormones systémiques',
      'J': 'J - Anti-infectieux',
      'L': 'L - Antinéoplasiques',
      'M': 'M - Système musculo-squelettique',
      'N': 'N - Système nerveux',
      'P': 'P - Antiparasitaires',
      'R': 'R - Système respiratoire',
      'S': 'S - Organes sensoriels',
      'V': 'V - Divers'
    };
    return labels[code] || code;
  };

  const resetPathologyFilters = () => {
    setSearchPathologies('');
    setFilterPathologyCategory('all');
    setFilterPathologySpecialty('all');
    setFilterPathologySeverity('all');
  };

  const resetSymptomFilters = () => {
    setSearchSymptoms('');
    setFilterSymptomBodySystem('all');
  };

  const resetTreatmentFilters = () => {
    setSearchTreatments('');
    setFilterTreatmentType('all');
  };

  const resetMedicationFilters = () => {
    setSearchMedications('');
    setFilterMedicationAtc('all');
  };



  const hasPathologyFilters = searchPathologies || filterPathologyCategory !== 'all' ||
    filterPathologySpecialty !== 'all' || filterPathologySeverity !== 'all';
  const hasSymptomFilters = searchSymptoms || filterSymptomBodySystem !== 'all';
  const hasTreatmentFilters = searchTreatments || filterTreatmentType !== 'all';
  const hasMedicationFilters = searchMedications || filterMedicationAtc !== 'all';

  // Gestion du fade-out du loader
  useEffect(() => {
    if (!loading && !isAutoSelecting) {
      setFadeOut(true);
      const timer = setTimeout(() => setShowLoader(false), 700);
      return () => clearTimeout(timer);
    }
  }, [loading, isAutoSelecting]);

  return (
    <div className="relative min-h-[600px]">
      {showLoader && (
        <div className={`absolute inset-0 z-50 transition-all duration-700 ease-in-out ${fadeOut ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
          <VideoLoader />
        </div>
      )}

      <Card className="h-full border-none shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                {t('Analyse IA Cross-Data')}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                {t('Analyse les liens de causalité en croisant vos données patients et la littérature médicale')} (PubMed)
                {medicalStats && (
                  <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                    <Database className="h-3 w-3 mr-1" />
                    {(medicalStats.total / 1000000).toFixed(1)}M+ données médicales
                  </Badge>
                )}
              </div>
            </div>
            {/* Boutons de mode de vue */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Liste
              </Button>
              <Button
                variant={viewMode === 'network' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('network')}
                className="gap-2"
              >
                <Network className="h-4 w-4" />
                Graphique
              </Button>
            </div>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground mt-2 flex-wrap">
            {medicalStats ? (
              <>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" title="Source: CMS.gov (ICD-10)">
                  {(medicalStats.diagnoses.count / 1000).toFixed(1)}k Diagnostics
                </Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30" title="Source: OpenFDA">
                  {(medicalStats.adverseEvents.count / 1000000).toFixed(1)}M Événements Indés.
                </Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30" title="Source: FDA + DrugBank">
                  {(medicalStats.medications.count / 1000).toFixed(0)}k+ Médicaments
                </Badge>
                <Badge variant="outline" title="Source: DrugBank 6.0" className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30">
                  {(medicalStats.interactions.count / 1000000).toFixed(1)}M+ Interactions
                </Badge>
              </>
            ) : (
              <>
                <Badge variant="outline">{pathologies.length} {t('pathologies')}</Badge>
                <Badge variant="outline">{symptoms.length} {t('symptômes')}</Badge>
                <Badge variant="outline">{treatments.length} {t('traitements')}</Badge>
                <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30">{medications.length} {t('médicaments')}</Badge>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Graphique en Réseau */}
          {viewMode === 'network' ? (
            <RiskNetworkGraph
              externalPathologies={pathologies}
              externalSymptoms={symptoms}
              externalTreatments={treatments}
              externalMedications={medications}
              selectedPathologyIds={selectedPathologies}
              selectedSymptomIds={selectedSymptoms}
              selectedTreatmentIds={selectedTreatments}
              selectedMedicationIds={selectedMedications}
              analysisResultFromParent={result}
              onAnalysisResultChange={setResult}
              onGenerateTreatmentSchemas={runTreatmentSchemaGeneration}
              isGeneratingTreatmentSchemas={generatingTreatmentSchemas}
            />
          ) : (
            <>
              {/* Panneaux de sélection */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Pathologies */}
                <div className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Stethoscope className="h-4 w-4 text-purple-500" />
                      Pathologies ({selectedPathologies.length})
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {filteredPathologies.length} / {medicalStats?.diagnoses?.count ? (medicalStats.diagnoses.count / 1000).toFixed(1) + 'k' : pathologies.length}
                    </span>
                  </div>

                  {/* Recherche textuelle */}
                  <div className="relative flex gap-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('Rechercher...')}
                        value={searchPathologies}
                        onChange={(e) => setSearchPathologies(e.target.value)}
                        className="pl-8 pr-8 h-8 text-sm"

                        onKeyDown={(e) => e.key === 'Enter' && searchExternalConcepts(searchPathologies, 'pathology')}
                      />
                      {isSearchingWeb && searchPathologies.length >= 3 && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {searchPathologies && (
                        <button
                          onClick={() => setSearchPathologies('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {/* Global Search Trigger in Input */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-blue-500"
                        title="Rechercher dans la base mondiale (ICD-10 + PubMed)"
                        onClick={() => searchExternalConcepts(searchPathologies, 'pathology')}
                        disabled={searchPathologies.length < 3}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Filtres avancés */}
                  <div className="space-y-1.5">
                    <Select value={filterPathologyCategory} onValueChange={setFilterPathologyCategory}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder={t('Catégorie')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('Toutes catégories')}</SelectItem>
                        {pathologyCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterPathologySpecialty} onValueChange={setFilterPathologySpecialty}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder={t('Spécialité')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('Toutes spécialités')}</SelectItem>
                        {pathologySpecialties.map(spec => (
                          <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterPathologySeverity} onValueChange={setFilterPathologySeverity}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder={t('Sévérité')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('Toutes sévérités')}</SelectItem>
                        {pathologySeverities.map(sev => (
                          <SelectItem key={sev} value={sev}>{getSeverityLabel(sev)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Actions groupées */}
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllFiltered(filteredPathologies, selectedPathologies, setSelectedPathologies)}
                    >
                      {areAllFilteredSelected(filteredPathologies, selectedPathologies) ? (
                        <><Square className="h-3 w-3 mr-1" /> Tout désélect.</>
                      ) : (
                        <><CheckSquare className="h-3 w-3 mr-1" /> Tout sélect.</>
                      )}
                    </Button>
                    {hasPathologyFilters && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetPathologyFilters}>
                        <X className="h-3 w-3 mr-1" /> Réinit. filtres
                      </Button>
                    )}
                  </div>

                  <div className="h-40 border rounded-md">
                    {filteredPathologies.length === 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat</p>

                        {/* Global Search Button in Empty State */}
                        <div className="p-2 flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => searchExternalConcepts(searchPathologies, 'pathology')}
                            disabled={searchPathologies.length < 3}
                            className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                          >
                            <Globe className="h-3 w-3 mr-2" />
                            Rechercher "{searchPathologies || '...'}" dans la base mondiale
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Virtuoso
                        style={{ height: '100%' }}
                        data={filteredPathologies}
                        itemContent={(_, p) => (
                          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-sm">
                            <Checkbox
                              id={`pathology-${p.id}`}
                              checked={selectedPathologies.includes(p.id)}
                              onCheckedChange={() => toggleSelection(p.id, selectedPathologies, setSelectedPathologies)}
                            />
                            <label
                              htmlFor={`pathology-${p.id}`}
                              className="text-sm cursor-pointer truncate flex-1 flex items-center gap-2"
                              title={p.name}
                            >
                              {p.name}
                              {p.isExternal && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-0.5">
                                  <Globe className="h-2.5 w-2.5" />
                                  NCBI
                                </Badge>
                              )}
                            </label>
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div>

                {/* Symptômes */}
                <div className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Activity className="h-4 w-4 text-blue-500" />
                      {t('Symptômes')} ({selectedSymptoms.length})
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {filteredSymptoms.length} / {medicalStats?.adverseEvents?.count ? (medicalStats.adverseEvents.count / 1000000).toFixed(1) + 'M' : symptoms.length}
                    </span>
                  </div>

                  {/* Recherche textuelle */}
                  <div className="relative flex gap-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('Rechercher...')}
                        value={searchSymptoms}
                        onChange={(e) => setSearchSymptoms(e.target.value)}
                        className="pl-8 pr-8 h-8 text-sm"

                        onKeyDown={(e) => e.key === 'Enter' && searchExternalConcepts(searchSymptoms, 'symptom')}
                      />
                      {isSearchingWeb && searchSymptoms.length >= 3 && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {searchSymptoms && (
                        <button
                          onClick={() => setSearchSymptoms('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {/* Global Search Trigger in Input */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-blue-500"
                        title="Rechercher dans la base mondiale (OpenFDA)"
                        onClick={() => searchExternalConcepts(searchSymptoms, 'symptom')}
                        disabled={searchSymptoms.length < 3}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>



                  {/* Filtre par système corporel */}
                  <Select value={filterSymptomBodySystem} onValueChange={setFilterSymptomBodySystem}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t('Système corporel')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('Tous systèmes')}</SelectItem>
                      {symptomBodySystems.map(sys => (
                        <SelectItem key={sys} value={sys}>{sys}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Actions groupées */}
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllFiltered(filteredSymptoms, selectedSymptoms, setSelectedSymptoms)}
                    >
                      {areAllFilteredSelected(filteredSymptoms, selectedSymptoms) ? (
                        <><Square className="h-3 w-3 mr-1" /> {t('Tout désélect.')}</>
                      ) : (
                        <><CheckSquare className="h-3 w-3 mr-1" /> {t('Tout sélect.')}</>
                      )}
                    </Button>
                    {hasSymptomFilters && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetSymptomFilters}>
                        <X className="h-3 w-3 mr-1" /> Réinit. filtres
                      </Button>
                    )}
                  </div>

                  <div className="h-40 border rounded-md">
                    {filteredSymptoms.length === 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground text-center py-4">{t('Aucun résultat')}</p>

                        {/* Global Search Button in Empty State */}
                        <div className="p-2 flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => searchExternalConcepts(searchSymptoms, 'symptom')}
                            disabled={searchSymptoms.length < 3}
                            className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                          >
                            <Globe className="h-3 w-3 mr-2" />
                            Rechercher "{searchSymptoms || '...'}" sur OpenFDA
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Virtuoso
                        style={{ height: '100%' }}
                        data={filteredSymptoms}
                        itemContent={(_, s) => (
                          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-sm">
                            <Checkbox
                              id={`symptom-${s.id}`}
                              checked={selectedSymptoms.includes(s.id)}
                              onCheckedChange={() => toggleSelection(s.id, selectedSymptoms, setSelectedSymptoms)}
                            />
                            <label
                              htmlFor={`symptom-${s.id}`}
                              className="text-sm cursor-pointer truncate flex-1 flex items-center gap-2"
                              title={s.name}
                            >
                              {s.name}
                              {s.isExternal && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-0.5">
                                  <Globe className="h-2.5 w-2.5" />
                                  NCBI
                                </Badge>
                              )}
                            </label>
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div>

                {/* Traitements */}
                <div className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Pill className="h-4 w-4 text-green-500" />
                      {t('Traitements')} ({selectedTreatments.length})
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {filteredTreatments.length}/{treatments.length}
                    </span>
                  </div>

                  {/* Recherche textuelle */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('Rechercher...')}
                      value={searchTreatments}
                      onChange={(e) => setSearchTreatments(e.target.value)}
                      className="pl-8 pr-8 h-8 text-sm"
                    />
                    {searchTreatments && (
                      <button
                        onClick={() => setSearchTreatments('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Filtre par type de traitement */}
                  <Select value={filterTreatmentType} onValueChange={setFilterTreatmentType}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t('Type de traitement')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('Tous types')}</SelectItem>
                      {treatmentTypes.map(type => (
                        <SelectItem key={type} value={type}>{getTreatmentTypeLabel(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Actions groupées */}
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllFiltered(filteredTreatments, selectedTreatments, setSelectedTreatments)}
                    >
                      {areAllFilteredSelected(filteredTreatments, selectedTreatments) ? (
                        <><Square className="h-3 w-3 mr-1" /> {t('Tout désélect.')}</>
                      ) : (
                        <><CheckSquare className="h-3 w-3 mr-1" /> {t('Tout sélect.')}</>
                      )}
                    </Button>
                    {hasTreatmentFilters && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetTreatmentFilters}>
                        <X className="h-3 w-3 mr-1" /> Réinit. filtres
                      </Button>
                    )}
                  </div>

                  <div className="h-40 border rounded-md">
                    {filteredTreatments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('Aucun résultat')}</p>
                    ) : (
                      <Virtuoso
                        style={{ height: '100%' }}
                        data={filteredTreatments}
                        itemContent={(_, tr) => (
                          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-sm">
                            <Checkbox
                              id={`treatment-${tr.id}`}
                              checked={selectedTreatments.includes(tr.id)}
                              onCheckedChange={() => toggleSelection(tr.id, selectedTreatments, setSelectedTreatments)}
                            />
                            <label
                              htmlFor={`treatment-${tr.id}`}
                              className="text-sm cursor-pointer truncate flex-1"
                              title={tr.name}
                            >
                              {tr.name}
                            </label>
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div>

                {/* Médicaments */}
                <div className="space-y-2 border rounded-lg p-3 border-orange-500/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Tablets className="h-4 w-4 text-orange-500" />
                      {t('Médicaments')} ({selectedMedications.length})
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {filteredMedications.length} / {medicalStats?.medications?.count ? (medicalStats.medications.count / 1000).toFixed(0) + 'k' : medications.length}
                    </span>
                  </div>

                  {/* Recherche textuelle */}
                  <div className="relative flex gap-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('Nom ou substance...')}
                        value={searchMedications}
                        onChange={(e) => setSearchMedications(e.target.value)}
                        className="pl-8 pr-8 h-8 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && searchExternalConcepts(searchMedications, 'medication')}
                      />
                      {isSearchingWeb && searchMedications.length >= 3 && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {searchMedications && (
                        <button
                          onClick={() => setSearchMedications('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {/* Global Search Trigger in Input */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-blue-500"
                        title="Rechercher dans la base mondiale (DrugBank)"
                        onClick={() => searchExternalConcepts(searchMedications, 'medication')}
                        disabled={searchMedications.length < 3}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Filtre par groupe ATC */}
                  <Select value={filterMedicationAtc} onValueChange={setFilterMedicationAtc}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t('Groupe ATC')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('Tous groupes ATC')}</SelectItem>
                      {medicationAtcCodes.map(code => (
                        <SelectItem key={code} value={code}>{getAtcGroupLabel(code)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Actions groupées */}
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllFiltered(filteredMedications, selectedMedications, setSelectedMedications)}
                    >
                      {areAllFilteredSelected(filteredMedications, selectedMedications) ? (
                        <><Square className="h-3 w-3 mr-1" /> {t('Tout désélect.')}</>
                      ) : (
                        <><CheckSquare className="h-3 w-3 mr-1" /> {t('Tout sélect.')}</>
                      )}
                    </Button>
                    {hasMedicationFilters && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetMedicationFilters}>
                        <X className="h-3 w-3 mr-1" /> Réinit. filtres
                      </Button>
                    )}
                  </div>

                  <div className="h-40 border rounded-md">
                    {filteredMedications.length === 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {medications.length === 0 ? t('Scrapez Compendium.ch pour ajouter des médicaments') : t('Aucun résultat')}
                        </p>

                        {/* Global Search Button in Empty State */}
                        <div className="p-2 flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => searchExternalConcepts(searchMedications, 'medication')}
                            disabled={searchMedications.length < 3}
                            className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                          >
                            <Globe className="h-3 w-3 mr-2" />
                            Rechercher "{searchMedications || '...'}" sur DrugBank
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Virtuoso
                        style={{ height: '100%' }}
                        data={filteredMedications}
                        itemContent={(_, m) => (
                          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-sm">
                            <Checkbox
                              id={`medication-${m.id}`}
                              checked={selectedMedications.includes(m.id)}
                              onCheckedChange={() => toggleSelection(m.id, selectedMedications, setSelectedMedications)}
                            />
                            <label
                              htmlFor={`medication-${m.id}`}
                              className="text-sm cursor-pointer truncate flex-1"
                              title={`${m.name}${m.substance ? ` (${m.substance})` : ''}`}
                            >
                              {m.name}
                              {m.atc_code && <span className="text-xs text-muted-foreground ml-1">[{m.atc_code}]</span>}
                              {m.isExternal && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-0.5 ml-1">
                                  <Globe className="h-2.5 w-2.5" />
                                  NCBI
                                </Badge>
                              )}
                            </label>
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div >
              </div >

              {/* Bouton d'analyse */}
              < div className="flex items-center justify-between" >
                <p className="text-sm text-muted-foreground">
                  {getTotalSelected()} {t('élément(s) sélectionné(s)')} • {t('Recherche web incluse')}
                </p>
                <Button
                  onClick={runAnalysis}
                  disabled={analyzing || getTotalSelected() < 2}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Analyser les liens
                    </>
                  )}
                </Button>
              </div >

              {analysisProgress && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>{analysisProgress.message || 'Analyse IA en cours...'}</span>
                    <span className="font-medium text-foreground">{analysisProgress.progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(5, Math.min(100, analysisProgress.progress))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Erreur */}
              {
                error && (
                  <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )
              }

              {/* Résultats */}
              {
                result && (
                  <div className="space-y-6 pt-4 border-t">
                    {/* Résumé */}
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Résumé de l'analyse</h4>
                      <p className="text-sm text-muted-foreground">{result.summary}</p>
                    </div>

                    {result.schemaComparison && (
                      <SchemaComparisonPanel comparison={result.schemaComparison} />
                    )}

                    <TreatmentSchemaGenerator
                      hasSchemas={(result.treatmentSchemas?.length || 0) > 0}
                      isGenerating={generatingTreatmentSchemas}
                      onGenerate={runTreatmentSchemaGeneration}
                    />

                    {result.treatmentSchemas && result.treatmentSchemas.length > 0 && (
                      <TreatmentSchemasPanel schemas={result.treatmentSchemas} />
                    )}

                    {result.alternatives && result.alternatives.length > 0 && (
                      <AlternativesPanel alternatives={result.alternatives} />
                    )}

                    {/* Liens de causalité */}
                    {result.causalLinks && result.causalLinks.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          Liens de causalité détectés
                        </h4>
                        <div className="space-y-3">
                          {result.causalLinks.map((link, index) => (
                            <CausalLinkCard key={index} link={link} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recherche web */}
                    {result.webResearch && result.webResearch.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2 text-blue-600 dark:text-blue-400">
                          <BookOpen className="h-4 w-4" />
                          Recherche scientifique (PubMed)
                        </h4>
                        <div className="space-y-3">
                          {result.webResearch.map((research, index) => (
                            <div key={index} className="p-3 border rounded-lg bg-muted/30">
                              <p className="text-sm font-medium mb-2">Recherche : "{research.query}"</p>
                              {research.findings && research.findings.length > 0 && (
                                <ul className="space-y-1 mb-2">
                                  {research.findings.map((finding, fIndex) => (
                                    <li key={fIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                      {finding}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {research.sources && research.sources.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {research.sources.map((source, sIndex) => (
                                    <a
                                      key={sIndex}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      {source.title.slice(0, 50)}...
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Avertissements */}
                    {result.warnings && result.warnings.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                          <AlertTriangle className="h-4 w-4" />
                          Avertissements
                        </h4>
                        <ul className="space-y-1">
                          {result.warnings.map((warning, index) => (
                            <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommandations */}
                    {result.recommendations && result.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          Recommandations
                        </h4>
                        <ul className="space-y-1">
                          {result.recommendations.map((rec, index) => (
                            <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                              <HelpCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              }

              {/* Matrice des Relations */}
              <RelationshipMatrix
                pathologies={pathologies}
                symptoms={symptoms}
                treatments={treatments}
                medications={medications}
                selectedPathologies={selectedPathologies}
                selectedSymptoms={selectedSymptoms}
                selectedTreatments={selectedTreatments}
                selectedMedications={selectedMedications}
                analysisResult={result}
              />
            </>
          )}
        </CardContent >
      </Card >
    </div >
  );
};

const getProbabilityBadge = (probability: string) => {
  switch (probability) {
    case 'high':
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Forte</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Moyenne</Badge>;
    case 'low':
      return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Faible</Badge>;
    default:
      return <Badge variant="secondary">{probability}</Badge>;
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'symptom':
      return <Activity className="h-4 w-4 text-blue-500" />;
    case 'pathology':
      return <Stethoscope className="h-4 w-4 text-purple-500" />;
    case 'treatment':
      return <Pill className="h-4 w-4 text-green-500" />;
    case 'medication':
      return <Tablets className="h-4 w-4 text-orange-500" />;
    default:
      return null;
  }
};

const getDangerBadge = (dangerLevel?: CausalLink['dangerLevel']) => {
  switch (dangerLevel) {
    case 'critical':
      return <Badge className="bg-red-600 text-white border-red-700">Critique</Badge>;
    case 'high':
      return <Badge className="bg-orange-500 text-white border-orange-600">Élevé</Badge>;
    case 'moderate':
      return <Badge className="bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/30">Modéré</Badge>;
    case 'low':
      return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30">Faible</Badge>;
    default:
      return null;
  }
};

const getInteractionLabel = (interactionType?: CausalLink['interactionType']) => {
  switch (interactionType) {
    case 'drug-drug':
      return 'Interaction médicament-médicament';
    case 'drug-treatment':
      return 'Interaction médicament-traitement';
    case 'pathology-danger':
      return 'Risque lié à la pathologie';
    default:
      return null;
  }
};

const getSymptomFrequencyLabel = (frequency?: CausalLink['symptomFrequency']) => {
  switch (frequency) {
    case 'principal':
      return 'Symptôme cardinal';
    case 'frequent':
      return 'Symptôme fréquent';
    case 'possible':
      return 'Symptôme possible';
    case 'rare':
      return 'Symptôme rare';
    default:
      return null;
  }
};

function SchemaComparisonPanel({ comparison }: { comparison: SchemaComparison }) {
  const improvement = comparison.improvementPercent > 0 ? `+${comparison.improvementPercent}%` : `${comparison.improvementPercent}%`;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Score bénéfice/risque
          </h4>
          <p className="text-sm text-muted-foreground mt-1">{comparison.clinicalSummary}</p>
        </div>
        <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">
          {improvement} amélioration
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ScoreTile label="Actuel" value={`${comparison.currentScore}/100`} tone="muted" />
        <ScoreTile label="Proposé" value={`${comparison.proposedScore}/100`} tone="success" />
        <ScoreTile label="Risques rouges" value={`${comparison.currentStats.redLinks} → ${comparison.proposedStats.redLinks}`} tone="danger" />
        <ScoreTile label="Ratio B/R" value={`${comparison.benefitRiskRatio.current} → ${comparison.benefitRiskRatio.proposed}`} tone="success" />
      </div>

      {comparison.proposedChanges.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Changements proposés</p>
          <div className="space-y-2">
            {comparison.proposedChanges.slice(0, 4).map((change, index) => (
              <div key={`${change.target}-${index}`} className="rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline">{change.action === 'replace' ? 'Remplacer' : change.action === 'remove' ? 'Retirer' : 'Ajouter'}</Badge>
                  <span className="text-sm font-medium">{change.target}</span>
                  {change.replacement && (
                    <>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">{change.replacement}</span>
                    </>
                  )}
                  <Badge className="bg-primary/10 text-primary border-primary/20">+{change.improvementScore}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{change.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreTile({ label, value, tone }: { label: string; value: string; tone: 'muted' | 'success' | 'danger' }) {
  const toneClass = tone === 'success'
    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
    : tone === 'danger'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-border bg-muted/30 text-foreground';

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function AlternativesPanel({ alternatives }: { alternatives: Alternative[] }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h4 className="font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <CheckCircle2 className="h-4 w-4" />
        Alternatives thérapeutiques à examiner
      </h4>
      <div className="grid gap-3 md:grid-cols-2">
        {alternatives.map((alternative, index) => (
          <div key={`${alternative.for}-${index}`} className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{alternative.forType}</Badge>
              <span className="text-sm font-medium">{alternative.for}</span>
            </div>
            <p className="text-sm text-muted-foreground">{alternative.reason}</p>
            <div className="flex flex-wrap gap-2">
              {alternative.suggestions.map((suggestion) => (
                <Badge key={suggestion} className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">
                  {suggestion}
                </Badge>
              ))}
            </div>
            {alternative.evidence && (
              <p className="text-xs text-muted-foreground border-l-2 pl-2">{alternative.evidence}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TreatmentSchemaGenerator({
  hasSchemas,
  isGenerating,
  onGenerate,
}: {
  hasSchemas: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h4 className="font-medium flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Schémas thérapeutiques alternatifs
        </h4>
        <p className="text-sm text-muted-foreground mt-1">
          Génération dédiée après l’analyse initiale avec GPT-5.5 Pro et raisonnement xhigh.
        </p>
      </div>
      <Button onClick={onGenerate} disabled={isGenerating} className="shrink-0">
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Génération...
          </>
        ) : (
          <>
            <Brain className="h-4 w-4 mr-2" />
            {hasSchemas ? 'Régénérer les schémas' : 'Générer les schémas'}
          </>
        )}
      </Button>
    </div>
  );
}

function TreatmentSchemasPanel({ schemas }: { schemas: TreatmentSchema[] }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h4 className="font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4" />
        Schémas alternatifs proposés
      </h4>
      <div className="space-y-4">
        {schemas.map((schema, index) => (
          <div key={`${schema.title}-${index}`} className="rounded-md border bg-muted/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={
                schema.priority === 'preferred'
                  ? 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30'
                  : schema.priority === 'cautious'
                    ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30'
                    : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30'
              }>
                {schema.priority === 'preferred' ? 'Préféré' : schema.priority === 'cautious' ? 'Prudent' : 'Alternative'}
              </Badge>
              <span className="font-medium">{schema.title}</span>
              <Badge variant="outline">Confiance {schema.confidence === 'high' ? 'forte' : schema.confidence === 'medium' ? 'moyenne' : 'faible'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{schema.rationale}</p>

            <div className="space-y-2">
              {schema.steps.map((step, stepIndex) => (
                <div key={`${step.target}-${stepIndex}`} className="rounded-md border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline">
                      {step.action === 'replace' ? 'Remplacer' :
                        step.action === 'remove' ? 'Retirer' :
                          step.action === 'add' ? 'Ajouter' :
                            step.action === 'keep' ? 'Conserver' : 'Surveiller'}
                    </Badge>
                    <span className="text-sm font-medium">{step.target}</span>
                    {step.replacement && (
                      <>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">{step.replacement}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.rationale}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SchemaList title="Bénéfices attendus" items={schema.expectedBenefits} />
              <SchemaList title="Risques résiduels" items={schema.residualRisks} />
              <SchemaList title="Surveillance" items={schema.monitoringPlan} />
            </div>

            {schema.patientWarnings.length > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Points patient
                </p>
                <ul className="mt-2 space-y-1">
                  {schema.patientWarnings.map((warning) => (
                    <li key={warning} className="text-sm text-muted-foreground">• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemaList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="text-xs text-muted-foreground">• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Non précisé</p>
      )}
    </div>
  );
}

// Composant Carte rétractable pour un lien de causalité
function CausalLinkCard({ link }: { link: CausalLink }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const appropriatenessLabel = getAppropriatenessBadgeLabel(link);

  return (
    <div
      className={`border rounded-lg bg-card transition-all ${link.dangerLevel === 'critical' || link.dangerLevel === 'high' ? 'border-destructive/60 bg-destructive/5' :
        link.dangerLevel === 'moderate' ? 'border-orange-500/50 bg-orange-500/5' :
          isAppropriatenessSuccess(link) ? 'border-green-500/50 bg-green-500/5' :
        isAppropriatenessWarning(link) ? 'border-destructive/50 bg-destructive/5' :
          link.effectType === 'both' ? 'border-orange-500/50 bg-orange-500/5' :
            link.effectType === 'therapeutic' ? 'border-green-500/30' :
              link.effectType === 'adverse' ? 'border-destructive/30' : ''
        }`}
    >
      {/* En-tête cliquable */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-t-lg transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap flex-1 mr-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded">
            {getTypeIcon(link.fromType)}
            <span className="text-sm font-medium">{link.from}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded">
            {getTypeIcon(link.toType)}
            <span className="text-sm font-medium">{link.to}</span>
          </div>

          {getProbabilityBadge(link.probability)}

          {/* Badges résumés */}
          {supportsAppropriatenessBadge(link) && (
            link.isAppropriate ? (
              <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 flex items-center gap-1 h-6">
                <CheckCircle2 className="h-3 w-3" />
                {appropriatenessLabel}
              </Badge>
            ) : (
              <Badge className="bg-destructive/20 text-destructive border-destructive/30 flex items-center gap-1 h-6">
                <XCircle className="h-3 w-3" />
                {appropriatenessLabel}
              </Badge>
            )
          )}

          {link.effectType === 'therapeutic' && (
            <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 flex items-center gap-1 h-6">Traite</Badge>
          )}
          {link.effectType === 'adverse' && (
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 flex items-center gap-1 h-6">Risque</Badge>
          )}

          {getDangerBadge(link.dangerLevel)}

          {link.interactionType && (
            <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30 h-6">
              {getInteractionLabel(link.interactionType)}
            </Badge>
          )}

          {link.symptomFrequency && (
            <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30 h-6">
              {getSymptomFrequencyLabel(link.symptomFrequency)}
            </Badge>
          )}
        </div>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Détails dépliables */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="h-px bg-border/50 mb-3" />

          <p className="text-sm font-medium text-primary">{link.relationship}</p>

          {(link.effectType === 'therapeutic' || link.effectType === 'both') && link.therapeuticDetails && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                Effet thérapeutique
              </div>
              <p className="text-sm text-muted-foreground">{link.therapeuticDetails}</p>
            </div>
          )}

          {(link.effectType === 'adverse' || link.effectType === 'both') && link.adverseDetails && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
                <AlertTriangle className="h-4 w-4" />
                Effet indésirable potentiel
              </div>
              <p className="text-sm text-muted-foreground">{link.adverseDetails}</p>
            </div>
          )}

          {(link.dangerLevel || link.interactionType || link.symptomFrequency) && (
            <div className="grid gap-2 md:grid-cols-3">
              {link.dangerLevel && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Niveau de risque</p>
                  <div className="mt-1">{getDangerBadge(link.dangerLevel)}</div>
                </div>
              )}
              {link.interactionType && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Type d'interaction</p>
                  <p className="text-sm font-medium mt-1">{getInteractionLabel(link.interactionType)}</p>
                </div>
              )}
              {link.symptomFrequency && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Fréquence clinique</p>
                  <p className="text-sm font-medium mt-1">{getSymptomFrequencyLabel(link.symptomFrequency)}</p>
                </div>
              )}
            </div>
          )}

          {!link.effectType && link.evidence && (
            <p className="text-sm text-muted-foreground italic border-l-2 pl-3 border-muted">{link.evidence}</p>
          )}

          {link.effectType && link.evidence && !link.therapeuticDetails && !link.adverseDetails && (
            <p className="text-sm text-muted-foreground italic border-l-2 pl-3 border-muted">{link.evidence}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
            {link.patientCount > 0 && (
              <span>Observé chez {link.patientCount} patient(s)</span>
            )}
            {link.webSources && link.webSources.length > 0 && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {link.webSources.length} source(s) web
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



export default CrossDataAnalyzer;
