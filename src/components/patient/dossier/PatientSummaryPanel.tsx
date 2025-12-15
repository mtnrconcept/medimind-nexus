/**
 * PatientSummaryPanel - Left panel with risk score, vitals, and admin info
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
    Activity,
    Heart,
    Thermometer,
    Droplets,
    User,
    Phone,
    Mail,
    MapPin,
    Shield,
    AlertTriangle,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PatientSummaryPanelProps {
    patientId: string;
    patient: {
        first_name: string;
        last_name: string;
        date_of_birth: string;
        gender: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        postal_code?: string;
    };
}

interface VitalSigns {
    systolic_bp?: number;
    diastolic_bp?: number;
    heart_rate?: number;
    temperature?: number;
    oxygen_saturation?: number;
    weight_kg?: number;
    recorded_at?: string;
}

interface AdminData {
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    social_security_number?: string;
    insurance_provider?: string;
    primary_physician_name?: string;
    marital_status?: string;
}

const PatientSummaryPanel = ({ patientId, patient }: PatientSummaryPanelProps) => {
    const [vitals, setVitals] = useState<VitalSigns | null>(null);
    const [adminData, setAdminData] = useState<AdminData | null>(null);
    const [riskScore, setRiskScore] = useState<number>(72); // TODO: Calculate from actual data
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch latest vitals
            const { data: clinicalData } = await supabase
                .from('patient_clinical_data')
                .select('*')
                .eq('patient_id', patientId)
                .order('recorded_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (clinicalData) {
                setVitals(clinicalData);
            }

            // Fetch admin data
            const { data: admin } = await supabase
                .from('patient_administrative')
                .select('*')
                .eq('patient_id', patientId)
                .maybeSingle();

            if (admin) {
                setAdminData(admin);
            }
        } catch (error) {
            console.error('Error fetching summary data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getRiskColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    const getBPStatus = (sys?: number, dia?: number) => {
        if (!sys || !dia) return null;
        if (sys >= 180 || dia >= 120) return { label: 'Critique', color: 'text-red-500' };
        if (sys >= 140 || dia >= 90) return { label: 'Élevée', color: 'text-orange-500' };
        if (sys >= 120 || dia >= 80) return { label: 'Limite', color: 'text-yellow-500' };
        return { label: 'Normale', color: 'text-green-500' };
    };

    const age = patient.date_of_birth
        ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

    if (loading) {
        return (
            <div className="space-y-4">
                <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
            </div>
        );
    }

    const bpStatus = getBPStatus(vitals?.systolic_bp, vitals?.diastolic_bp);

    return (
        <div className="space-y-4">
            {/* Risk Score */}
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Score de Risque Global
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20">
                            <svg className="w-20 h-20 transform -rotate-90">
                                <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="6" fill="none" className="text-muted" />
                                <circle
                                    cx="40" cy="40" r="35"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(riskScore / 100) * 220} 220`}
                                    className={getRiskColor(riskScore)}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={cn("text-2xl font-bold", getRiskColor(riskScore))}>{riskScore}</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-1">État de santé</div>
                            <Badge className={cn("text-xs", riskScore >= 70 ? "bg-green-500" : riskScore >= 50 ? "bg-yellow-500" : "bg-red-500")}>
                                {riskScore >= 70 ? 'Bon' : riskScore >= 50 ? 'À surveiller' : 'Préoccupant'}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Vital Signs */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Signes Vitaux
                        {vitals?.recorded_at && (
                            <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                                {format(new Date(vitals.recorded_at), 'dd/MM HH:mm')}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {vitals ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                                    <Heart className="h-4 w-4 text-red-500" />
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">Tension</div>
                                        <div className={cn("font-medium text-sm", bpStatus?.color)}>
                                            {vitals.systolic_bp || '--'}/{vitals.diastolic_bp || '--'}
                                            <span className="text-[10px] text-muted-foreground ml-1">mmHg</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                                    <Activity className="h-4 w-4 text-pink-500" />
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">Pouls</div>
                                        <div className="font-medium text-sm">
                                            {vitals.heart_rate || '--'}
                                            <span className="text-[10px] text-muted-foreground ml-1">bpm</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                                    <Thermometer className="h-4 w-4 text-orange-500" />
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">Température</div>
                                        <div className="font-medium text-sm">
                                            {vitals.temperature || '--'}
                                            <span className="text-[10px] text-muted-foreground ml-1">°C</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                                    <Droplets className="h-4 w-4 text-blue-500" />
                                    <div>
                                        <div className="text-[10px] text-muted-foreground">SpO2</div>
                                        <div className="font-medium text-sm">
                                            {vitals.oxygen_saturation || '--'}
                                            <span className="text-[10px] text-muted-foreground ml-1">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                            <Activity className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            Aucune donnée récente
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Admin Info */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Informations Administratives
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <div className="text-lg font-semibold">{patient.first_name} {patient.last_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {age && <span>{age} ans</span>}
                            {patient.gender && <span>• {patient.gender === 'male' ? 'Homme' : 'Femme'}</span>}
                            {patient.date_of_birth && (
                                <span>• Né(e) le {format(new Date(patient.date_of_birth), 'dd/MM/yyyy')}</span>
                            )}
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-2 text-sm">
                        {patient.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span>{patient.phone}</span>
                            </div>
                        )}
                        {patient.email && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{patient.email}</span>
                            </div>
                        )}
                        {(patient.address || patient.city) && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{patient.address}{patient.city && `, ${patient.city}`}</span>
                            </div>
                        )}
                    </div>

                    {adminData?.emergency_contact_name && (
                        <>
                            <Separator />
                            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <div className="flex items-center gap-2 text-red-500 text-xs font-medium mb-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Contact d'urgence
                                </div>
                                <div className="text-sm">{adminData.emergency_contact_name}</div>
                                {adminData.emergency_contact_phone && (
                                    <div className="text-xs text-muted-foreground">{adminData.emergency_contact_phone}</div>
                                )}
                            </div>
                        </>
                    )}

                    {adminData?.primary_physician_name && (
                        <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Médecin traitant:</span> {adminData.primary_physician_name}
                        </div>
                    )}

                    {adminData?.insurance_provider && (
                        <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Assurance:</span> {adminData.insurance_provider}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default PatientSummaryPanel;
