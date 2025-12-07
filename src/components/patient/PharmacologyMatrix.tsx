import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Pill, AlertTriangle, XCircle, Check } from 'lucide-react';
import type { PatientAlert } from '@/hooks/usePatientAlerts';

interface PharmacologyMatrixProps {
  treatment: string;
  alerts: PatientAlert[];
}

const PharmacologyMatrix = ({ treatment, alerts }: PharmacologyMatrixProps) => {
  // Extract individual medications from treatment string
  const medications = treatment
    .split(/[,+&]/)
    .map(m => m.trim())
    .filter(m => m.length > 0)
    .slice(0, 5); // Max 5 meds for matrix

  const interactionAlerts = alerts.filter(a => a.type === 'INTERACTION' || a.type === 'CONTRAINDICATION');

  const getInteractionStatus = (med1: string, med2: string): 'ok' | 'warning' | 'critical' | null => {
    if (med1 === med2) return null;
    
    const med1Lower = med1.toLowerCase();
    const med2Lower = med2.toLowerCase();
    
    for (const alert of interactionAlerts) {
      const titleLower = alert.title.toLowerCase();
      if (
        (titleLower.includes(med1Lower) || titleLower.includes(med2Lower)) ||
        (alert.description.toLowerCase().includes(med1Lower) && alert.description.toLowerCase().includes(med2Lower))
      ) {
        return alert.level === 'CRITICAL' ? 'critical' : 'warning';
      }
    }
    
    return 'ok';
  };

  const getStatusIcon = (status: 'ok' | 'warning' | 'critical' | null) => {
    switch (status) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'ok':
        return <Check className="h-4 w-4 text-green-500" />;
      default:
        return <span className="text-muted-foreground">—</span>;
    }
  };

  if (medications.length < 2) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          Matrice Pharmacovigilance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-1"></th>
                {medications.map((med, idx) => (
                  <th key={idx} className="p-1 text-center font-medium text-muted-foreground max-w-[80px] truncate">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{med.slice(0, 8)}...</span>
                      </TooltipTrigger>
                      <TooltipContent>{med}</TooltipContent>
                    </Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medications.map((med1, i) => (
                <tr key={i}>
                  <td className="p-1 font-medium text-muted-foreground max-w-[80px] truncate">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{med1.slice(0, 8)}...</span>
                      </TooltipTrigger>
                      <TooltipContent>{med1}</TooltipContent>
                    </Tooltip>
                  </td>
                  {medications.map((med2, j) => {
                    const status = getInteractionStatus(med1, med2);
                    return (
                      <td key={j} className="p-1 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex items-center justify-center w-6 h-6 rounded cursor-help hover:bg-muted/50">
                              {getStatusIcon(status)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {status === 'critical' && 'Interaction dangereuse'}
                            {status === 'warning' && 'Surveillance requise'}
                            {status === 'ok' && 'Compatible'}
                            {status === null && 'Même médicament'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Interaction alerts list */}
        {interactionAlerts.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Interactions détectées :</p>
            {interactionAlerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-2">
                <Badge 
                  variant={alert.level === 'CRITICAL' ? 'destructive' : 'secondary'}
                  className="text-[10px] shrink-0"
                >
                  {alert.level === 'CRITICAL' ? '🚫' : '⚠️'}
                </Badge>
                <span className="text-xs text-muted-foreground">{alert.title}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PharmacologyMatrix;
