import React, { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, RotateCcw, User, Bone, Heart, Layers, AlertTriangle, Search } from 'lucide-react';
import { PatientAlert } from '@/hooks/usePatientAlerts';
import AnatomyMarkers from './AnatomyMarkers';
import AnatomySearch from './AnatomySearch';
import { ALL_ANATOMY_PARTS, AnatomyPart, AnatomyCategory } from '@/data/anatomyData';

interface LayerConfig {
  id: 'skin' | 'tissues' | 'organs' | 'bones' | 'markers';
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

// OBJ Model Component - Loads the FinalBaseMesh.obj
const OBJModel = ({ opacity, color }: { opacity: number; color: string }) => {
  const obj = useLoader(OBJLoader, '/models/FinalBaseMesh.obj');
  const meshRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (obj) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: opacity,
            roughness: 0.7,
            side: THREE.DoubleSide,
          });
        }
      });
    }
  }, [obj, opacity, color]);

  // Center and scale the model
  useEffect(() => {
    if (obj && meshRef.current) {
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.5 / maxDim;

      obj.position.set(-center.x * scale, -center.y * scale + 0.2, -center.z * scale);
      obj.scale.setScalar(scale);
    }
  }, [obj]);

  return <primitive ref={meshRef} object={obj} />;
};

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

  const isCritical = alert.level === 'CRITICAL';
  const color = isCritical ? '#ef4444' : '#f59e0b';

  useFrame((state) => {
    const pulse = Math.sin(state.clock.elapsedTime * (isCritical ? 4 : 2)) * 0.3 + 1;

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
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.05, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      <pointLight color={color} intensity={hovered ? 2 : 1} distance={0.3} />

      {hovered && (
        <Html
          position={[0.1, 0.1, 0]}
          style={{
            transform: 'translate3d(0, -50%, 0)',
            pointerEvents: 'none',
          }}
        >
          <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[200px] animate-scale-in z-50">
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
      {[...Array(24)].map((_, i) => (
        <mesh key={`vertebra-${i}`} position={[0, 0.8 - i * 0.08, 0]} material={material}>
          <boxGeometry args={[0.08, 0.06, 0.1]} />
        </mesh>
      ))}

      <mesh position={[0, 1.1, 0]} material={material}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>

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

      <mesh position={[0, -0.5, 0]} material={material}>
        <boxGeometry args={[0.3, 0.15, 0.15]} />
      </mesh>

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

// Organs Model
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

      {alertMarkers.map((marker, idx) => (
        <AlertMarker
          key={`marker-${idx}`}
          position={marker.position}
          alert={marker.alert}
          organName={marker.organName}
        />
      ))}
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
      <mesh position={[0, 0.3, 0.1]} material={material}>
        <boxGeometry args={[0.35, 0.6, 0.18]} />
      </mesh>

      <mesh position={[-0.22, 0.65, 0.05]} material={material}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>
      <mesh position={[0.22, 0.65, 0.05]} material={material}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>

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

      <mesh position={[0, 0.85, 0.02]} material={material}>
        <cylinderGeometry args={[0.06, 0.08, 0.15, 16]} />
      </mesh>
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

// Camera Controller with zoom to selection
const CameraController = ({
  targetPosition,
  zoomTarget,
  controlsRef
}: {
  targetPosition: [number, number, number] | null;
  zoomTarget: AnatomyPart | null;
  controlsRef: React.RefObject<any>;
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (targetPosition && controlsRef.current) {
      const [x, y, z] = targetPosition;
      camera.position.set(x, y, z);
      controlsRef.current.update();
    }
  }, [targetPosition, camera, controlsRef]);

  // Zoom to selected anatomy part
  useEffect(() => {
    if (zoomTarget && controlsRef.current) {
      const [px, py, pz] = zoomTarget.position;

      // Calculate camera position based on part position
      const distance = 0.8; // Close zoom
      const cameraX = px + distance * 0.5;
      const cameraY = py + distance * 0.3;
      const cameraZ = pz + distance;

      // Animate camera to position
      const startPos = camera.position.clone();
      const targetPos = new THREE.Vector3(cameraX, cameraY, cameraZ);
      const lookAt = new THREE.Vector3(px, py, pz);

      let progress = 0;
      const animate = () => {
        progress += 0.05;
        if (progress <= 1) {
          const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
          camera.position.lerpVectors(startPos, targetPos, eased);
          controlsRef.current.target.lerp(lookAt, eased);
          controlsRef.current.update();
          requestAnimationFrame(animate);
        }
      };
      animate();
    }
  }, [zoomTarget, camera, controlsRef]);

  return null;
};

// Main Scene Component
const Scene = ({
  layers,
  alerts,
  scanProgress,
  cameraPosition,
  zoomTarget,
  controlsRef,
  visibleCategories,
  selectedPart,
  hoveredPart,
  onSelectPart,
  onHoverPart,
  showMarkers,
}: {
  layers: LayerConfig[];
  alerts: PatientAlert[];
  scanProgress: number;
  cameraPosition: [number, number, number] | null;
  zoomTarget: AnatomyPart | null;
  controlsRef: React.RefObject<any>;
  visibleCategories: AnatomyCategory[];
  selectedPart: AnatomyPart | null;
  hoveredPart: AnatomyPart | null;
  onSelectPart: (part: AnatomyPart) => void;
  onHoverPart: (part: AnatomyPart | null) => void;
  showMarkers: boolean;
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
        minDistance={0.5}
        maxDistance={5}
        autoRotate={false}
      />

      <CameraController
        targetPosition={cameraPosition}
        zoomTarget={zoomTarget}
        controlsRef={controlsRef}
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
          <Suspense fallback={null}>
            <OBJModel
              opacity={getLayer('skin')?.opacity || 1}
              color={getLayer('skin')?.color || '#ffdbac'}
            />
          </Suspense>
        )}

        {/* Anatomy Markers */}
        {showMarkers && (
          <AnatomyMarkers
            parts={ALL_ANATOMY_PARTS}
            visibleCategories={visibleCategories}
            selectedPart={selectedPart}
            hoveredPart={hoveredPart}
            onSelect={onSelectPart}
            onHover={onHoverPart}
          />
        )}
      </group>

      <ScanEffect progress={scanProgress} />
    </>
  );
};

// Check if WebGL is available
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

// 2D Fallback Component when WebGL is unavailable
const Fallback2DViewer = ({ alerts }: { alerts: PatientAlert[] }) => (
  <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-muted/50 to-muted p-6 text-center">
    <div className="text-6xl mb-4">🧬</div>
    <h3 className="text-lg font-semibold mb-2">Visualisation 3D non disponible</h3>
    <p className="text-sm text-muted-foreground mb-4 max-w-sm">
      WebGL est désactivé ou non supporté par votre navigateur.
      Le jumeau numérique 3D ne peut pas être affiché.
    </p>
    <div className="text-xs text-muted-foreground mb-4">
      💡 Essayez Chrome, Firefox ou Edge avec WebGL activé
    </div>
    {alerts.length > 0 && (
      <div className="mt-4 p-4 border rounded-lg bg-destructive/10 max-w-md">
        <div className="text-sm font-medium mb-2 flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {alerts.length} alerte(s) patient
        </div>
        <div className="space-y-1">
          {alerts.slice(0, 3).map((alert, idx) => (
            <div key={idx} className="text-xs text-left flex gap-2">
              <span className={alert.level === 'CRITICAL' ? 'text-destructive' : 'text-yellow-500'}>●</span>
              <span>{alert.title}{alert.organ && ` (${alert.organ})`}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const DigitalTwin3DViewer: React.FC<DigitalTwin3DViewerProps> = ({
  alerts = [],
  pathologyName
}) => {
  const controlsRef = useRef<any>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(true);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number] | null>(null);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

  // Check WebGL availability on mount
  useEffect(() => {
    setWebglAvailable(isWebGLAvailable());
  }, []);

  // Anatomy selection state
  const [selectedPart, setSelectedPart] = useState<AnatomyPart | null>(null);
  const [hoveredPart, setHoveredPart] = useState<AnatomyPart | null>(null);
  const [zoomTarget, setZoomTarget] = useState<AnatomyPart | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<AnatomyCategory[]>([
    'bone', 'organ', 'muscle', 'tooth', 'nerve', 'vessel'
  ]);

  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: 'skin', name: 'Peau (OBJ)', visible: true, opacity: 0.3, color: '#ffdbac', icon: <User className="h-4 w-4" /> },
    { id: 'tissues', name: 'Tissus', visible: false, opacity: 0.6, color: '#cc6666', icon: <Layers className="h-4 w-4" /> },
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
    setSelectedPart(null);
    setZoomTarget(null);
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

  const handleSelectPart = useCallback((part: AnatomyPart) => {
    setSelectedPart(part);
    setZoomTarget(part);
    // Clear zoom target after animation
    setTimeout(() => setZoomTarget(null), 1000);
  }, []);

  const handleHoverPart = useCallback((part: AnatomyPart | null) => {
    setHoveredPart(part);
  }, []);

  const handleCategoryToggle = useCallback((category: AnatomyCategory) => {
    setVisibleCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  }, []);

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
          <div className="flex items-center gap-2">
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
            <Button
              variant={showSearchPanel ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowSearchPanel(!showSearchPanel)}
            >
              <Search className="h-4 w-4 mr-1" />
              Anatomie
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 3D Viewer */}
          <div className={`${showSearchPanel ? 'lg:col-span-2' : 'lg:col-span-3'} h-[500px] bg-gradient-to-b from-muted/50 to-muted rounded-lg overflow-hidden relative`}>
            {/* Show 2D fallback when WebGL is unavailable */}
            {webglAvailable === false && (
              <Fallback2DViewer alerts={alerts} />
            )}

            {/* WebGL Canvas - only render when WebGL is available */}
            {webglAvailable === true && (
              <Canvas
                camera={{ position: [0, 0, 2.5], fov: 50 }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => {
                  gl.domElement.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    setContextLost(true);
                    console.warn('WebGL Context Lost');
                  });
                  gl.domElement.addEventListener('webglcontextrestored', () => {
                    setContextLost(false);
                    console.log('WebGL Context Restored');
                  });
                }}
              >
                <Suspense fallback={<LoadingIndicator />}>
                  <Scene
                    layers={layers}
                    alerts={alerts}
                    scanProgress={scanProgress}
                    cameraPosition={cameraPosition}
                    zoomTarget={zoomTarget}
                    controlsRef={controlsRef}
                    visibleCategories={visibleCategories}
                    selectedPart={selectedPart}
                    hoveredPart={hoveredPart}
                    onSelectPart={handleSelectPart}
                    onHoverPart={handleHoverPart}
                    showMarkers={showMarkers}
                  />
                </Suspense>
              </Canvas>
            )}

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

            {/* Toggle markers */}
            <div className="absolute bottom-4 right-4">
              <Button
                variant={showMarkers ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowMarkers(!showMarkers)}
              >
                {showMarkers ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Marqueurs
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
              🖱️ Clic + glisser pour pivoter | Molette pour zoomer | Clic sur marqueurs
            </div>

            {/* Selected part info */}
            {selectedPart && (
              <div className="absolute bottom-16 left-4 bg-background/95 border border-border rounded-lg p-3 max-w-[250px] animate-fade-in">
                <div className="text-sm font-semibold text-foreground">{selectedPart.name}</div>
                <div className="text-xs text-muted-foreground italic">{selectedPart.nameEn}</div>
                {selectedPart.description && (
                  <div className="text-xs text-muted-foreground mt-1">{selectedPart.description}</div>
                )}
                {selectedPart.system && (
                  <div className="text-xs text-primary mt-1">Système: {selectedPart.system}</div>
                )}
              </div>
            )}


            {/* Context Lost Fallback */}
            {contextLost && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
                <div className="text-center p-6 max-w-md">
                  <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Erreur d'affichage 3D</h3>
                  <p className="text-muted-foreground mb-4">
                    Le contexte graphique a été perdu. Le navigateur tente de le restaurer.
                  </p>
                  <Button onClick={() => window.location.reload()} variant="outline">
                    Recharger la page
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Anatomy Search Panel */}
          {showSearchPanel && (
            <div className="lg:col-span-1">
              <AnatomySearch
                selectedPart={selectedPart}
                visibleCategories={visibleCategories}
                onSelectPart={handleSelectPart}
                onToggleCategory={handleCategoryToggle}
                markersVisible={showMarkers}
                onToggleMarkers={() => setShowMarkers(!showMarkers)}
              />
            </div>
          )}

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
                      <div className={`w-2 h-2 rounded-full mt-1 animate-pulse ${alert.level === 'CRITICAL' ? 'bg-destructive' : 'bg-yellow-500'
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
    </Card >
  );
};

export default DigitalTwin3DViewer;
