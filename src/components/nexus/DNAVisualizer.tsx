
import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, Cylinder, Points, PointMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';

const DNAHelix: React.FC = () => {
    const groupRef = useRef<THREE.Group>(null);
    const { mouse } = useThree();

    useFrame((state) => {
        if (groupRef.current) {
            // Base rotation
            groupRef.current.rotation.y += 0.005;

            // Subtle interactive rotation based on mouse
            groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, mouse.y * 0.2, 0.05);
            groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -mouse.x * 0.2, 0.05);
        }
    });

    const spheres: React.ReactNode[] = [];
    const bars: React.ReactNode[] = [];
    const count = 30;
    const radius = 2.2;
    const twist = 0.45;

    for (let i = 0; i < count; i++) {
        const y = (i - count / 2) * 0.35;
        const angle = i * twist;

        // First strand
        const x1 = Math.cos(angle) * radius;
        const z1 = Math.sin(angle) * radius;

        // Second strand
        const x2 = Math.cos(angle + Math.PI) * radius;
        const z2 = Math.sin(angle + Math.PI) * radius;

        spheres.push(
            <Sphere key={`s1-${i}`} position={[x1, y, z1]} args={[0.08, 16, 16]}>
                <meshStandardMaterial
                    color="#22d3ee"
                    emissive="#22d3ee"
                    emissiveIntensity={2}
                />
            </Sphere>
        );

        spheres.push(
            <Sphere key={`s2-${i}`} position={[x2, y, z2]} args={[0.08, 16, 16]}>
                <meshStandardMaterial
                    color="#818cf8"
                    emissive="#818cf8"
                    emissiveIntensity={2}
                />
            </Sphere>
        );

        if (i % 2 === 0) {
            bars.push(
                <Cylinder
                    key={`bar-${i}`}
                    position={[(x1 + x2) / 2, y, (z1 + z2) / 2]}
                    args={[0.015, 0.015, radius * 2, 8]}
                    rotation={[0, 0, Math.PI / 2 + angle]}
                >
                    <meshStandardMaterial color="#64748b" transparent opacity={0.3} />
                </Cylinder>
            );
        }
    }

    return (
        <group ref={groupRef}>
            {spheres}
            {bars}
        </group>
    );
};

const BackgroundParticles: React.FC = () => {
    const points = React.useMemo(() => {
        const p = new Float32Array(3000 * 3);
        for (let i = 0; i < 3000; i++) {
            p[i * 3] = (Math.random() - 0.5) * 30;
            p[i * 3 + 1] = (Math.random() - 0.5) * 30;
            p[i * 3 + 2] = (Math.random() - 0.5) * 30;
        }
        return p;
    }, []);

    useFrame((state) => {
        // Gentle floating motion
        state.camera.position.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
        state.camera.position.y = Math.cos(state.clock.elapsedTime * 0.3) * 0.2;
    });

    return (
        <Points positions={points}>
            <PointMaterial transparent color="#22d3ee" size={0.02} sizeAttenuation={true} depthWrite={false} opacity={0.4} />
        </Points>
    );
};

const DNAVisualizer: React.FC = () => {
    return (
        <div className="w-full h-[600px] relative pointer-events-none md:pointer-events-auto overflow-visible">
            <Canvas camera={{ position: [0, 0, 10], fov: 35 }} gl={{ antialias: true }}>
                <ambientLight intensity={0.6} />
                <pointLight position={[10, 10, 10]} intensity={1.5} color="#22d3ee" />
                <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
                    <DNAHelix />
                </Float>
                <BackgroundParticles />
            </Canvas>
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-transparent pointer-events-none" />
        </div>
    );
};

export default DNAVisualizer;
