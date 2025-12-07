import { AlertTriangle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface SafetyAlertBannerProps {
  alerts: PatientAlert[];
}

const SafetyAlertBanner = ({ alerts }: SafetyAlertBannerProps) => {
  const [expanded, setExpanded] = useState(false);
  
  const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL');
  const warningAlerts = alerts.filter(a => a.level === 'WARNING');
  
  if (criticalAlerts.length === 0 && warningAlerts.length === 0) {
    return null;
  }

  const displayedAlerts = expanded ? [...criticalAlerts, ...warningAlerts] : criticalAlerts.slice(0, 1);
  const hasMore = (criticalAlerts.length + warningAlerts.length) > 1;

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <XCircle className="h-5 w-5" />;
      case 'WARNING':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'CONTRAINDICATION': return '🚫 CONTRE-INDICATION';
      case 'INTERACTION': return '⚠️ INTERACTION';
      case 'COMPLICATION': return '🔄 COMPLICATION';
      case 'ABNORMAL_VALUE': return '📊 VALEUR ANORMALE';
      default: return type;
    }
  };

  return (
    <div className="space-y-2 animate-fade-in">
      {displayedAlerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "rounded-lg border p-4 shadow-lg",
            alert.level === 'CRITICAL' 
              ? "bg-destructive/10 border-destructive/50 animate-pulse" 
              : "bg-orange-500/10 border-orange-500/50"
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-full",
              alert.level === 'CRITICAL' ? "bg-destructive/20 text-destructive" : "bg-orange-500/20 text-orange-500"
            )}>
              {getAlertIcon(alert.level)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  alert.level === 'CRITICAL' ? "text-destructive" : "text-orange-500"
                )}>
                  {getTypeLabel(alert.type)}
                </span>
              </div>
              <h4 className={cn(
                "font-bold",
                alert.level === 'CRITICAL' ? "text-destructive" : "text-orange-600 dark:text-orange-400"
              )}>
                {alert.title}
              </h4>
              <p className="text-sm text-muted-foreground">
                {alert.description}
              </p>
              {alert.action && (
                <p className="text-sm font-medium text-foreground mt-2">
                  <span className="text-muted-foreground">Action suggérée :</span> {alert.action}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Masquer les alertes
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Voir {criticalAlerts.length + warningAlerts.length - 1} alerte(s) supplémentaire(s)
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default SafetyAlertBanner;
