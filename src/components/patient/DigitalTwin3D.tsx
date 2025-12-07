import { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Layers, Eye, EyeOff } from 'lucide-react';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface DigitalTwin3DProps {
  alerts: PatientAlert[];
  pathologyName?: string;
}

type LayerType = 'skin' | 'tissue' | 'organs' | 'bones';

interface LayerConfig {
  id: LayerType;
  name: string;
  nameFr: string;
  opacity: number;
  visible: boolean;
  color: string;
}

const DigitalTwin3D = ({ alerts, pathologyName }: DigitalTwin3DProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [hoveredOrgan, setHoveredOrgan] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: 'skin', name: 'Skin', nameFr: 'Peau', opacity: 100, visible: true, color: 'rgba(255, 218, 185, 0.6)' },
    { id: 'tissue', name: 'Tissue', nameFr: 'Tissus', opacity: 100, visible: true, color: 'rgba(220, 120, 120, 0.5)' },
    { id: 'organs', name: 'Organs', nameFr: 'Organes', opacity: 100, visible: true, color: 'rgba(180, 80, 80, 0.7)' },
    { id: 'bones', name: 'Bones', nameFr: 'Os', opacity: 100, visible: true, color: 'rgba(240, 240, 220, 0.8)' },
  ]);

  // Scan animation on load
  useEffect(() => {
    const scanInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(scanInterval);
          setTimeout(() => setIsLoading(false), 500);
          return 100;
        }
        return prev + 2;
      });
    }, 30);
    return () => clearInterval(scanInterval);
  }, []);

  const toggleLayer = (layerId: LayerType) => {
    setLayers(prev => prev.map(l => 
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ));
  };

  const setLayerOpacity = (layerId: LayerType, opacity: number) => {
    setLayers(prev => prev.map(l => 
      l.id === layerId ? { ...l, opacity } : l
    ));
  };

  // Map alerts to organs
  const getOrganStatus = (organId: string): { status: 'normal' | 'warning' | 'critical'; alerts: PatientAlert[] } => {
    const orgAlerts = alerts.filter(a => a.organ === organId);
    if (orgAlerts.some(a => a.level === 'CRITICAL')) return { status: 'critical', alerts: orgAlerts };
    if (orgAlerts.some(a => a.level === 'WARNING')) return { status: 'warning', alerts: orgAlerts };
    return { status: 'normal', alerts: orgAlerts };
  };

  const organs = [
    { id: 'brain', name: 'Cerveau', cx: 100, cy: 35, ...getOrganStatus('brain') },
    { id: 'lungs', name: 'Poumons', cx: 100, cy: 100, ...getOrganStatus('lungs') },
    { id: 'heart', name: 'Cœur', cx: 100, cy: 115, ...getOrganStatus('heart') },
    { id: 'liver', name: 'Foie', cx: 80, cy: 145, ...getOrganStatus('liver') },
    { id: 'stomach', name: 'Estomac', cx: 115, cy: 150, ...getOrganStatus('stomach') },
    { id: 'pancreas', name: 'Pancréas', cx: 100, cy: 165, ...getOrganStatus('pancreas') },
    { id: 'kidney', name: 'Reins', cx: 100, cy: 175, ...getOrganStatus('kidney') },
    { id: 'intestines', name: 'Intestins', cx: 100, cy: 200, ...getOrganStatus('intestines') },
  ];

  // Find connections between affected organs
  const connections: { from: string; to: string; level: 'warning' | 'critical' }[] = [];
  
  if (pathologyName?.toLowerCase().includes('diabète') || pathologyName?.toLowerCase().includes('diabetes')) {
    connections.push(
      { from: 'pancreas', to: 'kidney', level: 'warning' },
      { from: 'pancreas', to: 'heart', level: 'warning' }
    );
  }
  
  if (alerts.some(a => a.title.toLowerCase().includes('hypertension'))) {
    connections.push(
      { from: 'heart', to: 'kidney', level: 'critical' },
      { from: 'heart', to: 'brain', level: 'warning' }
    );
  }

  const getOrganCoords = (organId: string) => {
    const organ = organs.find(o => o.id === organId);
    return organ ? { x: organ.cx, y: organ.cy } : { x: 0, y: 0 };
  };

  const getLayerOpacity = (layerId: LayerType) => {
    const layer = layers.find(l => l.id === layerId);
    return layer?.visible ? (layer.opacity / 100) : 0;
  };

  return (
    <div className="relative bg-slate-950/80 rounded-xl border border-cyan-500/30 p-4 backdrop-blur-sm overflow-hidden">
      {/* Scan effect overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-slate-950/90 flex flex-col items-center justify-center">
          <div className="relative w-32 h-32 mb-4">
            <div 
              className="absolute inset-0 rounded-full border-2 border-cyan-500/50"
              style={{
                background: `conic-gradient(from 0deg, transparent, hsl(var(--primary)) ${scanProgress}%, transparent ${scanProgress}%)`
              }}
            />
            <div className="absolute inset-2 rounded-full bg-slate-950 flex items-center justify-center">
              <span className="text-cyan-400 font-mono text-lg">{scanProgress}%</span>
            </div>
          </div>
          <p className="text-cyan-400 font-mono text-sm animate-pulse">
            SCANNING PATIENT DATA...
          </p>
          <div className="w-48 h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-primary transition-all duration-100"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Horizontal scan line */}
      {isLoading && (
        <div 
          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent z-30 opacity-80"
          style={{ 
            top: `${scanProgress}%`,
            boxShadow: '0 0 20px 5px rgba(34, 211, 238, 0.5)'
          }}
        />
      )}

      <div className={cn(
        "transition-all duration-700",
        isLoading ? "opacity-30 blur-sm" : "opacity-100 blur-0"
      )}>
        <h3 className="text-sm font-semibold text-center mb-2 text-cyan-400 flex items-center justify-center gap-2">
          <Layers className="w-4 h-4" />
          Jumeau Numérique 3D
        </h3>

        {/* Layer controls */}
        <div className="mb-4 space-y-2">
          {layers.map((layer) => (
            <div key={layer.id} className="flex items-center gap-2 text-xs">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => toggleLayer(layer.id)}
              >
                {layer.visible ? (
                  <Eye className="w-3 h-3 text-cyan-400" />
                ) : (
                  <EyeOff className="w-3 h-3 text-muted-foreground" />
                )}
              </Button>
              <span className="w-14 text-muted-foreground">{layer.nameFr}</span>
              <Slider
                value={[layer.opacity]}
                onValueChange={([v]) => setLayerOpacity(layer.id, v)}
                max={100}
                step={5}
                className="flex-1"
                disabled={!layer.visible}
              />
              <span className="w-8 text-right text-muted-foreground font-mono">
                {layer.opacity}%
              </span>
            </div>
          ))}
        </div>

        <svg viewBox="0 0 200 280" className="w-full max-w-[200px] mx-auto">
          <defs>
            <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffdab9" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f5d0a9" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="tissueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#dc7878" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#c96060" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="organGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#b45050" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8b3030" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="boneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f0f0dc" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#e8e8d0" stopOpacity="0.7" />
            </linearGradient>
            <filter id="glow3d">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="scanGlow">
              <feGaussianBlur stdDeviation="2" result="blur"/>
              <feFlood floodColor="#22d3ee" floodOpacity="0.5"/>
              <feComposite in2="blur" operator="in"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Layer 4: Bones (deepest) */}
          <g style={{ opacity: getLayerOpacity('bones') }} className="transition-opacity duration-300">
            {/* Skull */}
            <ellipse cx="100" cy="35" rx="18" ry="22" fill="url(#boneGradient)" stroke="#d4d4c0" strokeWidth="0.5" />
            {/* Spine */}
            <rect x="97" y="55" width="6" height="145" rx="2" fill="url(#boneGradient)" stroke="#d4d4c0" strokeWidth="0.5" />
            {/* Ribs */}
            {[75, 90, 105, 120, 135].map((y, i) => (
              <g key={`rib-${i}`}>
                <path d={`M100 ${y} Q70 ${y + 5} 65 ${y + 15}`} fill="none" stroke="#e8e8d0" strokeWidth="3" />
                <path d={`M100 ${y} Q130 ${y + 5} 135 ${y + 15}`} fill="none" stroke="#e8e8d0" strokeWidth="3" />
              </g>
            ))}
            {/* Pelvis */}
            <path d="M75 195 Q100 215 125 195 Q130 205 125 220 L75 220 Q70 205 75 195" fill="url(#boneGradient)" stroke="#d4d4c0" strokeWidth="0.5" />
            {/* Arm bones */}
            <line x1="55" y1="80" x2="35" y2="145" stroke="#e8e8d0" strokeWidth="4" strokeLinecap="round" />
            <line x1="145" y1="80" x2="165" y2="145" stroke="#e8e8d0" strokeWidth="4" strokeLinecap="round" />
            {/* Leg bones */}
            <line x1="85" y1="220" x2="82" y2="275" stroke="#e8e8d0" strokeWidth="5" strokeLinecap="round" />
            <line x1="115" y1="220" x2="118" y2="275" stroke="#e8e8d0" strokeWidth="5" strokeLinecap="round" />
          </g>

          {/* Layer 3: Organs */}
          <g style={{ opacity: getLayerOpacity('organs') }} className="transition-opacity duration-300">
            {/* Brain */}
            <ellipse cx="100" cy="35" rx="14" ry="16" fill="url(#organGradient)" stroke="#943030" strokeWidth="0.5">
              <animate attributeName="opacity" values="0.7;0.9;0.7" dur="3s" repeatCount="indefinite" />
            </ellipse>
            {/* Lungs */}
            <ellipse cx="80" cy="100" rx="15" ry="25" fill="url(#organGradient)" stroke="#943030" strokeWidth="0.5" />
            <ellipse cx="120" cy="100" rx="15" ry="25" fill="url(#organGradient)" stroke="#943030" strokeWidth="0.5" />
            {/* Heart */}
            <path d="M100 105 C85 95 80 110 100 125 C120 110 115 95 100 105" fill="#c44" stroke="#922" strokeWidth="1">
              <animate attributeName="transform" attributeType="XML" type="scale" values="1;1.05;1" dur="0.8s" repeatCount="indefinite" additive="sum" />
            </path>
            {/* Liver */}
            <ellipse cx="80" cy="145" rx="18" ry="12" fill="url(#organGradient)" stroke="#7a2828" strokeWidth="0.5" />
            {/* Stomach */}
            <ellipse cx="115" cy="150" rx="12" ry="15" fill="url(#organGradient)" stroke="#7a2828" strokeWidth="0.5" />
            {/* Kidneys */}
            <ellipse cx="75" cy="170" rx="8" ry="12" fill="url(#organGradient)" stroke="#7a2828" strokeWidth="0.5" />
            <ellipse cx="125" cy="170" rx="8" ry="12" fill="url(#organGradient)" stroke="#7a2828" strokeWidth="0.5" />
            {/* Intestines */}
            <path d="M85 185 Q100 195 115 185 Q120 200 100 210 Q80 200 85 185" fill="url(#organGradient)" stroke="#7a2828" strokeWidth="0.5" />
          </g>

          {/* Layer 2: Tissue/Muscles */}
          <g style={{ opacity: getLayerOpacity('tissue') }} className="transition-opacity duration-300">
            <ellipse cx="100" cy="35" rx="22" ry="26" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
            <rect x="88" y="58" width="24" height="16" rx="4" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
            <path 
              d="M62 75 L62 198 L82 228 L118 228 L138 198 L138 75 L120 70 L80 70 Z" 
              fill="url(#tissueGradient)" 
              stroke="#c96060" 
              strokeWidth="0.5"
            />
            <path d="M62 80 L42 85 L32 148 L42 152 L57 100" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
            <path d="M138 80 L158 85 L168 148 L158 152 L143 100" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
            <path d="M82 228 L77 278 L92 278 L100 233" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
            <path d="M118 228 L123 278 L108 278 L100 233" fill="url(#tissueGradient)" stroke="#c96060" strokeWidth="0.5" />
          </g>

          {/* Layer 1: Skin (topmost) */}
          <g style={{ opacity: getLayerOpacity('skin') }} className="transition-opacity duration-300">
            <ellipse cx="100" cy="35" rx="25" ry="30" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
            <rect x="90" y="60" width="20" height="15" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
            <path 
              d="M60 75 L60 200 L80 230 L120 230 L140 200 L140 75 L120 70 L80 70 Z" 
              fill="url(#skinGradient)" 
              stroke="#deb887" 
              strokeWidth="1"
            />
            <path d="M60 80 L40 85 L30 150 L40 155 L55 100" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
            <path d="M140 80 L160 85 L170 150 L160 155 L145 100" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
            <path d="M80 230 L75 280 L90 280 L100 235" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
            <path d="M120 230 L125 280 L110 280 L100 235" fill="url(#skinGradient)" stroke="#deb887" strokeWidth="1" />
          </g>

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
                stroke={conn.level === 'critical' ? '#ef4444' : '#f97316'}
                strokeWidth="2"
                strokeDasharray="4 2"
                filter="url(#glow3d)"
              >
                <animate 
                  attributeName="stroke-dashoffset" 
                  from="0" 
                  to="12" 
                  dur="1s" 
                  repeatCount="indefinite" 
                />
              </line>
            );
          })}

          {/* Organ alert points (visible when organs layer is on) */}
          {getLayerOpacity('organs') > 0 && organs.map((organ) => (
            <Tooltip key={organ.id}>
              <TooltipTrigger asChild>
                <g
                  onMouseEnter={() => setHoveredOrgan(organ.id)}
                  onMouseLeave={() => setHoveredOrgan(null)}
                  className="cursor-pointer"
                >
                  {organ.status !== 'normal' && (
                    <>
                      <circle
                        cx={organ.cx}
                        cy={organ.cy}
                        r={hoveredOrgan === organ.id ? 14 : 12}
                        fill="transparent"
                        stroke={organ.status === 'critical' ? '#ef4444' : '#f97316'}
                        strokeWidth="2"
                        filter="url(#glow3d)"
                      >
                        <animate 
                          attributeName="r" 
                          values={hoveredOrgan === organ.id ? "14;16;14" : "12;14;12"} 
                          dur="1.5s" 
                          repeatCount="indefinite" 
                        />
                        <animate 
                          attributeName="opacity" 
                          values="1;0.5;1" 
                          dur="1.5s" 
                          repeatCount="indefinite" 
                        />
                      </circle>
                      <circle
                        cx={organ.cx}
                        cy={organ.cy}
                        r={5}
                        fill={organ.status === 'critical' ? '#ef4444' : '#f97316'}
                      />
                    </>
                  )}
                </g>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px] bg-slate-900 border-cyan-500/50">
                <div className="space-y-1">
                  <p className="font-semibold text-cyan-400">{organ.name}</p>
                  {organ.alerts.length > 0 ? (
                    organ.alerts.map(alert => (
                      <p key={alert.id} className="text-xs text-muted-foreground">
                        {alert.level === 'CRITICAL' ? '🔴' : '🟠'} {alert.title}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-emerald-400">✓ Normal</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </svg>

        {/* Legend */}
        <div className="flex justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-muted-foreground">Critique</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-muted-foreground">Attention</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            <span className="text-muted-foreground">Normal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwin3D;
