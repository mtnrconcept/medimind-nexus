import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, RotateCcw, User, Bone, Heart, Layers, AlertTriangle } from 'lucide-react';
import { PatientAlert } from '@/hooks/usePatientAlerts';

interface LayerConfig {
  id: 'skin' | 'tissues' | 'organs' | 'bones';
  name: string;
  visible: boolean;
  opacity: number;
  color: string;
  icon: React.ReactNode;
}

interface OrganMarker {
  name: string;
  position: [number, number, number];
  alert?: PatientAlert;
}

interface DigitalTwin3DViewerProps {
  alerts?: PatientAlert[];
  pathologyName?: string;
}

// Pulsing Alert Marker Component
const AlertMarker = ({ 
  position, 
  alert, 
  organName 
}: { 
  position: [number, number, number]; 
  alert: PatientAlert;
  organName: string;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [scale, setScale] = useState(1);
  
  const isCritical = alert.level === 'CRITICAL';
  const color = isCritical ? '#ef4444' : '#f59e0b';

  useFrame((state) => {
    // Pulsing animation
    const pulse = Math.sin(state.clock.elapsedTime * (isCritical ? 4 : 2)) * 0.3 + 1;
    setScale(pulse);
    
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse * (hovered ? 1.3 : 1));
    }
    
    if (ringRef.current) {
      ringRef.current.scale.setScalar(pulse * 1.5);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - (pulse - 0.7) * 0.3;
    }
  });

  return (
    <group position={position}>
      {/* Main marker sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* Pulsing ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.05, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Glow effect */}
      <pointLight color={color} intensity={hovered ? 2 : 1} distance={0.3} />
      
      {/* Tooltip on hover */}
      {hovered && (
        <Html
          position={[0.1, 0.1, 0]}
          style={{
            transform: 'translate3d(0, -50%, 0)',
            pointerEvents: 'none',
          }}
        >
          <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[200px] animate-scale-in">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`h-4 w-4 ${isCritical ? 'text-destructive' : 'text-yellow-500'}`} />
              <span className={`text-sm font-semibold ${isCritical ? 'text-destructive' : 'text-yellow-500'}`}>
                {isCritical ? 'CRITIQUE' : 'ALERTE'}
              </span>
            </div>
            <div className="text-sm font-medium text-foreground mb-1">{organName}</div>
            <div className="text-xs text-muted-foreground">{alert.title}</div>
            {alert.description && (
              <div className="text-xs text-muted-foreground mt-1 border-t border-border pt-1">
                {alert.description}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

// Connection line between related organs
const ConnectionLine = ({ 
  start, 
  end, 
  color = '#ef4444' 
}: { 
  start: [number, number, number]; 
  end: [number, number, number];
  color?: string;
}) => {
  const lineRef = useRef<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>(null);
  
  useFrame((state) => {
    if (lineRef.current) {
      lineRef.current.material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <primitive object={new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }))} ref={lineRef} />
  );
};

// Organ positions mapping
const ORGAN_POSITIONS: Record<string, [number, number, number]> = {
  brain: [0, 1.05, 0.05],
  heart: [0.05, 0.45, 0.12],
  lungs: [0, 0.45, 0.1],
  liver: [0.08, 0.15, 0.12],
  stomach: [-0.05, 0.1, 0.1],
  kidneys: [0, 0, 0.05],
  intestines: [0, -0.2, 0.1],
  pancreas: [0, 0.05, 0.08],
  spleen: [-0.12, 0.1, 0.05],
  bladder: [0, -0.4, 0.08],
};

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

// Interactive Organ Component
const InteractiveOrgan = ({ 
  position, 
  geometry, 
  material, 
  name,
  hasAlert
}: { 
  position: [number, number, number];
  geometry: React.ReactNode;
  material: THREE.MeshStandardMaterial;
  name: string;
  hasAlert: boolean;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  useFrame((state) => {
    if (meshRef.current && hasAlert) {
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.05 + 1;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      material={material}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {geometry}
      {hovered && !hasAlert && (
        <Html position={[0, 0.1, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bg-popover/90 backdrop-blur-sm border border-border rounded px-2 py-1 text-xs font-medium text-foreground whitespace-nowrap">
            {name}
          </div>
        </Html>
      )}
    </mesh>
  );
};

// Organs Model - Procedural organs with interactivity
const OrgansModel = ({ opacity, alerts = [] }: { opacity: number; alerts: PatientAlert[] }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const getOrganAlert = (organName: string): PatientAlert | undefined => {
    return alerts.find(a => 
      a.organ?.toLowerCase() === organName.toLowerCase() ||
      a.title.toLowerCase().includes(organName.toLowerCase())
    );
  };

  const getOrganColor = (organName: string) => {
    const alert = getOrganAlert(organName);
    if (alert) {
      return alert.level === 'CRITICAL' ? 0xff4444 : 0xffaa00;
    }
    return organName === 'heart' ? 0xcc4444 : 
           organName === 'lungs' ? 0xffcccc :
           organName === 'liver' ? 0x8b4513 :
           organName === 'kidneys' ? 0xcd5c5c :
           organName === 'stomach' ? 0xffa07a :
           organName === 'brain' ? 0xffb6c1 :
           organName === 'intestines' ? 0xf4a460 : 0xcc6666;
  };

  const createOrganMaterial = (organName: string) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(getOrganColor(organName)),
    transparent: true,
    opacity: opacity,
    roughness: 0.4,
    emissive: getOrganAlert(organName) ? new THREE.Color(getOrganColor(organName)) : new THREE.Color(0x000000),
    emissiveIntensity: getOrganAlert(organName) ? 0.3 : 0,
  });

  const organs = [
    { name: 'Cerveau', key: 'brain', position: [0, 1.05, 0] as [number, number, number], geometry: <sphereGeometry args={[0.12, 16, 16]} /> },
    { name: 'Cœur', key: 'heart', position: [0.05, 0.45, 0.08] as [number, number, number], geometry: <sphereGeometry args={[0.08, 16, 16]} /> },
    { name: 'Poumon gauche', key: 'lungs', position: [-0.1, 0.45, 0.05] as [number, number, number], geometry: <sphereGeometry args={[0.1, 16, 16]} /> },
    { name: 'Poumon droit', key: 'lungs', position: [0.15, 0.45, 0.05] as [number, number, number], geometry: <sphereGeometry args={[0.09, 16, 16]} /> },
    { name: 'Foie', key: 'liver', position: [0.08, 0.15, 0.08] as [number, number, number], geometry: <boxGeometry args={[0.15, 0.08, 0.1]} /> },
    { name: 'Estomac', key: 'stomach', position: [-0.05, 0.1, 0.06] as [number, number, number], geometry: <sphereGeometry args={[0.07, 16, 16]} /> },
    { name: 'Rein gauche', key: 'kidneys', position: [-0.12, 0, 0] as [number, number, number], geometry: <sphereGeometry args={[0.04, 16, 16]} /> },
    { name: 'Rein droit', key: 'kidneys', position: [0.12, 0, 0] as [number, number, number], geometry: <sphereGeometry args={[0.04, 16, 16]} /> },
    { name: 'Intestins', key: 'intestines', position: [0, -0.2, 0.05] as [number, number, number], geometry: <torusGeometry args={[0.1, 0.03, 8, 24]} /> },
  ];

  // Get markers for alerted organs
  const alertMarkers = alerts.map(alert => {
    const organKey = alert.organ?.toLowerCase() || 
                     Object.keys(ORGAN_POSITIONS).find(key => 
                       alert.title.toLowerCase().includes(key)
                     );
    if (organKey && ORGAN_POSITIONS[organKey]) {
      return {
        position: ORGAN_POSITIONS[organKey],
        alert,
        organName: organKey.charAt(0).toUpperCase() + organKey.slice(1)
      };
    }
    return null;
  }).filter(Boolean) as { position: [number, number, number]; alert: PatientAlert; organName: string }[];

  return (
    <group ref={groupRef}>
      {organs.map((organ, idx) => (
        <InteractiveOrgan
          key={`${organ.key}-${idx}`}
          position={organ.position}
          geometry={organ.geometry}
          material={createOrganMaterial(organ.key)}
          name={organ.name}
          hasAlert={!!getOrganAlert(organ.key)}
        />
      ))}
      
      {/* Alert markers */}
      {alertMarkers.map((marker, idx) => (
        <AlertMarker
          key={`marker-${idx}`}
          position={marker.position}
          alert={marker.alert}
          organName={marker.organName}
        />
      ))}
      
      {/* Connection lines between related alerted organs */}
      {alertMarkers.length >= 2 && (
        <ConnectionLine
          start={alertMarkers[0].position}
          end={alertMarkers[1].position}
          color={alertMarkers[0].alert.level === 'CRITICAL' ? '#ef4444' : '#f59e0b'}
        />
      )}
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

// Camera Controller for preset views
const CameraController = ({ targetPosition, controlsRef }: { targetPosition: [number, number, number] | null; controlsRef: React.RefObject<any> }) => {
  const { camera } = useThree();
  
  useEffect(() => {
    if (targetPosition && controlsRef.current) {
      const [x, y, z] = targetPosition;
      camera.position.set(x, y, z);
      controlsRef.current.update();
    }
  }, [targetPosition, camera, controlsRef]);
  
  return null;
};

// Main Scene Component
const Scene = ({ 
  layers, 
  alerts,
  scanProgress,
  cameraPosition,
  controlsRef
}: { 
  layers: LayerConfig[];
  alerts: PatientAlert[];
  scanProgress: number;
  cameraPosition: [number, number, number] | null;
  controlsRef: React.RefObject<any>;
}) => {
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
      
      <CameraController targetPosition={cameraPosition} controlsRef={controlsRef} />
      
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
  const [cameraPosition, setCameraPosition] = useState<[number, number, number] | null>(null);
  
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
    setCameraPosition([0, 0, 2.5]);
    setTimeout(() => setCameraPosition(null), 100);
  };

  const setPresetView = (view: 'front' | 'left' | 'right' | 'back') => {
    const positions: Record<string, [number, number, number]> = {
      front: [0, 0, 2.5],
      left: [-2.5, 0, 0],
      right: [2.5, 0, 0],
      back: [0, 0, -2.5],
    };
    setCameraPosition(positions[view]);
    setTimeout(() => setCameraPosition(null), 100);
  };

  const alertCount = alerts.length;

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
            {alertCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded-full">
                {alertCount} alerte{alertCount > 1 ? 's' : ''}
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
                  cameraPosition={cameraPosition}
                  controlsRef={controlsRef}
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
              🖱️ Clic + glisser pour pivoter | Molette pour zoomer | Survol organes pour détails
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
              <div className="mt-4 p-3 border rounded-lg bg-destructive/5">
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Alertes détectées
                </div>
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((alert, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full mt-1 animate-pulse ${
                        alert.level === 'CRITICAL' ? 'bg-destructive' : 'bg-yellow-500'
                      }`} />
                      <div>
                        <span className="font-medium">{alert.title}</span>
                        {alert.organ && (
                          <span className="text-muted-foreground ml-1">({alert.organ})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  💡 Survolez les marqueurs sur le modèle 3D pour plus de détails
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
