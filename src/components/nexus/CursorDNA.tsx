
import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// More robust mouse position tracking
const useMousePosition = () => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const rafRef = useRef<number>();
    const targetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Normalize to -1 to 1 range based on viewport
            targetRef.current = {
                x: (e.clientX / window.innerWidth) * 2 - 1,
                y: -(e.clientY / window.innerHeight) * 2 + 1
            };
        };

        // Smooth position updates with RAF
        const updatePosition = () => {
            setPosition(prev => ({
                x: prev.x + (targetRef.current.x - prev.x) * 0.15,
                y: prev.y + (targetRef.current.y - prev.y) * 0.15
            }));
            rafRef.current = requestAnimationFrame(updatePosition);
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        rafRef.current = requestAnimationFrame(updatePosition);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return position;
};

// Trail particles following the cursor
const TrailParticles: React.FC<{ count?: number; mousePos: { x: number; y: number } }> = ({
    count = 20,
    mousePos
}) => {
    const pointsRef = useRef<THREE.Points>(null);

    const particles = useMemo(() => {
        const p = new Array(count).fill(0).map(() => ({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.005,
                (Math.random() - 0.5) * 0.005,
                (Math.random() - 0.5) * 0.002
            ),
            life: Math.random(),
        }));
        const positions = new Float32Array(count * 3);
        return { p, positions };
    }, [count]);

    useFrame(({ viewport }) => {
        if (!pointsRef.current) return;

        const targetX = (mousePos.x * viewport.width) / 2;
        const targetY = (mousePos.y * viewport.height) / 2;

        particles.p.forEach((p, i) => {
            p.life -= 0.012;
            if (p.life <= 0) {
                p.life = 1.0;
                p.position.set(
                    targetX + (Math.random() - 0.5) * 0.08,
                    targetY + (Math.random() - 0.5) * 0.08,
                    0
                );
            }
            p.position.add(p.velocity);
            particles.positions[i * 3] = p.position.x;
            particles.positions[i * 3 + 1] = p.position.y;
            particles.positions[i * 3 + 2] = p.position.z;
        });

        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <Points ref={pointsRef} positions={particles.positions} stride={3}>
            <PointMaterial
                transparent
                color="#22d3ee"
                size={0.025}
                sizeAttenuation={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                opacity={0.4}
            />
        </Points>
    );
};

// Main quantum probe cursor element
const QuantumProbe: React.FC<{ mousePos: { x: number; y: number } }> = ({ mousePos }) => {
    const groupRef = useRef<THREE.Group>(null);
    const coreRef = useRef<THREE.Mesh>(null);
    const ringRefs = useRef<THREE.Mesh[]>([]);

    useFrame((state, delta) => {
        const { viewport } = state;

        if (groupRef.current) {
            const targetX = (mousePos.x * viewport.width) / 2;
            const targetY = (mousePos.y * viewport.height) / 2;

            // Smooth following - consistent across all pages
            groupRef.current.position.x = THREE.MathUtils.lerp(
                groupRef.current.position.x,
                targetX,
                0.1
            );
            groupRef.current.position.y = THREE.MathUtils.lerp(
                groupRef.current.position.y,
                targetY,
                0.1
            );

            // Gentle rotation
            groupRef.current.rotation.z += delta * 0.4;
        }

        if (coreRef.current) {
            // Subtle pulse
            const scale = 1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.06;
            coreRef.current.scale.set(scale, scale, scale);
        }

        // Animate rings
        ringRefs.current.forEach((ring, i) => {
            if (ring) {
                ring.rotation.x += delta * (0.25 + i * 0.08);
                ring.rotation.y += delta * (0.15 + i * 0.1);
            }
        });
    });

    return (
        <group ref={groupRef}>
            <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.2}>
                {/* Core nucleus */}
                <mesh ref={coreRef}>
                    <sphereGeometry args={[0.035, 20, 20]} />
                    <meshStandardMaterial
                        color="#22d3ee"
                        emissive="#22d3ee"
                        emissiveIntensity={4}
                        toneMapped={false}
                    />
                </mesh>

                {/* Orbital rings */}
                {[0, 1, 2].map((i) => (
                    <mesh
                        key={i}
                        ref={(el) => { if (el) ringRefs.current[i] = el; }}
                        rotation={[Math.PI / 3 * i, Math.PI / 4 * i, 0]}
                    >
                        <torusGeometry args={[0.1 + i * 0.035, 0.0015, 8, 40]} />
                        <meshBasicMaterial
                            color="#22d3ee"
                            transparent
                            opacity={0.25 - i * 0.06}
                        />
                    </mesh>
                ))}

                {/* Orbiting electrons */}
                {[0, 1, 2].map((i) => (
                    <group key={`electron-${i}`} rotation={[Math.PI / 2.5 * i, Math.PI / 3 * i, 0]}>
                        <mesh position={[0.1 + i * 0.035, 0, 0]}>
                            <sphereGeometry args={[0.01, 10, 10]} />
                            <meshBasicMaterial color="#818cf8" />
                        </mesh>
                    </group>
                ))}
            </Float>
        </group>
    );
};

const CursorDNA: React.FC = () => {
    const mousePos = useMousePosition();
    const [mounted, setMounted] = useState(false);

    // Ensure component only mounts on client
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div
            className="fixed inset-0 z-[9999]"
            style={{
                pointerEvents: 'none',
                isolation: 'isolate'
            }}
        >
            <Canvas
                camera={{ position: [0, 0, 5], fov: 50 }}
                gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: 'high-performance',
                    preserveDrawingBuffer: false
                }}
                style={{ pointerEvents: 'none' }}
                dpr={[1, 1.5]}
                frameloop="always"
            >
                <ambientLight intensity={0.4} />
                <pointLight position={[5, 5, 5]} intensity={1.2} />
                <QuantumProbe mousePos={mousePos} />
                <TrailParticles count={20} mousePos={mousePos} />
            </Canvas>
        </div>
    );
};

export default CursorDNA;
