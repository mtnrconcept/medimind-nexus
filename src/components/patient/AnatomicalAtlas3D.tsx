import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, events, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import type { AtlasLayerId, AnatomicalView } from '@/lib/anatomicalTwin';
import { createAtlasClickGuard, getMeshAlertSelection, isAtlasObjectVisible } from '@/lib/anatomicalTwinInteractions';

export interface AtlasAlertHit {
  name: string;
  system?: string;
  clientX: number;
  clientY: number;
}

interface Props {
  layers: AtlasLayerId[];
  opacity: number;
  alerts: PatientAlert[];
  pulse: boolean;
  view: AnatomicalView;
  viewRevision?: number;
  onAlertSelect?: (hit: AtlasAlertHit | null) => void;
}

class AtlasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert" className="p-6 text-sm text-red-200">L’atlas 3D n’a pas pu être affiché. La vue illustrée et les alertes du dossier restent accessibles.</p> : this.props.children;
  }
}

function AtlasScene({ layers, opacity, alerts, pulse, onAlertSelect, clickGuard }: Props & { clickGuard: ReturnType<typeof createAtlasClickGuard> }) {
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

  // The same association drives the highlight and its explanation. Keep only
  // identity in the selection; the popup reads the current dossier alerts.
  const selections = useMemo(() => {
    const result = new Map<string, ReturnType<typeof getMeshAlertSelection<PatientAlert>>>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const selection = getMeshAlertSelection(object.name, object.parent?.name, alerts);
        if (selection) result.set(object.uuid, selection);
      }
    });
    return result;
  }, [scene, alerts]);

  useEffect(() => {
    animated.current = [];
    scene.traverse(object => {
      // Group names are the atlas's original system identifiers.
      if (object.parent === scene) object.visible = layers.includes(object.name as AtlasLayerId);
      if (!(object instanceof THREE.Mesh)) return;
      const matching = selections.get(object.uuid)?.alerts ?? [];
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
  }, [scene, layers, opacity, selections, pulse, invalidate]);

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

  const selectAlert = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!clickGuard.consumeClick(event.nativeEvent)) return;
    if (!pulse || opacity <= 0) {
      onAlertSelect?.(null);
      return;
    }
    // Transparent layers reveal deeper structures. Pick the nearest highlighted
    // surface visible through them, stopping at the first opaque obstruction.
    for (const hit of event.intersections) {
      const object = hit.object;
      if (!isAtlasObjectVisible(object)) continue;
      const visibleMaterials = intersectionMaterials(hit).filter(material => material.visible && material.opacity > 0);
      if (!visibleMaterials.length) continue;
      if (selections.has(object.uuid)) {
        onAlertSelect?.({ name: object.name, system: object.parent?.name, clientX: event.clientX, clientY: event.clientY });
        return;
      }
      if (visibleMaterials.some(material => !material.transparent || material.opacity >= 1)) break;
    }
    onAlertSelect?.(null);
  };

  return <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}><primitive object={scene} dispose={null} onClick={selectAlert} /></group>;
}

function intersectionMaterials(hit: THREE.Intersection): THREE.Material[] {
  if (!(hit.object instanceof THREE.Mesh)) return [];
  if (!Array.isArray(hit.object.material)) return [hit.object.material];
  const material = hit.face ? hit.object.material[hit.face.materialIndex] : undefined;
  return material ? [material] : hit.object.material;
}

function visibleAtlasEvents(state: Parameters<typeof events>[0]) {
  return {
    ...events(state),
    filter: (intersections: THREE.Intersection[]) => intersections.filter(hit => {
      if (!isAtlasObjectVisible(hit.object)) return false;
      return intersectionMaterials(hit).some(material => material.visible && material.opacity > 0);
    }),
  };
}

function AtlasNavigation({ view, viewRevision }: Pick<Props, 'view' | 'viewRevision'>) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 3.8);
    camera.up.set(0, 1, 0);
    controls.current?.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [camera, view, viewRevision, invalidate]);

  return <OrbitControls ref={controls} makeDefault enablePan screenSpacePanning enableDamping={false}
    mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    minDistance={1.6} maxDistance={7} />;
}

function AtlasCanvas(props: Props) {
  const clickGuard = useMemo(() => createAtlasClickGuard(), []);
  useEffect(() => {
    const cancel = () => clickGuard.cancel();
    const move = (event: PointerEvent) => clickGuard.pointerMove(event);
    const release = (event: PointerEvent) => clickGuard.pointerUp(event);
    window.addEventListener('blur', cancel);
    // OrbitControls continues a gesture outside the canvas. Track the same
    // document-wide motion so an out-and-back drag can never become a click.
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', cancel, true);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', cancel, true);
    };
  }, [clickGuard]);
  const rotation: Record<AnatomicalView, number> = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  return <div className="h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary" tabIndex={0}
    role="region" aria-label="Atlas 3D interactif"
    onContextMenu={event => event.preventDefault()}
    onPointerDownCapture={event => { event.currentTarget.focus({ preventScroll: true }); clickGuard.pointerDown(event.nativeEvent); }}>
    <Canvas frameloop="demand" camera={{ position: [0, 0, 3.8], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'default' }}
      events={visibleAtlasEvents} style={{ touchAction: 'none' }}
      onPointerMissed={event => { if (clickGuard.consumeClick(event)) props.onAlertSelect?.(null); }}>
    <ambientLight intensity={1.1} /><directionalLight position={[3, 4, 5]} intensity={2} /><directionalLight position={[-3, 1, -2]} intensity={.8} />
    <Suspense fallback={<Html center><p className="whitespace-nowrap text-sm text-white" role="status">Chargement de l’atlas 3D…</p></Html>}>
      <group rotation={[0, rotation[props.view], 0]}><AtlasScene {...props} clickGuard={clickGuard} /></group>
    </Suspense>
    <AtlasNavigation view={props.view} viewRevision={props.viewRevision} />
    </Canvas>
  </div>;
}

export default function AnatomicalAtlas3D(props: Props) {
  return <AtlasBoundary><AtlasCanvas {...props} /></AtlasBoundary>;
}
