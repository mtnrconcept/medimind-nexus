import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Siren, Activity, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CriticalAlertsModalProps {
    patientId: string;
}

interface AlertItem {
    id: string;
    type: 'allergy' | 'lab' | 'condition';
    title: string;
    description?: string;
    severity: 'critical' | 'severe' | 'abnormal';
    date?: string;
}

export function CriticalAlertsModal({ patientId }: CriticalAlertsModalProps) {
    const [open, setOpen] = useState(false);
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAlerts = async () => {
            setLoading(true);
            try {
                const newAlerts: AlertItem[] = [];

                // 1. Check Severe Allergies
                const { data: allergies } = await supabase
                    .from('patient_allergies')
                    .select('id, allergen, reaction, severity')
                    .eq('patient_id', patientId)
                    .in('severity', ['severe', 'critical']);

                if (allergies) {
                    allergies.forEach(a => newAlerts.push({
                        id: a.id,
                        type: 'allergy',
                        title: `Allergie: ${a.allergen}`,
                        description: a.reaction || 'Réaction sévère',
                        severity: (a.severity as 'severe' | 'critical') || 'severe'
                    }));
                }

                // 2. Check Abnormal Lab Results
                const { data: labs } = await supabase
                    .from('patient_lab_results')
                    .select('id, test_name, value, unit, is_abnormal, test_date')
                    .eq('patient_id', patientId)
                    .eq('is_abnormal', true)
                    .order('test_date', { ascending: false })
                    .limit(5); // Limit to recent 5

                if (labs) {
                    labs.forEach(l => newAlerts.push({
                        id: l.id,
                        type: 'lab',
                        title: `Résultat Anormal: ${l.test_name}`,
                        description: `${l.value} ${l.unit} (${l.test_date})`,
                        severity: 'abnormal',
                        date: l.test_date
                    }));
                }

                // 3. Check Critical Conditions
                const { data: history } = await supabase
                    .from('patient_medical_history')
                    .select('id, condition_name, severity, is_chronic')
                    .eq('patient_id', patientId)
                    .in('severity', ['severe', 'critical']);

                if (history) {
                    history.forEach(h => newAlerts.push({
                        id: h.id,
                        type: 'condition',
                        title: `Condition Critique: ${h.condition_name}`,
                        description: h.is_chronic ? 'Chronique' : 'Aiguë',
                        severity: (h.severity as 'severe' | 'critical') || 'severe'
                    }));
                }

                setAlerts(newAlerts);
                if (newAlerts.length > 0) {
                    setOpen(true);
                }

            } catch (error) {
                console.error("Error fetching critical alerts:", error);
            } finally {
                setLoading(false);
            }
        };

        if (patientId) {
            checkAlerts();
        }
    }, [patientId]);

    if (alerts.length === 0) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md border-l-4 border-l-red-500 z-[20002]">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-600">
                        <Siren className="h-6 w-6 animate-pulse" />
                        <DialogTitle className="text-xl">Alertes Cliniques</DialogTitle>
                    </div>
                    <DialogDescription>
                        Points d'attention critiques détectés pour ce patient.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[300px] mt-4 pr-4">
                    <div className="space-y-3">
                        {alerts.map((alert, index) => (
                            <div key={alert.id + index} className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100">
                                {alert.type === 'allergy' && <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />}
                                {alert.type === 'lab' && <Activity className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />}
                                {alert.type === 'condition' && <Siren className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />}

                                <div className="space-y-1">
                                    <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                                        {alert.title}
                                        <Badge variant="outline" className={`text-[10px] h-5 ${alert.severity === 'critical' ? 'bg-red-100 text-red-700 border-red-200' :
                                                alert.severity === 'severe' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                                    'bg-yellow-100 text-yellow-700 border-yellow-200'
                                            }`}>
                                            {alert.severity.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-slate-500">{alert.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <DialogFooter className="mt-4 sm:justify-center">
                    <Button
                        variant="default"
                        size="lg"
                        className="w-full bg-red-600 hover:bg-red-700 text-white gap-2"
                        onClick={() => setOpen(false)}
                    >
                        <CheckCircle className="h-4 w-4" />
                        J'ai pris connaissance
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
