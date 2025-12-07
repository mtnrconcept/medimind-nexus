import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { AnatomyPart, AnatomyCategory } from '@/data/anatomyData';
import { AlertTriangle, Bone, Heart, Activity, CircleDot } from 'lucide-react';

interface AnatomyMarkersProps {
  parts: AnatomyPart[];
  visibleCategories: AnatomyCategory[];
  selectedPart: AnatomyPart | null;
  hoveredPart: AnatomyPart | null;
  onSelect: (part: AnatomyPart) => void;
  onHover: (part: AnatomyPart | null) => void;
  opacity?: number;
}

const CATEGORY_COLORS: Record<AnatomyCategory, string> = {
  bone: '#f5f5dc',
  organ: '#e74c3c',
  muscle: '#c0392b',
  tooth: '#ffffff',
  nerve: '#9b59b6',
  vessel: '#3498db',
};

const CATEGORY_ICONS: Record<AnatomyCategory, React.ReactNode> = {
  bone: <Bone className="h-3 w-3" />,
  organ: <Heart className="h-3 w-3" />,
  muscle: <Activity className="h-3 w-3" />,
  tooth: <CircleDot className="h-3 w-3" />,
  nerve: <Activity className="h-3 w-3" />,
  vessel: <Activity className="h-3 w-3" />,
};

interface SingleMarkerProps {
  part: AnatomyPart;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (part: AnatomyPart) => void;
  onHover: (part: AnatomyPart | null) => void;
}

const SingleMarker: React.FC<SingleMarkerProps> = ({
  part,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  
  const baseColor = CATEGORY_COLORS[part.category];
  const color = new THREE.Color(baseColor);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Pulsing effect for selected or hovered
      if (isSelected || isHovered) {
        const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.2 + 1;
        meshRef.current.scale.setScalar(pulse * (isSelected ? 1.5 : 1.2));
      } else {
        meshRef.current.scale.setScalar(1);
      }
    }
    
    if (ringRef.current && isSelected) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 2;
      const opacity = 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  const markerSize = part.size * 0.8;

  return (
    <group position={part.position}>
      {/* Main marker sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(part);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(part);
        }}
      >
        <sphereGeometry args={[markerSize, 12, 12]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isHovered || isSelected ? 0.9 : 0.6}
          emissive={color}
          emissiveIntensity={isHovered || isSelected ? 0.5 : 0.1}
        />
      </mesh>
      
      {/* Selection ring */}
      {isSelected && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[markerSize * 1.5, markerSize * 1.8, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Tooltip on hover */}
      {isHovered && (
        <Html
          position={[markerSize + 0.05, markerSize, 0]}
          style={{
            transform: 'translate3d(0, -50%, 0)',
            pointerEvents: 'none',
          }}
        >
          <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 min-w-[180px] animate-scale-in z-50">
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: baseColor }}
              />
              {CATEGORY_ICONS[part.category]}
              <span className="text-xs font-medium text-muted-foreground capitalize">
                {part.category === 'bone' ? 'Os' : 
                 part.category === 'organ' ? 'Organe' :
                 part.category === 'muscle' ? 'Muscle' :
                 part.category === 'tooth' ? 'Dent' :
                 part.category === 'nerve' ? 'Nerf' : 'Vaisseau'}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground">{part.name}</div>
            <div className="text-xs text-muted-foreground italic">{part.nameEn}</div>
            {part.description && (
              <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border">
                {part.description}
              </div>
            )}
            {part.system && (
              <div className="text-xs text-primary mt-1">
                Système: {part.system}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

const AnatomyMarkers: React.FC<AnatomyMarkersProps> = ({
  parts,
  visibleCategories,
  selectedPart,
  hoveredPart,
  onSelect,
  onHover,
  opacity = 1,
}) => {
  const filteredParts = parts.filter(part => visibleCategories.includes(part.category));

  return (
    <group>
      {filteredParts.map((part) => (
        <SingleMarker
          key={part.id}
          part={part}
          isSelected={selectedPart?.id === part.id}
          isHovered={hoveredPart?.id === part.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
};

export default AnatomyMarkers;
