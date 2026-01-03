import { useState, useEffect } from 'react';
import { Image } from 'lucide-react';
import PatientSummaryPanel from './PatientSummaryPanel';
import CategoryMenu, { PatientCategory } from './CategoryMenu';
import DigitalTwin3DViewer from '../DigitalTwin3DViewer';
import PatientHealthSynthesis from '../PatientHealthSynthesis';
import DocumentGallery from '../DocumentGallery';
import AIAssistant from '../AIAssistant';
import { usePatientAlerts } from '@/hooks/usePatientAlerts';
import { Responsive as ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import AppWindow from './AppWindow';

// Styles requis pour le grid layout
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface PatientDossierLayoutProps {
    patientId: string;
    patient: any;
}

interface WindowData {
    id: string;
    title: string;
    category: PatientCategory;
    zIndex: number;
    initialY: number;
}

const PatientDossierLayout = ({ patientId, patient }: PatientDossierLayoutProps) => {
    const { containerRef, width } = useContainerWidth();
    const [activeCategory, setActiveCategory] = useState<PatientCategory>('summary');
    const [refreshKey, setRefreshKey] = useState(0);
    const [openWindows, setOpenWindows] = useState<WindowData[]>([]);
    const [maxZIndex, setMaxZIndex] = useState(100);

    const patientAlerts = usePatientAlerts(
        patient.lab_results_json || {},
        (patient as any).medications?.map((m: any) => m.drug_name).join(', ') || '',
        '', // Notes médicales supplémentaires
        patient.pathologies?.name,
        (patient as any).medical_history
    ) || [];

    const handleSelectCategory = (category: PatientCategory, yPosition?: number) => {
        const existing = openWindows.find(w => w.category === category);
        if (existing) {
            focusWindow(existing.id);
            return;
        }

        // Calcul de la position Y relative
        const scrollY = window.scrollY;
        const targetY = (yPosition || 100) + scrollY - 200; // Ajustement pour centrer un peu plus

        const newWindow: WindowData = {
            id: `win-${category}-${Date.now()}`,
            title: category.replace('_', ' ').charAt(0).toUpperCase() + category.replace('_', ' ').slice(1),
            category: category,
            zIndex: maxZIndex + 1,
            initialY: Math.max(targetY, 100)
        };

        setMaxZIndex(prev => prev + 1);
        setOpenWindows(prev => [...prev, newWindow]);
        setActiveCategory(category);
    };

    const closeWindow = (id: string) => {
        setOpenWindows(prev => prev.filter(w => w.id !== id));
    };

    const focusWindow = (id: string) => {
        setOpenWindows(prev => prev.map(w =>
            w.id === id ? { ...w, zIndex: maxZIndex + 1 } : w
        ));
        setMaxZIndex(prev => prev + 1);
    };

    const handleDocumentIntegrated = () => {
        setRefreshKey(prev => prev + 1);
    };

    const layouts = {
        lg: [
            { i: 'summary', x: 0, y: 0, w: 3, h: 4 },
            { i: 'digital-twin', x: 3, y: 0, w: 6, h: 10 },
            { i: 'ai-synthesis', x: 9, y: 0, w: 3, h: 6 },
            { i: 'documents', x: 0, y: 4, w: 3, h: 8 },
            { i: 'ai-assistant', x: 9, y: 6, w: 3, h: 10 },
        ]
    };

    return (
        <div className="relative min-h-[1200px] pb-20">
            {/* Main Menu - Fixed on the left */}
            <div className="fixed left-4 top-24 z-20 w-64 hidden xl:block">
                <div className="flex flex-col gap-6">
                    <div className="shrink-0 bg-background/40 backdrop-blur-md rounded-2xl border border-border/30 overflow-hidden shadow-xl">
                        <PatientSummaryPanel patientId={patientId} patient={patient} />
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur-md p-2 shadow-2xl">
                        <CategoryMenu
                            activeCategory={activeCategory}
                            onSelectCategory={handleSelectCategory}
                        />
                    </div>
                </div>
            </div>

            {/* Dashboard Area */}
            <div ref={containerRef} className="xl:ml-72 flex-1 pt-4 px-4 overflow-x-hidden">
                {width > 0 && (
                    <ResponsiveGridLayout
                        className="layout"
                        layouts={layouts}
                        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                        rowHeight={50}
                        draggableHandle=".drag-handle"
                        margin={[24, 24]}
                        width={width}
                    >
                        {/* Summary Block */}
                        <div key="summary" className="bg-card/20 rounded-2xl border border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                            <div className="drag-handle h-8 bg-muted/20 cursor-move flex items-center justify-center shrink-0">
                                <div className="w-12 h-1 bg-primary/30 rounded-full"></div>
                            </div>
                            <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 px-2">Aperçu Médical</div>
                                <PatientSummaryPanel patientId={patientId} patient={patient} />
                            </div>
                        </div>

                        {/* Digital Twin */}
                        <div key="digital-twin" className="bg-background/20 rounded-2xl border border-border/50 overflow-hidden relative shadow-lg group">
                            <div className="drag-handle absolute top-0 left-0 right-0 h-10 z-10 bg-gradient-to-b from-background/90 to-transparent cursor-move opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-16 h-1 bg-primary/40 rounded-full"></div>
                            </div>
                            <DigitalTwin3DViewer
                                alerts={patientAlerts}
                                pathologyName={patient.pathologies?.name}
                            />
                        </div>

                        {/* AI Synthesis */}
                        <div key="ai-synthesis" className="bg-card/20 rounded-2xl border border-border/50 overflow-hidden shadow-sm flex flex-col">
                            <div className="drag-handle h-8 bg-muted/20 cursor-move flex items-center justify-center shrink-0">
                                <div className="w-12 h-1 bg-primary/30 rounded-full"></div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <PatientHealthSynthesis
                                    key={refreshKey}
                                    patientId={patientId}
                                />
                            </div>
                        </div>

                        {/* Document Gallery */}
                        <div key="documents" className="bg-card/20 rounded-2xl border border-border/50 overflow-hidden flex flex-col shadow-sm">
                            <div className="drag-handle px-6 py-4 border-b border-border/20 bg-muted/10 flex items-center justify-between cursor-move">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-3 opacity-80">
                                    <Image className="h-4 w-4 text-primary" />
                                    Archive Documentaire
                                </h3>
                                <div className="w-8 h-1 bg-primary/20 rounded-full"></div>
                            </div>
                            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                                <DocumentGallery
                                    patientId={patientId}
                                    onDocumentIntegrated={handleDocumentIntegrated}
                                />
                            </div>
                        </div>

                        {/* AI Assistant */}
                        <div key="ai-assistant" className="border border-border/50 rounded-3xl overflow-hidden shadow-2xl bg-background/40 flex flex-col">
                            <div className="drag-handle h-8 bg-muted/20 cursor-move flex items-center justify-center shrink-0">
                                <div className="w-12 h-1 bg-primary/30 rounded-full"></div>
                            </div>
                            <div className="flex-1 min-h-0">
                                <AIAssistant
                                    patient={{
                                        ...patient,
                                        patient_id: patient.patient_id || patient.id,
                                        lab_results_json: patient.lab_results_json || {},
                                        alerts: patientAlerts,
                                        bmi: patient.height_cm && patient.weight_kg
                                            ? Math.round((patient.weight_kg / ((patient.height_cm / 100) ** 2)) * 10) / 10
                                            : undefined,
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
                        </div>
                    </ResponsiveGridLayout>
                )}
            </div>

            {/* Floating Windows System */}
            {openWindows.map((win, index) => (
                <AppWindow
                    key={win.id}
                    id={win.id}
                    title={win.title}
                    zIndex={win.zIndex}
                    defaultPosition={{ x: 400 + (index * 40), y: win.initialY + (index * 20) }}
                    onClose={() => closeWindow(win.id)}
                    onFocus={() => focusWindow(win.id)}
                >
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {win.category === 'documents' ? (
                            <div className="p-2">
                                <DocumentGallery patientId={patientId} onDocumentIntegrated={handleDocumentIntegrated} />
                            </div>
                        ) : (
                            <div className="p-8 text-center space-y-6">
                                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                                    <div className="w-8 h-8 rounded-full bg-primary/20"></div>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-lg font-bold text-primary">Module {win.title}</h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                                        Exploration détaillée des données. Vous pouvez comparer ce module avec les blocs du dashboard en arrière-plan.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-4">
                                    <div className="h-20 rounded-xl bg-card border border-border/30 flex flex-col items-center justify-center">
                                        <span className="text-[10px] uppercase font-bold opacity-40">Entrées</span>
                                        <span className="text-xl font-bold">12</span>
                                    </div>
                                    <div className="h-20 rounded-xl bg-card border border-border/30 flex flex-col items-center justify-center">
                                        <span className="text-[10px] uppercase font-bold opacity-40">Alertes</span>
                                        <span className="text-xl font-bold text-destructive">2</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </AppWindow>
            ))}
        </div>
    );
};

export default PatientDossierLayout;
