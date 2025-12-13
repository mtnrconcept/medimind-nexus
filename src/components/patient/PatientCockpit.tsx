/**
 * PatientCockpit - Unified Patient Dashboard
 * 
 * Provides a consolidated overview of patient status including:
 * - Critical alerts summary
 * - Key vital signs with status indicators
 * - Recent events timeline
 * - Quick action buttons
 */

import { useState } from 'react';
import {
    AlertTriangle,
    Activity,
    Heart,
    Thermometer,
    Droplets,
    Clock,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
    Bell,
    FileText,
    Pill,
    User,
    Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { PatientAlert, ExtendedLabResults } from '@/hooks/usePatientAlerts';

// ============================================
// TYPES
// ============================================

interface PatientCockpitProps {
    patient: {
        patient_id: string;
        age: number;
        gender: string;
        height_cm: number;
        weight_kg: number;
        treatment: string;
        medical_notes_nlp: string;
        pathologies?: {
            name: string;
            icd_code?: string;
        } | null;
    };
    labResults: ExtendedLabResults;
    alerts: PatientAlert[];
    onNavigateToSection?: (section: string) => void;
}

interface VitalCardProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    unit: string;
    status: 'normal' | 'warning' | 'critical' | 'unknown';
    trend?: 'up' | 'down' | 'stable';
    reference?: string;
}

interface TimelineEvent {
    id: string;
    type: 'alert' | 'lab' | 'treatment' | 'note';
    title: string;
    description: string;
    timestamp: Date;
    severity?: 'critical' | 'warning' | 'info';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getVitalStatus = (
    value: number,
    thresholds: {
        low?: { warning: number; critical: number };
        high?: { warning: number; critical: number };
    }
): 'normal' | 'warning' | 'critical' | 'unknown' => {
    if (value === 0 || value === undefined) return 'unknown';

    if (thresholds.low) {
        if (value < thresholds.low.critical) return 'critical';
        if (value < thresholds.low.warning) return 'warning';
    }

    if (thresholds.high) {
        if (value > thresholds.high.critical) return 'critical';
        if (value > thresholds.high.warning) return 'warning';
    }

    return 'normal';
};

const calculateBMI = (heightCm: number, weightKg: number): number => {
    if (!heightCm || !weightKg) return 0;
    const heightM = heightCm / 100;
    return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
};

const getBMIStatus = (bmi: number): 'normal' | 'warning' | 'critical' | 'unknown' => {
    if (!bmi) return 'unknown';
    if (bmi < 16 || bmi > 35) return 'critical';
    if (bmi < 18.5 || bmi > 30) return 'warning';
    return 'normal';
};

// ============================================
// VITAL CARD COMPONENT
// ============================================

const VitalCard = ({ icon, label, value, unit, status, trend, reference }: VitalCardProps) => {
    const statusColors = {
        normal: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
        warning: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
        critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 animate-pulse',
        unknown: 'bg-muted text-muted-foreground border-border'
    };

    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

    return (
        <div className={cn(
            "p-3 rounded-lg border flex items-center gap-3 transition-all",
            statusColors[status]
        )}>
            <div className="p-2 rounded-full bg-background/50">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                    {label}
                </p>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono">{value || '--'}</span>
                    <span className="text-xs text-muted-foreground">{unit}</span>
                    {trend && (
                        <TrendIcon className={cn(
                            "h-3 w-3 ml-1",
                            trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-muted-foreground'
                        )} />
                    )}
                </div>
                {reference && (
                    <p className="text-[9px] text-muted-foreground">{reference}</p>
                )}
            </div>
            {status === 'critical' && (
                <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
            )}
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PatientCockpit = ({
    patient,
    labResults,
    alerts,
    onNavigateToSection
}: PatientCockpitProps) => {
    const [expandedAlerts, setExpandedAlerts] = useState(false);

    // Calculate summary stats
    const criticalCount = alerts.filter(a => a.level === 'CRITICAL').length;
    const warningCount = alerts.filter(a => a.level === 'WARNING').length;
    const totalAlerts = criticalCount + warningCount;

    // Calculate risk score (simplified)
    const riskScore = Math.min(20 + (criticalCount * 25) + (warningCount * 10), 100);

    // Calculate BMI
    const bmi = calculateBMI(patient.height_cm, patient.weight_kg);

    // Generate mock timeline events based on alerts
    const timelineEvents: TimelineEvent[] = alerts.slice(0, 4).map((alert, idx) => ({
        id: alert.id,
        type: 'alert' as const,
        title: alert.title,
        description: alert.description,
        timestamp: new Date(Date.now() - idx * 3600000), // Mock timestamps
        severity: alert.level === 'CRITICAL' ? 'critical' : alert.level === 'WARNING' ? 'warning' : 'info'
    }));

    const handleSectionClick = (section: string) => {
        onNavigateToSection?.(section);
    };

    return (
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Cockpit Patient
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {criticalCount > 0 && (
                            <Badge variant="destructive" className="animate-pulse text-[10px]">
                                🔴 {criticalCount} Critique{criticalCount > 1 ? 's' : ''}
                            </Badge>
                        )}
                        {warningCount > 0 && (
                            <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30 text-[10px]">
                                🟠 {warningCount}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Risk Score Banner */}
                <div className={cn(
                    "p-3 rounded-lg border",
                    riskScore >= 70 ? "bg-red-500/10 border-red-500/30" :
                        riskScore >= 40 ? "bg-orange-500/10 border-orange-500/30" :
                            "bg-green-500/10 border-green-500/30"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">Score de risque global</span>
                        <span className={cn(
                            "text-lg font-bold font-mono",
                            riskScore >= 70 ? "text-red-500" :
                                riskScore >= 40 ? "text-orange-500" :
                                    "text-green-500"
                        )}>
                            {riskScore}%
                        </span>
                    </div>
                    <Progress
                        value={riskScore}
                        className={cn(
                            "h-2",
                            riskScore >= 70 ? "[&>div]:bg-red-500" :
                                riskScore >= 40 ? "[&>div]:bg-orange-500" :
                                    "[&>div]:bg-green-500"
                        )}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Basé sur {totalAlerts} alerte{totalAlerts > 1 ? 's' : ''} active{totalAlerts > 1 ? 's' : ''}
                    </p>
                </div>

                {/* Critical Alerts Summary */}
                {criticalCount > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold flex items-center gap-1 text-red-500">
                                <AlertTriangle className="h-3 w-3" />
                                Alertes Critiques
                            </h4>
                            {alerts.filter(a => a.level === 'CRITICAL').length > 2 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px]"
                                    onClick={() => setExpandedAlerts(!expandedAlerts)}
                                >
                                    {expandedAlerts ? 'Réduire' : 'Voir tout'}
                                </Button>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            {alerts
                                .filter(a => a.level === 'CRITICAL')
                                .slice(0, expandedAlerts ? undefined : 2)
                                .map(alert => (
                                    <div
                                        key={alert.id}
                                        className="p-2 rounded bg-red-500/10 border border-red-500/20 text-xs"
                                    >
                                        <div className="font-medium text-red-600 dark:text-red-400">
                                            {alert.title}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground line-clamp-1">
                                            {alert.action}
                                        </p>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Vital Signs Grid */}
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        Signes Vitaux
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        <VitalCard
                            icon={<Droplets className="h-4 w-4 text-blue-500" />}
                            label="Glycémie"
                            value={labResults.glucose_mg_dl}
                            unit="mg/dL"
                            status={getVitalStatus(labResults.glucose_mg_dl, {
                                low: { warning: 80, critical: 70 },
                                high: { warning: 180, critical: 300 }
                            })}
                            reference="70-120"
                        />
                        <VitalCard
                            icon={<Heart className="h-4 w-4 text-red-500" />}
                            label="Tension"
                            value={`${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia}`}
                            unit="mmHg"
                            status={getVitalStatus(labResults.blood_pressure_sys, {
                                high: { warning: 140, critical: 180 }
                            })}
                            reference="<140/90"
                        />
                        <VitalCard
                            icon={<Thermometer className="h-4 w-4 text-orange-500" />}
                            label="Température"
                            value={labResults.temperature_c}
                            unit="°C"
                            status={getVitalStatus(labResults.temperature_c, {
                                high: { warning: 38, critical: 39 }
                            })}
                            reference="36.5-37.5"
                        />
                        <VitalCard
                            icon={<Activity className="h-4 w-4 text-purple-500" />}
                            label="IMC"
                            value={bmi}
                            unit="kg/m²"
                            status={getBMIStatus(bmi)}
                            reference="18.5-25"
                        />
                    </div>
                </div>

                {/* Quick Info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            {patient.gender === 'M' ? 'Homme' : 'Femme'}, {patient.age} ans
                        </span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">
                            {patient.pathologies?.name || 'Non spécifié'}
                        </span>
                    </div>
                </div>

                {/* Recent Activity Timeline */}
                {timelineEvents.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Activité récente
                        </h4>
                        <div className="space-y-1">
                            {timelineEvents.slice(0, 3).map((event, idx) => (
                                <div
                                    key={event.id}
                                    className="flex items-start gap-2 p-2 rounded bg-muted/30 text-[10px]"
                                >
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
                                        event.severity === 'critical' ? 'bg-red-500' :
                                            event.severity === 'warning' ? 'bg-orange-500' :
                                                'bg-blue-500'
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{event.title}</p>
                                        <p className="text-muted-foreground">
                                            Il y a {idx + 1}h
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] flex-col py-1 gap-0.5"
                        onClick={() => handleSectionClick('vitals')}
                    >
                        <Activity className="h-3 w-3" />
                        Signes vitaux
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] flex-col py-1 gap-0.5"
                        onClick={() => handleSectionClick('treatment')}
                    >
                        <Pill className="h-3 w-3" />
                        Traitement
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] flex-col py-1 gap-0.5"
                        onClick={() => handleSectionClick('history')}
                    >
                        <Calendar className="h-3 w-3" />
                        Historique
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default PatientCockpit;
