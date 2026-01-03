/**
 * PatientDossierLayout - Main orchestrator for the new patient dossier UI
 * 
 * Layout:
 * - Left: Summary panel + Category menu
 * - Center: Digital Twin 3D (full height)
 * - Right side: AI Health Synthesis + Document Gallery
 * - Floating: Category cards (draggable)
 */

import { useState, useMemo, useCallback } from 'react';
import { Hospital, Users, AlertTriangle, Pill, Syringe, Activity, Heart, FlaskConical, Image, Stethoscope, Baby, Brain, Home, Shield, Smile, FileText, MessageSquare, LineChart, UserCircle } from 'lucide-react';
import PatientSummaryPanel from './PatientSummaryPanel';
import CategoryMenu, { CategoryKey, CATEGORIES } from './CategoryMenu';
import FloatingCard from './FloatingCard';
import DigitalTwin3DViewer from '../DigitalTwin3DViewer';
import PatientHealthSynthesis from '../PatientHealthSynthesis';
import DocumentGallery from '../DocumentGallery';
import AIAssistant from '../AIAssistant';
import { MedicalHistoryCard, FamilyHistoryCard, AllergiesCard, MedicationsCard, VaccinationsCard, LifestyleCard, LabResultsCard, ClinicalDataCard, ImagingCard, FunctionalExamsCard, PreventionCard, ConsultationsCard, MentalHealthCard, ReproductiveHealthCard, SocialFactorsCard, DentalCard, CommunicationsCard, MonitoringCard, AgeSpecificCard, GenericDataCard } from './cards';
import { SideEffectAlertPanel } from '../SideEffectAlertPanel';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PatientDossierLayoutProps {
    patientId: string;
    patient: {
        id: string;
        patient_id?: string;
        first_name: string;
        last_name: string;
        date_of_birth: string;
        gender: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        postal_code?: string;
        pathologies?: { name: string };
        // For AI Assistant
        age?: number;
        height_cm?: number;
        weight_kg?: number;
        treatment?: string;
        medical_notes_nlp?: string;
        lab_results_json?: any;
        medications?: any[];
        vaccinations?: any[];
        allergies?: any[];
        medical_history?: any[];
        consultations?: any[];
        mental_health?: any[];
        reproductive_health?: any[];
        clinical_data?: any[];
        lab_results_data?: any[];
    };
    alerts: any[];
}

const PatientDossierLayout = ({ patientId, patient, alerts }: PatientDossierLayoutProps) => {
    const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Mobile navigation state
    const [mobileTab, setMobileTab] = useState<'twin' | 'summary' | 'menu' | 'docs' | 'ai'>('twin');

    const handleSelectCategory = (category: CategoryKey) => {
        setActiveCategory(activeCategory === category ? null : category);
    };

    const handleCloseCard = () => {
        setActiveCategory(null);
    };

    // Callback when document data is integrated - refresh data
    const handleDocumentIntegrated = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    // Get category config for active card
    const activeCategoryConfig = useMemo(() => {
        return CATEGORIES.find(c => c.key === activeCategory);
    }, [activeCategory]);

    // Render card content based on category
    const renderCardContent = () => {
        if (!activeCategory) return null;

        switch (activeCategory) {
            case 'medical_history':
                return <MedicalHistoryCard patientId={patientId} />;
            case 'family_history':
                return <FamilyHistoryCard patientId={patientId} />;
            case 'allergies':
                return <AllergiesCard patientId={patientId} />;
            case 'medications':
                return <MedicationsCard patientId={patientId} />;
            case 'vaccinations':
                return <VaccinationsCard patientId={patientId} />;
            case 'lifestyle':
                return <LifestyleCard patientId={patientId} />;
            case 'clinical_data':
                return <ClinicalDataCard patientId={patientId} />;
            case 'lab_results':
                return <LabResultsCard patientId={patientId} />;
            case 'imaging':
                return <ImagingCard patientId={patientId} />;
            case 'functional_exams':
                return <FunctionalExamsCard patientId={patientId} />;
            case 'prevention':
                return <PreventionCard patientId={patientId} />;
            case 'reproductive':
                return <ReproductiveHealthCard patientId={patientId} />;
            case 'mental_health':
                return <MentalHealthCard patientId={patientId} />;
            case 'social_factors':
                return <SocialFactorsCard patientId={patientId} />;
            case 'consultations':
                return <ConsultationsCard patientId={patientId} />;
            case 'communications':
                return <CommunicationsCard patientId={patientId} />;
            case 'monitoring':
                return <MonitoringCard patientId={patientId} />;
            case 'age_specific':
                return <AgeSpecificCard patientId={patientId} />;
            case 'dental':
                return <DentalCard patientId={patientId} />;
            case 'documents':
                return (
                    <GenericDataCard
                        patientId={patientId}
                        table="patient_documents"
                        titleField="file_name"
                        dateField="created_at"
                        descriptionField="category"
                        emptyIcon={<FileText className="h-8 w-8 mx-auto opacity-50" />}
                        emptyText="Aucun document"
                    />
                );
            case 'side_effects':
                return <SideEffectAlertPanel patientId={patientId} />;
            default:
                return (
                    <div className="py-8 text-center text-muted-foreground">
                        <p>Section en développement</p>
                        <p className="text-xs mt-2">Cette catégorie sera bientôt disponible</p>
                    </div>
                );
        }
    };

    // Render mobile content based on active tab
    const renderMobileContent = () => {
        switch (mobileTab) {
            case 'twin':
                return (
                    <div className="h-full">
                        <DigitalTwin3DViewer
                            alerts={alerts}
                            pathologyName={patient.pathologies?.name}
                        />
                    </div>
                );
            case 'summary':
                return (
                    <ScrollArea className="h-full">
                        <div className="p-4 space-y-4">
                            <PatientSummaryPanel patientId={patientId} patient={patient} />
                            <PatientHealthSynthesis key={refreshKey} patientId={patientId} />
                        </div>
                    </ScrollArea>
                );
            case 'menu':
                return (
                    <ScrollArea className="h-full">
                        <div className="p-4">
                            <CategoryMenu
                                activeCategory={activeCategory}
                                onSelectCategory={handleSelectCategory}
                                accordionMode={true}
                                renderContent={(category) => (
                                    <div key={`${category}-${refreshKey}`}>
                                        {renderCardContent()}
                                    </div>
                                )}
                            />
                        </div>
                    </ScrollArea>
                );
            case 'docs':
                return (
                    <ScrollArea className="h-full">
                        <div className="p-4">
                            <DocumentGallery
                                patientId={patientId}
                                onDocumentIntegrated={handleDocumentIntegrated}
                            />
                        </div>
                    </ScrollArea>
                );
            case 'ai':
                return (
                    <div className="h-full p-4">
                        <AIAssistant
                            patient={{
                                ...patient,
                                patient_id: patient.patient_id || patient.id,
                                lab_results_json: patient.lab_results_json || {},
                                alerts: alerts,
                                bmi: patient.height_cm && patient.weight_kg
                                    ? Math.round((patient.weight_kg / ((patient.height_cm / 100) ** 2)) * 10) / 10
                                    : undefined,
                                // Relayer les données réelles de la DB
                                medications: (patient as any).medications,
                                vaccinations: (patient as any).vaccinations,
                                allergies: (patient as any).allergies,
                                medical_history: (patient as any).medical_history,
                                consultations: (patient as any).consultations,
                                mental_health: (patient as any).mental_health,
                                reproductive_health: (patient as any).reproductive_health,
                                clinical_data: (patient as any).clinical_data,
                                lab_results_data: (patient as any).lab_results_data,
                            } as any}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <>
            {/* Desktop Layout - Hidden on mobile */}
            <div className="hidden lg:flex h-[calc(100vh-120px)] gap-4">
                {/* Left Panel - Summary + Categories + Documents */}
                <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto">
                    <div className="shrink-0">
                        <PatientSummaryPanel patientId={patientId} patient={patient} />
                    </div>
                    <div className="shrink-0">
                        <CategoryMenu
                            activeCategory={activeCategory}
                            onSelectCategory={handleSelectCategory}
                        />
                    </div>
                    {/* Document Gallery - compact under menu */}
                    <div className="shrink-0">
                        <DocumentGallery
                            patientId={patientId}
                            onDocumentIntegrated={handleDocumentIntegrated}
                        />
                    </div>
                </div>

                {/* Center - Digital Twin (full height) */}
                <div className="flex-1 min-w-0">
                    <DigitalTwin3DViewer
                        alerts={alerts}
                        pathologyName={patient.pathologies?.name}
                    />
                </div>

                {/* Right Panel - AI Health Synthesis + AI Assistant */}
                <div className="w-80 shrink-0 flex flex-col gap-4">
                    <div className="shrink-0">
                        <PatientHealthSynthesis
                            key={refreshKey}
                            patientId={patientId}
                        />
                    </div>
                    <div className="shrink-0">
                        <AIAssistant
                            patient={{
                                ...patient,
                                patient_id: patient.patient_id || patient.id,
                                lab_results_json: patient.lab_results_json || {},
                                alerts: alerts,
                                bmi: patient.height_cm && patient.weight_kg
                                    ? Math.round((patient.weight_kg / ((patient.height_cm / 100) ** 2)) * 10) / 10
                                    : undefined,
                            } as any}
                        />
                    </div>
                </div>

                {/* Floating Cards - Desktop only */}
                {activeCategory && activeCategoryConfig && (
                    <FloatingCard
                        title={activeCategoryConfig.label}
                        icon={activeCategoryConfig.icon}
                        isOpen={!!activeCategory}
                        onClose={handleCloseCard}
                        initialPosition={{ x: 320, y: 100 }}
                    >
                        <div key={refreshKey} className="h-full">
                            {renderCardContent()}
                        </div>
                    </FloatingCard>
                )}
            </div>

            {/* Mobile Layout - Shown only on mobile */}
            <div className="lg:hidden flex flex-col h-[calc(100vh-140px)]">
                {/* Mobile Content Area */}
                <div className="flex-1 overflow-hidden">
                    {renderMobileContent()}
                </div>

                {/* Mobile Bottom Navigation */}
                <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-around h-16 pb-safe">
                        {[
                            { key: 'twin' as const, icon: Activity, label: 'Twin' },
                            { key: 'summary' as const, icon: Heart, label: 'Résumé' },
                            { key: 'menu' as const, icon: Hospital, label: 'Menu' },
                            { key: 'docs' as const, icon: Image, label: 'Docs' },
                            { key: 'ai' as const, icon: Brain, label: 'IA' },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = mobileTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setMobileTab(tab.key)}
                                    className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 touch-manipulation transition-colors relative ${isActive
                                        ? 'text-primary'
                                        : 'text-slate-500 dark:text-slate-400'
                                        }`}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                                    <span className={`text-[10px] font-medium`}>
                                        {tab.label}
                                    </span>
                                    {isActive && (
                                        <div className="absolute bottom-1 w-8 h-0.5 bg-primary rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </>
    );
};

export default PatientDossierLayout;

