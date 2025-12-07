import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface DigitalTwinBodyProps {
  alerts: PatientAlert[];
  pathologyName?: string;
}

interface OrganData {
  id: string;
  name: string;
  path: string;
  cx?: number;
  cy?: number;
  status: 'normal' | 'warning' | 'critical';
  alerts: PatientAlert[];
}

const DigitalTwinBody = ({ alerts, pathologyName }: DigitalTwinBodyProps) => {
  const [hoveredOrgan, setHoveredOrgan] = useState<string | null>(null);

  // Map alerts to organs
  const getOrganStatus = (organId: string): { status: 'normal' | 'warning' | 'critical'; alerts: PatientAlert[] } => {
    const orgAlerts = alerts.filter(a => a.organ === organId);
    if (orgAlerts.some(a => a.level === 'CRITICAL')) return { status: 'critical', alerts: orgAlerts };
    if (orgAlerts.some(a => a.level === 'WARNING')) return { status: 'warning', alerts: orgAlerts };
    return { status: 'normal', alerts: orgAlerts };
  };

  const organs: OrganData[] = [
    { id: 'brain', name: 'Cerveau', cx: 100, cy: 35, ...getOrganStatus('brain'), path: '' },
    { id: 'lungs', name: 'Poumons', cx: 100, cy: 100, ...getOrganStatus('lungs'), path: '' },
    { id: 'heart', name: 'Cœur', cx: 100, cy: 115, ...getOrganStatus('heart'), path: '' },
    { id: 'liver', name: 'Foie', cx: 80, cy: 145, ...getOrganStatus('liver'), path: '' },
    { id: 'stomach', name: 'Estomac', cx: 115, cy: 150, ...getOrganStatus('stomach'), path: '' },
    { id: 'pancreas', name: 'Pancréas', cx: 100, cy: 165, ...getOrganStatus('pancreas'), path: '' },
    { id: 'kidney', name: 'Reins', cx: 100, cy: 175, ...getOrganStatus('kidney'), path: '' },
    { id: 'intestines', name: 'Intestins', cx: 100, cy: 200, ...getOrganStatus('intestines'), path: '' },
  ];

  // Find connections between affected organs
  const connections: { from: string; to: string; level: 'warning' | 'critical' }[] = [];
  
  // Check for diabetes-related complications
  if (pathologyName?.toLowerCase().includes('diabète') || pathologyName?.toLowerCase().includes('diabetes')) {
    connections.push(
      { from: 'pancreas', to: 'kidney', level: 'warning' },
      { from: 'pancreas', to: 'heart', level: 'warning' }
    );
  }
  
  // Check for hypertension complications
  if (alerts.some(a => a.title.toLowerCase().includes('hypertension'))) {
    connections.push(
      { from: 'heart', to: 'kidney', level: 'critical' },
      { from: 'heart', to: 'brain', level: 'warning' }
    );
  }

  const getOrganCoords = (organId: string) => {
    const organ = organs.find(o => o.id === organId);
    return organ ? { x: organ.cx!, y: organ.cy! } : { x: 0, y: 0 };
  };

  const getStatusColor = (status: string, isHovered: boolean) => {
    switch (status) {
      case 'critical':
        return isHovered ? 'fill-destructive' : 'fill-destructive/70';
      case 'warning':
        return isHovered ? 'fill-orange-500' : 'fill-orange-500/70';
      default:
        return isHovered ? 'fill-primary' : 'fill-primary/40';
    }
  };

  return (
    <div className="relative bg-card/50 rounded-xl border border-border/50 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-center mb-2 text-primary">
        Jumeau Numérique
      </h3>
      
      <svg viewBox="0 0 200 280" className="w-full max-w-[200px] mx-auto">
        {/* Body silhouette */}
        <defs>
          <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Head */}
        <ellipse cx="100" cy="35" rx="25" ry="30" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
        
        {/* Neck */}
        <rect x="90" y="60" width="20" height="15" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
        
        {/* Torso */}
        <path 
          d="M60 75 L60 200 L80 230 L120 230 L140 200 L140 75 L120 70 L80 70 Z" 
          fill="url(#bodyGradient)" 
          stroke="hsl(var(--primary))" 
          strokeWidth="1" 
          strokeOpacity="0.3"
        />
        
        {/* Arms */}
        <path d="M60 80 L40 85 L30 150 L40 155 L55 100" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
        <path d="M140 80 L160 85 L170 150 L160 155 L145 100" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
        
        {/* Legs */}
        <path d="M80 230 L75 280 L90 280 L100 235" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
        <path d="M120 230 L125 280 L110 280 L100 235" fill="url(#bodyGradient)" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />

        {/* Connection lines between affected organs */}
        {connections.map((conn, idx) => {
          const from = getOrganCoords(conn.from);
          const to = getOrganCoords(conn.to);
          return (
            <line
              key={`conn-${idx}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={conn.level === 'critical' ? 'hsl(var(--destructive))' : 'hsl(25, 95%, 53%)'}
              strokeWidth="2"
              strokeDasharray="4 2"
              className="animate-pulse"
              opacity="0.7"
            />
          );
        })}

        {/* Organ points */}
        {organs.map((organ) => (
          <Tooltip key={organ.id}>
            <TooltipTrigger asChild>
              <g
                onMouseEnter={() => setHoveredOrgan(organ.id)}
                onMouseLeave={() => setHoveredOrgan(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={organ.cx}
                  cy={organ.cy}
                  r={hoveredOrgan === organ.id ? 12 : 10}
                  className={cn(
                    "transition-all duration-200",
                    getStatusColor(organ.status, hoveredOrgan === organ.id),
                    organ.status === 'critical' && "animate-pulse"
                  )}
                  filter={organ.status !== 'normal' ? "url(#glow)" : undefined}
                />
                <circle
                  cx={organ.cx}
                  cy={organ.cy}
                  r={6}
                  fill="hsl(var(--background))"
                  opacity="0.5"
                />
              </g>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[200px]">
              <div className="space-y-1">
                <p className="font-semibold">{organ.name}</p>
                {organ.alerts.length > 0 ? (
                  organ.alerts.map(alert => (
                    <p key={alert.id} className="text-xs text-muted-foreground">
                      {alert.level === 'CRITICAL' ? '🔴' : '🟠'} {alert.title}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">✓ Normal</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
          <span className="text-muted-foreground">Critique</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span className="text-muted-foreground">Attention</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary/40" />
          <span className="text-muted-foreground">Normal</span>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwinBody;
