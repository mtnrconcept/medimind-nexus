import { Component, Suspense, useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import { meshOrgan, locateAlert, type AtlasLayerId, type AnatomicalView } from '@/lib/anatomicalTwin';

interface Props {
  layers: AtlasLayerId[];
  opacity: number;
  alerts: PatientAlert[];
  pulse: boolean;
  view: AnatomicalView;
  cameraRevision: number;
}

class AtlasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert" className="p-6 text-sm text-red-200">L’atlas 3D n’a pas pu être affiché. La vue illustrée et les alertes du dossier restent accessibles.</p> : this.props.children;
  }
}

function AtlasScene({ layers, opacity, alerts, pulse }: Props) {
  const invalidate = useThree(state => state.invalidate);
  const gltf = useLoader(GLTFLoader, '/models/MediCore-Atlas3D-web.glb', loader => loader.setMeshoptDecoder(MeshoptDecoder));
  const animated = useRef<THREE.MeshStandardMaterial[]>([]);
  const reducedMotion = useRef(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = preference.matches; invalidate(); };
    update(); preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, [invalidate]);

  const { scene, materials, scale, center } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const materials: THREE.Material[] = [];
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const clone = (material: THREE.Material) => { const copy = material.clone(); materials.push(copy); return copy; };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.6 / Math.max(size.x, size.y, size.z, .001);
    return { scene, materials, scale, center: box.getCenter(new THREE.Vector3()) };
  }, [gltf]);

  useEffect(() => () => { materials.forEach(material => material.dispose()); }, [materials]);

  useEffect(() => {
    animated.current = [];
    scene.traverse(object => {
      // Group names are the atlas's original system identifiers.
      if (object.parent === scene) object.visible = layers.includes(object.name as AtlasLayerId);
      if (!(object instanceof THREE.Mesh)) return;
      const target = meshOrgan(object.name, object.parent?.name);
      const matching = target ? alerts.filter(alert => locateAlert(alert.organ)?.id === target && alert.level !== 'INFO') : [];
      const critical = matching.some(alert => alert.level === 'CRITICAL');
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.transparent = opacity < 100;
        material.opacity = opacity / 100;
        material.depthWrite = opacity === 100;
        material.emissive.set(matching.length && pulse ? (critical ? '#ef2222' : '#ff6600') : '#000000');
        material.emissiveIntensity = matching.length && pulse ? .7 : 0;
        material.needsUpdate = true;
        if (matching.length && pulse) animated.current.push(material);
      }
    });
    invalidate();
  }, [scene, layers, opacity, alerts, pulse, invalidate]);

  useFrame(({ clock }) => {
    const intensity = reducedMotion.current ? .65 : .35 + .5 * (1 + Math.sin(clock.elapsedTime * 3));
    for (const material of animated.current) {
      material.emissiveIntensity = intensity;
      material.opacity = (opacity / 100) * (reducedMotion.current ? .85 : .65 + .35 * (1 + Math.sin(clock.elapsedTime * 3)) / 2);
      material.transparent = true;
      material.depthWrite = false;
    }
    if (animated.current.length && !reducedMotion.current) invalidate();
  });

  return <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}><primitive object={scene} dispose={null} /></group>;
}

function AtlasCanvas(props: Props) {
  const rotation: Record<AnatomicalView, number> = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  return <Canvas frameloop="demand" style={{ touchAction: 'none' }} camera={{ position: [0, 0, 3.8], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'default' }}>
    <ambientLight intensity={1.1} /><directionalLight position={[3, 4, 5]} intensity={2} /><directionalLight position={[-3, 1, -2]} intensity={.8} />
    <Suspense fallback={<Html center><AtlasLoading /></Html>}>
      <group rotation={[0, rotation[props.view], 0]}><AtlasScene {...props} /></group>
    </Suspense>
    <AtlasCameraControls view={props.view} cameraRevision={props.cameraRevision} />
  </Canvas>;
}

function AtlasCameraControls({ view, cameraRevision }: Pick<Props, 'view' | 'cameraRevision'>) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree(state => state.camera);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    camera.position.set(0, 0, 3.8);
    camera.up.set(0, 1, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [view, cameraRevision, camera, invalidate]);
  return <OrbitControls key={`${view}-${cameraRevision}`} ref={controls} enablePan enableDamping dampingFactor={0.12} minDistance={1.6} maxDistance={7} mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />;
}

function AtlasLoading() {
  const { progress } = useProgress();
  return <p className="whitespace-nowrap rounded-md bg-slate-950/90 px-4 py-2 text-sm text-white" role="status">Chargement de l’atlas 3D… {Math.round(progress)} %</p>;
}

export default function AnatomicalAtlas3D(props: Props) {
  return <AtlasBoundary><AtlasCanvas {...props} /></AtlasBoundary>;
}
