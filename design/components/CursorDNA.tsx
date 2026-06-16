
import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const TrailParticles = ({ count = 40 }) => {
  const { mouse, viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const p = new Array(count).fill(0).map(() => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.01),
      life: Math.random(),
    }));
    const positions = new Float32Array(count * 3);
    return { p, positions };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const targetX = (mouse.x * viewport.width) / 2;
    const targetY = (mouse.y * viewport.height) / 2;

    particles.p.forEach((p, i) => {
      p.life -= 0.01;
      if (p.life <= 0) {
        p.life = 1.0;
        p.position.set(targetX, targetY, 0);
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
        size={0.08}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.6}
      />
    </Points>
  );
};

const QuantumProbe = () => {
  const { mouse, viewport } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) {
      const targetX = (mouse.x * viewport.width) / 2;
      const targetY = (mouse.y * viewport.height) / 2;
      
      // Elastic following logic
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.15);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.15);
      
      groupRef.current.rotation.z += 0.02;
      groupRef.current.rotation.y += 0.01;
    }
    if (coreRef.current) {
      // Pulse effect
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      coreRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={1} floatIntensity={1}>
        {/* Core Nucleus */}
        <mesh ref={coreRef}>
          <sphereGeometry args={[0.08, 32, 32]} />
          <meshStandardMaterial 
            color="#22d3ee" 
            emissive="#22d3ee" 
            emissiveIntensity={8} 
            toneMapped={false}
          />
        </mesh>

        {/* Electrons / Satellites */}
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[Math.random() * Math.PI, Math.random() * Math.PI, 0]}>
            <mesh position={[0.25, 0, 0]}>
              <sphereGeometry args={[0.02, 16, 16]} />
              <meshBasicMaterial color="#818cf8" />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.25, 0.002, 16, 64]} />
              <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} />
            </mesh>
          </group>
        ))}
      </Float>
    </group>
  );
};

const CursorDNA: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[5, 5, 5]} intensity={2} />
        <QuantumProbe />
        <TrailParticles count={60} />
      </Canvas>
    </div>
  );
};

export default CursorDNA;
