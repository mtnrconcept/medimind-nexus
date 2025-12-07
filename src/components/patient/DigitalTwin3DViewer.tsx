import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, RotateCcw, User, Bone, Heart, Layers } from 'lucide-react';
import { PatientAlert } from '@/hooks/usePatientAlerts';

interface LayerConfig {
  id: 'skin' | 'tissues' | 'organs' | 'bones';
  name: string;
  visible: boolean;
  opacity: number;
  color: string;
  icon: React.ReactNode;
}

interface DigitalTwin3DViewerProps {
  alerts?: PatientAlert[];
  pathologyName?: string;
}

// Skeleton Model - Procedural bones
const SkeletonModel = ({ opacity }: { opacity: number }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const boneColor = new THREE.Color(0xf5f5dc);
  const material = new THREE.MeshStandardMaterial({
    color: boneColor,
    transparent: true,
    opacity: opacity,
    roughness: 0.6,
  });

  return (
    <group ref={groupRef}>
      {/* Spine */}
      {[...Array(24)].map((_, i) => (
        <mesh key={`vertebra-${i}`} position={[0, 0.8 - i * 0.08, 0]} material={material}>
          <boxGeometry args={[0.08, 0.06, 0.1]} />
        </mesh>
      ))}
      
      {/* Skull */}
      <mesh position={[0, 1.1, 0]} material={material}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>
      
      {/* Ribcage */}
      {[...Array(12)].map((_, i) => (
        <group key={`rib-${i}`} position={[0, 0.5 - i * 0.06, 0]}>
          <mesh position={[0.12, 0, 0.05]} rotation={[0, 0, 0.3]} material={material}>
            <cylinderGeometry args={[0.01, 0.01, 0.15, 8]} />
          </mesh>
          <mesh position={[-0.12, 0, 0.05]} rotation={[0, 0, -0.3]} material={material}>
            <cylinderGeometry args={[0.01, 0.01, 0.15, 8]} />
          </mesh>
        </group>
      ))}
      
      {/* Pelvis */}
      <mesh position={[0, -0.5, 0]} material={material}>
        <boxGeometry args={[0.3, 0.15, 0.15]} />
      </mesh>
      
      {/* Arms */}
      {[-1, 1].map((side) => (
        <group key={`arm-${side}`}>
          <mesh position={[side * 0.25, 0.7, 0]} rotation={[0, 0, side * 0.2]} material={material}>
            <cylinderGeometry args={[0.025, 0.02, 0.35, 8]} />
          </mesh>
          <mesh position={[side * 0.32, 0.35, 0]} rotation={[0, 0, side * 0.1]} material={material}>
            <cylinderGeometry args={[0.02, 0.018, 0.35, 8]} />
          </mesh>
        </group>
      ))}
      
      {/* Legs */}
      {[-1, 1].map((side) => (
        <group key={`leg-${side}`}>
          <mesh position={[side * 0.1, -0.75, 0]} material={material}>
            <cylinderGeometry args={[0.035, 0.03, 0.45, 8]} />
          </mesh>
          <mesh position={[side * 0.1, -1.2, 0]} material={material}>
            <cylinderGeometry args={[0.03, 0.025, 0.45, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Organs Model - Procedural organs
const OrgansModel = ({ opacity, alerts = [] }: { opacity: number; alerts: PatientAlert[] }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const getOrganColor = (organName: string) => {
    const alertedOrgan = alerts.find(a => 
      a.organ?.toLowerCase() === organName.toLowerCase() ||
      a.title.toLowerCase().includes(organName.toLowerCase())
    );
    if (alertedOrgan) {
      return alertedOrgan.level === 'CRITICAL' ? 0xff4444 : 0xffaa00;
    }
    return organName === 'heart' ? 0xcc4444 : 
           organName === 'lungs' ? 0xffcccc :
           organName === 'liver' ? 0x8b4513 :
           organName === 'kidneys' ? 0xcd5c5c :
           organName === 'stomach' ? 0xffa07a :
           organName === 'intestines' ? 0xf4a460 : 0xcc6666;
  };

  const createOrganMaterial = (organName: string) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(getOrganColor(organName)),
    transparent: true,
    opacity: opacity,
    roughness: 0.4,
  });

  return (
    <group ref={groupRef}>
      {/* Brain */}
      <mesh position={[0, 1.05, 0]} material={createOrganMaterial('brain')}>
        <sphereGeometry args={[0.12, 16, 16]} />
      </mesh>
      
      {/* Heart */}
      <mesh position={[0.05, 0.45, 0.08]} material={createOrganMaterial('heart')}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>
      
      {/* Lungs */}
      <mesh position={[-0.1, 0.45, 0.05]} material={createOrganMaterial('lungs')}>
        <sphereGeometry args={[0.1, 16, 16]} />
      </mesh>
      <mesh position={[0.15, 0.45, 0.05]} material={createOrganMaterial('lungs')}>
        <sphereGeometry args={[0.09, 16, 16]} />
      </mesh>
      
      {/* Liver */}
      <mesh position={[0.08, 0.15, 0.08]} material={createOrganMaterial('liver')}>
        <boxGeometry args={[0.15, 0.08, 0.1]} />
      </mesh>
      
      {/* Stomach */}
      <mesh position={[-0.05, 0.1, 0.06]} material={createOrganMaterial('stomach')}>
        <sphereGeometry args={[0.07, 16, 16]} />
      </mesh>
      
      {/* Kidneys */}
      <mesh position={[-0.12, 0, 0]} material={createOrganMaterial('kidneys')}>
        <sphereGeometry args={[0.04, 16, 16]} />
      </mesh>
      <mesh position={[0.12, 0, 0]} material={createOrganMaterial('kidneys')}>
        <sphereGeometry args={[0.04, 16, 16]} />
      </mesh>
      
      {/* Intestines */}
      <mesh position={[0, -0.2, 0.05]} material={createOrganMaterial('intestines')}>
        <torusGeometry args={[0.1, 0.03, 8, 24]} />
      </mesh>
    </group>
  );
};

// Tissues/Muscles Model
const TissuesModel = ({ opacity }: { opacity: number }) => {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xcc6666),
    transparent: true,
    opacity: opacity,
    roughness: 0.5,
  });

  return (
    <group>
      {/* Torso muscles */}
      <mesh position={[0, 0.3, 0.1]} material={material}>
        <boxGeometry args={[0.35, 0.6, 0.18]} />
      </mesh>
      
      {/* Shoulder muscles */}
      <mesh position={[-0.22, 0.65, 0.05]} material={material}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>
      <mesh position={[0.22, 0.65, 0.05]} material={material}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>
      
      {/* Arm muscles */}
      {[-1, 1].map((side) => (
        <group key={`arm-muscle-${side}`}>
          <mesh position={[side * 0.28, 0.5, 0.03]} material={material}>
            <capsuleGeometry args={[0.04, 0.2, 8, 16]} />
          </mesh>
          <mesh position={[side * 0.32, 0.2, 0.03]} material={material}>
            <capsuleGeometry args={[0.03, 0.25, 8, 16]} />
          </mesh>
        </group>
      ))}
      
      {/* Leg muscles */}
      {[-1, 1].map((side) => (
        <group key={`leg-muscle-${side}`}>
          <mesh position={[side * 0.1, -0.7, 0.05]} material={material}>
            <capsuleGeometry args={[0.06, 0.35, 8, 16]} />
          </mesh>
          <mesh position={[side * 0.1, -1.15, 0.04]} material={material}>
            <capsuleGeometry args={[0.045, 0.35, 8, 16]} />
          </mesh>
        </group>
      ))}
      
      {/* Neck */}
      <mesh position={[0, 0.85, 0.02]} material={material}>
        <cylinderGeometry args={[0.06, 0.08, 0.15, 16]} />
      </mesh>
    </group>
  );
};

// Skin Model
const SkinModel = ({ opacity }: { opacity: number }) => {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffdbac),
    transparent: true,
    opacity: opacity,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1, 0]} material={material}>
        <sphereGeometry args={[0.2, 32, 32]} />
      </mesh>
      
      {/* Neck */}
      <mesh position={[0, 0.75, 0]} material={material}>
        <cylinderGeometry args={[0.08, 0.1, 0.15, 16]} />
      </mesh>
      
      {/* Torso */}
      <mesh position={[0, 0.3, 0]} material={material}>
        <capsuleGeometry args={[0.2, 0.5, 16, 32]} />
      </mesh>
      
      {/* Arms */}
      {[-1, 1].map((side) => (
        <group key={`skin-arm-${side}`}>
          <mesh position={[side * 0.3, 0.55, 0]} rotation={[0, 0, side * 0.15]} material={material}>
            <capsuleGeometry args={[0.05, 0.3, 8, 16]} />
          </mesh>
          <mesh position={[side * 0.35, 0.25, 0]} rotation={[0, 0, side * 0.1]} material={material}>
            <capsuleGeometry args={[0.04, 0.3, 8, 16]} />
          </mesh>
          {/* Hands */}
          <mesh position={[side * 0.38, 0.02, 0]} material={material}>
            <sphereGeometry args={[0.04, 16, 16]} />
          </mesh>
        </group>
      ))}
      
      {/* Legs */}
      {[-1, 1].map((side) => (
        <group key={`skin-leg-${side}`}>
          <mesh position={[side * 0.1, -0.7, 0]} material={material}>
            <capsuleGeometry args={[0.08, 0.4, 8, 16]} />
          </mesh>
          <mesh position={[side * 0.1, -1.2, 0]} material={material}>
            <capsuleGeometry args={[0.06, 0.4, 8, 16]} />
          </mesh>
          {/* Feet */}
          <mesh position={[side * 0.1, -1.48, 0.04]} material={material}>
            <boxGeometry args={[0.08, 0.06, 0.15]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Loading indicator
const LoadingIndicator = () => (
  <Html center>
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">Chargement 3D...</span>
    </div>
  </Html>
);

// Scan effect component
const ScanEffect = ({ progress }: { progress: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.y = 1.5 - progress * 3;
    }
  });

  if (progress >= 1) return null;

  return (
    <mesh ref={meshRef} position={[0, 1.5, 0]}>
      <planeGeometry args={[1, 0.02]} />
      <meshBasicMaterial color={0x00ffff} transparent opacity={0.8} />
    </mesh>
  );
};

// Main Scene Component
const Scene = ({ 
  layers, 
  alerts,
  scanProgress 
}: { 
  layers: LayerConfig[];
  alerts: PatientAlert[];
  scanProgress: number;
}) => {
  const controlsRef = useRef<any>(null);

  const getLayer = (id: string) => layers.find(l => l.id === id);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <directionalLight position={[-5, -10, -5]} intensity={0.3} />
      
      <OrbitControls 
        ref={controlsRef}
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={1}
        maxDistance={5}
        autoRotate={false}
      />
      
      <group position={[0, 0, 0]}>
        {getLayer('bones')?.visible && (
          <SkeletonModel opacity={getLayer('bones')?.opacity || 1} />
        )}
        {getLayer('organs')?.visible && (
          <OrgansModel opacity={getLayer('organs')?.opacity || 1} alerts={alerts} />
        )}
        {getLayer('tissues')?.visible && (
          <TissuesModel opacity={getLayer('tissues')?.opacity || 1} />
        )}
        {getLayer('skin')?.visible && (
          <SkinModel opacity={getLayer('skin')?.opacity || 1} />
        )}
      </group>
      
      <ScanEffect progress={scanProgress} />
    </>
  );
};

const DigitalTwin3DViewer: React.FC<DigitalTwin3DViewerProps> = ({ 
  alerts = [], 
  pathologyName 
}) => {
  const controlsRef = useRef<any>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(true);
  
  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: 'skin', name: 'Peau', visible: true, opacity: 0.4, color: '#ffdbac', icon: <User className="h-4 w-4" /> },
    { id: 'tissues', name: 'Tissus', visible: true, opacity: 0.6, color: '#cc6666', icon: <Layers className="h-4 w-4" /> },
    { id: 'organs', name: 'Organes', visible: true, opacity: 0.8, color: '#cc4444', icon: <Heart className="h-4 w-4" /> },
    { id: 'bones', name: 'Os', visible: true, opacity: 1, color: '#f5f5dc', icon: <Bone className="h-4 w-4" /> },
  ]);

  // Scan animation on mount
  useEffect(() => {
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 1) {
          clearInterval(interval);
          setIsScanning(false);
          return 1;
        }
        return prev + 0.02;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const toggleLayer = (id: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === id ? { ...layer, visible: !layer.visible } : layer
    ));
  };

  const setLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === id ? { ...layer, opacity } : layer
    ));
  };

  const resetView = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const setPresetView = (view: 'front' | 'left' | 'right' | 'back') => {
    // Views will be controlled by OrbitControls camera position
    // This is a simplified implementation
  };

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">🧬</span>
            Jumeau Numérique 3D
            {pathologyName && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({pathologyName})
              </span>
            )}
          </CardTitle>
          {isScanning && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${scanProgress * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">Scan...</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 3D Viewer */}
          <div className="lg:col-span-3 h-[450px] bg-gradient-to-b from-muted/50 to-muted rounded-lg overflow-hidden relative">
            <Canvas 
              camera={{ position: [0, 0, 2.5], fov: 50 }}
              gl={{ antialias: true }}
            >
              <Suspense fallback={<LoadingIndicator />}>
                <Scene 
                  layers={layers} 
                  alerts={alerts}
                  scanProgress={scanProgress}
                />
              </Suspense>
            </Canvas>
            
            {/* View preset buttons */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPresetView('front')}>
                Face
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPresetView('left')}>
                Profil G
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPresetView('right')}>
                Profil D
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPresetView('back')}>
                Dos
              </Button>
            </div>
            
            {/* Reset button */}
            <Button 
              variant="outline" 
              size="icon" 
              className="absolute top-4 right-4"
              onClick={resetView}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            
            {/* Instructions */}
            <div className="absolute top-4 left-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
              🖱️ Clic + glisser pour pivoter | Molette pour zoomer
            </div>
          </div>
          
          {/* Control Panel */}
          <div className="space-y-4">
            <div className="text-sm font-medium">Calques anatomiques</div>
            
            {layers.map((layer) => (
              <div key={layer.id} className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: layer.color }}
                    />
                    {layer.icon}
                    <Label className="text-sm">{layer.name}</Label>
                  </div>
                  <Switch
                    checked={layer.visible}
                    onCheckedChange={() => toggleLayer(layer.id)}
                  />
                </div>
                
                {layer.visible && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Opacité</span>
                    <Slider
                      value={[layer.opacity * 100]}
                      onValueChange={([value]) => setLayerOpacity(layer.id, value / 100)}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs w-8">{Math.round(layer.opacity * 100)}%</span>
                  </div>
                )}
              </div>
            ))}
            
            {/* Alerts Legend */}
            {alerts.length > 0 && (
              <div className="mt-4 p-3 border rounded-lg">
                <div className="text-sm font-medium mb-2">Alertes détectées</div>
                <div className="space-y-1">
                  {alerts.slice(0, 3).map((alert, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full ${
                        alert.level === 'CRITICAL' ? 'bg-destructive' : 'bg-yellow-500'
                      }`} />
                      <span className="truncate">{alert.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DigitalTwin3DViewer;
