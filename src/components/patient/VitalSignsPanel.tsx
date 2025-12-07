import { Heart, Thermometer, Droplets, Activity, Wind } from 'lucide-react';
import type { ExtendedLabResults } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface VitalSignsPanelProps {
  labResults: ExtendedLabResults;
  age: number;
  height: number;
  weight: number;
}

interface VitalSign {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  range?: string;
}

const VitalSignsPanel = ({ labResults, age, height, weight }: VitalSignsPanelProps) => {
  const calculateBMI = () => {
    if (!height || !weight) return null;
    const heightM = height / 100;
    return (weight / (heightM * heightM)).toFixed(1);
  };

  const bmi = calculateBMI();

  const getBPStatus = (): 'normal' | 'warning' | 'critical' => {
    const { blood_pressure_sys, blood_pressure_dia } = labResults;
    if (blood_pressure_sys > 180 || blood_pressure_dia > 110) return 'critical';
    if (blood_pressure_sys > 140 || blood_pressure_dia > 90) return 'warning';
    return 'normal';
  };

  const getTempStatus = (): 'normal' | 'warning' | 'critical' => {
    const temp = labResults.temperature_c;
    if (temp > 39 || temp < 35) return 'critical';
    if (temp > 38 || temp < 36) return 'warning';
    return 'normal';
  };

  const getGlucoseStatus = (): 'normal' | 'warning' | 'critical' => {
    const glucose = labResults.glucose_mg_dl;
    if (glucose > 300 || glucose < 70) return 'critical';
    if (glucose > 180 || glucose < 80) return 'warning';
    return 'normal';
  };

  const getSpo2Status = (): 'normal' | 'warning' | 'critical' => {
    const spo2 = labResults.spo2_percent;
    if (!spo2) return 'normal';
    if (spo2 < 90) return 'critical';
    if (spo2 < 94) return 'warning';
    return 'normal';
  };

  const vitalSigns: VitalSign[] = [
    {
      icon: <Heart className="h-5 w-5" />,
      label: 'Tension',
      value: `${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia}`,
      unit: 'mmHg',
      status: getBPStatus(),
      range: '< 140/90'
    },
    {
      icon: <Thermometer className="h-5 w-5" />,
      label: 'Température',
      value: labResults.temperature_c?.toFixed(1) || '-',
      unit: '°C',
      status: getTempStatus(),
      range: '36.5 - 37.5'
    },
    {
      icon: <Droplets className="h-5 w-5" />,
      label: 'Glycémie',
      value: labResults.glucose_mg_dl || '-',
      unit: 'mg/dL',
      status: getGlucoseStatus(),
      range: '70 - 110'
    },
    {
      icon: <Wind className="h-5 w-5" />,
      label: 'SpO2',
      value: labResults.spo2_percent || '-',
      unit: '%',
      status: getSpo2Status(),
      range: '> 95'
    },
    {
      icon: <Activity className="h-5 w-5" />,
      label: 'IMC',
      value: bmi || '-',
      unit: 'kg/m²',
      status: bmi && parseFloat(bmi) > 30 ? 'warning' : bmi && parseFloat(bmi) > 35 ? 'critical' : 'normal',
      range: '18.5 - 25'
    }
  ];

  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-destructive/50 bg-destructive/5';
      case 'warning':
        return 'border-orange-500/50 bg-orange-500/5';
      default:
        return 'border-border/50 bg-card/50';
    }
  };

  const getValueClasses = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-destructive';
      case 'warning':
        return 'text-orange-500';
      default:
        return 'text-foreground';
    }
  };

  const getIconClasses = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-destructive animate-pulse';
      case 'warning':
        return 'text-orange-500';
      default:
        return 'text-primary';
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
        <Activity className="h-4 w-4" />
        Signes Vitaux
      </h3>
      
      <div className="space-y-2">
        {vitalSigns.map((vital, index) => (
          <div
            key={index}
            className={cn(
              "rounded-lg border p-3 transition-all hover:shadow-md",
              getStatusClasses(vital.status)
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-md bg-background/50", getIconClasses(vital.status))}>
                  {vital.icon}
                </div>
                <span className="text-xs text-muted-foreground">{vital.label}</span>
              </div>
              <div className="text-right">
                <span className={cn("font-mono text-lg font-bold", getValueClasses(vital.status))}>
                  {vital.value}
                </span>
                <span className="text-xs text-muted-foreground ml-1">{vital.unit}</span>
              </div>
            </div>
            {vital.range && (
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                Norme: {vital.range}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VitalSignsPanel;
