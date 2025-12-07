// Complete Anatomical Database - 500+ body parts with positions and metadata

export type AnatomyCategory = 'bone' | 'organ' | 'muscle' | 'tooth' | 'nerve' | 'vessel';
export type AnatomyRegion = 'head' | 'neck' | 'trunk' | 'arm_left' | 'arm_right' | 'leg_left' | 'leg_right' | 'hand_left' | 'hand_right' | 'foot_left' | 'foot_right';

export interface AnatomyPart {
  id: string;
  name: string;
  nameEn: string;
  category: AnatomyCategory;
  region: AnatomyRegion;
  position: [number, number, number];
  size: number;
  description?: string;
  relatedParts?: string[];
  system?: string;
}

// ========================================
// BONES - 206 elements (Squelette complet)
// ========================================

// Crâne (8 os)
const SKULL_BONES: AnatomyPart[] = [
  { id: 'frontal', name: 'Os frontal', nameEn: 'Frontal bone', category: 'bone', region: 'head', position: [0, 1.15, 0.08], size: 0.04, description: 'Os du front, forme la partie antérieure du crâne', system: 'Axial' },
  { id: 'parietal_left', name: 'Os pariétal gauche', nameEn: 'Left parietal bone', category: 'bone', region: 'head', position: [-0.08, 1.18, 0], size: 0.035, description: 'Os latéral gauche du crâne', system: 'Axial' },
  { id: 'parietal_right', name: 'Os pariétal droit', nameEn: 'Right parietal bone', category: 'bone', region: 'head', position: [0.08, 1.18, 0], size: 0.035, description: 'Os latéral droit du crâne', system: 'Axial' },
  { id: 'temporal_left', name: 'Os temporal gauche', nameEn: 'Left temporal bone', category: 'bone', region: 'head', position: [-0.12, 1.05, 0], size: 0.03, description: 'Os latéral gauche contenant l\'oreille interne', system: 'Axial' },
  { id: 'temporal_right', name: 'Os temporal droit', nameEn: 'Right temporal bone', category: 'bone', region: 'head', position: [0.12, 1.05, 0], size: 0.03, description: 'Os latéral droit contenant l\'oreille interne', system: 'Axial' },
  { id: 'occipital', name: 'Os occipital', nameEn: 'Occipital bone', category: 'bone', region: 'head', position: [0, 1.08, -0.1], size: 0.04, description: 'Os postérieur du crâne, contient le foramen magnum', system: 'Axial' },
  { id: 'sphenoid', name: 'Os sphénoïde', nameEn: 'Sphenoid bone', category: 'bone', region: 'head', position: [0, 1.02, 0.02], size: 0.025, description: 'Os en forme de papillon à la base du crâne', system: 'Axial' },
  { id: 'ethmoid', name: 'Os ethmoïde', nameEn: 'Ethmoid bone', category: 'bone', region: 'head', position: [0, 1.0, 0.06], size: 0.02, description: 'Os de la cavité nasale et des orbites', system: 'Axial' },
];

// Os de la face (14 os)
const FACE_BONES: AnatomyPart[] = [
  { id: 'maxilla_left', name: 'Maxillaire gauche', nameEn: 'Left maxilla', category: 'bone', region: 'head', position: [-0.04, 0.95, 0.1], size: 0.025, description: 'Os supérieur de la mâchoire gauche', system: 'Axial' },
  { id: 'maxilla_right', name: 'Maxillaire droit', nameEn: 'Right maxilla', category: 'bone', region: 'head', position: [0.04, 0.95, 0.1], size: 0.025, description: 'Os supérieur de la mâchoire droit', system: 'Axial' },
  { id: 'zygomatic_left', name: 'Os zygomatique gauche', nameEn: 'Left zygomatic bone', category: 'bone', region: 'head', position: [-0.1, 0.98, 0.08], size: 0.02, description: 'Pommette gauche', system: 'Axial' },
  { id: 'zygomatic_right', name: 'Os zygomatique droit', nameEn: 'Right zygomatic bone', category: 'bone', region: 'head', position: [0.1, 0.98, 0.08], size: 0.02, description: 'Pommette droite', system: 'Axial' },
  { id: 'nasal_left', name: 'Os nasal gauche', nameEn: 'Left nasal bone', category: 'bone', region: 'head', position: [-0.015, 0.98, 0.12], size: 0.01, description: 'Os du nez gauche', system: 'Axial' },
  { id: 'nasal_right', name: 'Os nasal droit', nameEn: 'Right nasal bone', category: 'bone', region: 'head', position: [0.015, 0.98, 0.12], size: 0.01, description: 'Os du nez droit', system: 'Axial' },
  { id: 'lacrimal_left', name: 'Os lacrymal gauche', nameEn: 'Left lacrimal bone', category: 'bone', region: 'head', position: [-0.035, 1.0, 0.09], size: 0.008, description: 'Plus petit os de la face, orbite gauche', system: 'Axial' },
  { id: 'lacrimal_right', name: 'Os lacrymal droit', nameEn: 'Right lacrimal bone', category: 'bone', region: 'head', position: [0.035, 1.0, 0.09], size: 0.008, description: 'Plus petit os de la face, orbite droite', system: 'Axial' },
  { id: 'palatine_left', name: 'Os palatin gauche', nameEn: 'Left palatine bone', category: 'bone', region: 'head', position: [-0.02, 0.93, 0.05], size: 0.01, description: 'Os du palais gauche', system: 'Axial' },
  { id: 'palatine_right', name: 'Os palatin droit', nameEn: 'Right palatine bone', category: 'bone', region: 'head', position: [0.02, 0.93, 0.05], size: 0.01, description: 'Os du palais droit', system: 'Axial' },
  { id: 'inferior_nasal_concha_left', name: 'Cornet nasal inf. gauche', nameEn: 'Left inferior nasal concha', category: 'bone', region: 'head', position: [-0.02, 0.95, 0.08], size: 0.008, description: 'Cornet nasal inférieur gauche', system: 'Axial' },
  { id: 'inferior_nasal_concha_right', name: 'Cornet nasal inf. droit', nameEn: 'Right inferior nasal concha', category: 'bone', region: 'head', position: [0.02, 0.95, 0.08], size: 0.008, description: 'Cornet nasal inférieur droit', system: 'Axial' },
  { id: 'vomer', name: 'Vomer', nameEn: 'Vomer', category: 'bone', region: 'head', position: [0, 0.95, 0.07], size: 0.01, description: 'Os de la cloison nasale', system: 'Axial' },
  { id: 'mandible', name: 'Mandibule', nameEn: 'Mandible', category: 'bone', region: 'head', position: [0, 0.88, 0.08], size: 0.04, description: 'Mâchoire inférieure, seul os mobile du crâne', system: 'Axial' },
];

// Osselets de l'oreille (6 os)
const EAR_OSSICLES: AnatomyPart[] = [
  { id: 'malleus_left', name: 'Marteau gauche', nameEn: 'Left malleus', category: 'bone', region: 'head', position: [-0.13, 1.03, 0.01], size: 0.005, description: 'Osselet de l\'oreille moyenne gauche', system: 'Axial' },
  { id: 'malleus_right', name: 'Marteau droit', nameEn: 'Right malleus', category: 'bone', region: 'head', position: [0.13, 1.03, 0.01], size: 0.005, description: 'Osselet de l\'oreille moyenne droite', system: 'Axial' },
  { id: 'incus_left', name: 'Enclume gauche', nameEn: 'Left incus', category: 'bone', region: 'head', position: [-0.13, 1.03, 0], size: 0.005, description: 'Osselet de l\'oreille moyenne gauche', system: 'Axial' },
  { id: 'incus_right', name: 'Enclume droit', nameEn: 'Right incus', category: 'bone', region: 'head', position: [0.13, 1.03, 0], size: 0.005, description: 'Osselet de l\'oreille moyenne droite', system: 'Axial' },
  { id: 'stapes_left', name: 'Étrier gauche', nameEn: 'Left stapes', category: 'bone', region: 'head', position: [-0.13, 1.03, -0.01], size: 0.004, description: 'Plus petit os du corps, oreille gauche', system: 'Axial' },
  { id: 'stapes_right', name: 'Étrier droit', nameEn: 'Right stapes', category: 'bone', region: 'head', position: [0.13, 1.03, -0.01], size: 0.004, description: 'Plus petit os du corps, oreille droite', system: 'Axial' },
];

// Os hyoïde
const HYOID: AnatomyPart[] = [
  { id: 'hyoid', name: 'Os hyoïde', nameEn: 'Hyoid bone', category: 'bone', region: 'neck', position: [0, 0.82, 0.05], size: 0.015, description: 'Os en forme de U à la base de la langue', system: 'Axial' },
];

// Vertèbres cervicales (7)
const CERVICAL_VERTEBRAE: AnatomyPart[] = [
  { id: 'c1_atlas', name: 'Atlas (C1)', nameEn: 'Atlas (C1)', category: 'bone', region: 'neck', position: [0, 0.9, -0.02], size: 0.025, description: 'Première vertèbre cervicale, supporte le crâne', system: 'Axial' },
  { id: 'c2_axis', name: 'Axis (C2)', nameEn: 'Axis (C2)', category: 'bone', region: 'neck', position: [0, 0.87, -0.02], size: 0.025, description: 'Deuxième vertèbre cervicale avec processus odontoïde', system: 'Axial' },
  { id: 'c3', name: 'Vertèbre C3', nameEn: 'C3 vertebra', category: 'bone', region: 'neck', position: [0, 0.84, -0.02], size: 0.022, description: 'Troisième vertèbre cervicale', system: 'Axial' },
  { id: 'c4', name: 'Vertèbre C4', nameEn: 'C4 vertebra', category: 'bone', region: 'neck', position: [0, 0.81, -0.02], size: 0.022, description: 'Quatrième vertèbre cervicale', system: 'Axial' },
  { id: 'c5', name: 'Vertèbre C5', nameEn: 'C5 vertebra', category: 'bone', region: 'neck', position: [0, 0.78, -0.02], size: 0.022, description: 'Cinquième vertèbre cervicale', system: 'Axial' },
  { id: 'c6', name: 'Vertèbre C6', nameEn: 'C6 vertebra', category: 'bone', region: 'neck', position: [0, 0.75, -0.02], size: 0.022, description: 'Sixième vertèbre cervicale', system: 'Axial' },
  { id: 'c7', name: 'Vertèbre C7', nameEn: 'C7 vertebra', category: 'bone', region: 'neck', position: [0, 0.72, -0.02], size: 0.025, description: 'Septième vertèbre cervicale (proéminente)', system: 'Axial' },
];

// Vertèbres thoraciques (12)
const THORACIC_VERTEBRAE: AnatomyPart[] = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Vertèbre T${i + 1}`,
  nameEn: `T${i + 1} vertebra`,
  category: 'bone' as AnatomyCategory,
  region: 'trunk' as AnatomyRegion,
  position: [0, 0.68 - i * 0.045, -0.03] as [number, number, number],
  size: 0.025,
  description: `Vertèbre thoracique ${i + 1}, s'articule avec côte ${i + 1}`,
  system: 'Axial',
}));

// Vertèbres lombaires (5)
const LUMBAR_VERTEBRAE: AnatomyPart[] = Array.from({ length: 5 }, (_, i) => ({
  id: `l${i + 1}`,
  name: `Vertèbre L${i + 1}`,
  nameEn: `L${i + 1} vertebra`,
  category: 'bone' as AnatomyCategory,
  region: 'trunk' as AnatomyRegion,
  position: [0, 0.12 - i * 0.05, -0.03] as [number, number, number],
  size: 0.03,
  description: `Vertèbre lombaire ${i + 1}`,
  system: 'Axial',
}));

// Sacrum et Coccyx
const SACRUM_COCCYX: AnatomyPart[] = [
  { id: 'sacrum', name: 'Sacrum', nameEn: 'Sacrum', category: 'bone', region: 'trunk', position: [0, -0.18, -0.05], size: 0.04, description: 'Os triangulaire formé de 5 vertèbres fusionnées', system: 'Axial' },
  { id: 'coccyx', name: 'Coccyx', nameEn: 'Coccyx', category: 'bone', region: 'trunk', position: [0, -0.28, -0.05], size: 0.02, description: 'Os terminal de la colonne, 3-5 vertèbres fusionnées', system: 'Axial' },
];

// Sternum (3 parties)
const STERNUM: AnatomyPart[] = [
  { id: 'manubrium', name: 'Manubrium sternal', nameEn: 'Manubrium', category: 'bone', region: 'trunk', position: [0, 0.62, 0.1], size: 0.03, description: 'Partie supérieure du sternum', system: 'Axial' },
  { id: 'sternum_body', name: 'Corps du sternum', nameEn: 'Sternal body', category: 'bone', region: 'trunk', position: [0, 0.48, 0.1], size: 0.035, description: 'Partie centrale du sternum', system: 'Axial' },
  { id: 'xiphoid', name: 'Processus xiphoïde', nameEn: 'Xiphoid process', category: 'bone', region: 'trunk', position: [0, 0.35, 0.1], size: 0.015, description: 'Extrémité inférieure du sternum', system: 'Axial' },
];

// Côtes (24)
const RIBS: AnatomyPart[] = [
  // Vraies côtes (1-7)
  ...Array.from({ length: 7 }, (_, i) => [
    { id: `rib_${i + 1}_left`, name: `Côte ${i + 1} gauche`, nameEn: `Left rib ${i + 1}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [-0.12, 0.6 - i * 0.045, 0.05] as [number, number, number], size: 0.015, description: `Vraie côte ${i + 1} gauche`, system: 'Axial' },
    { id: `rib_${i + 1}_right`, name: `Côte ${i + 1} droite`, nameEn: `Right rib ${i + 1}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [0.12, 0.6 - i * 0.045, 0.05] as [number, number, number], size: 0.015, description: `Vraie côte ${i + 1} droite`, system: 'Axial' },
  ]).flat(),
  // Fausses côtes (8-10)
  ...Array.from({ length: 3 }, (_, i) => [
    { id: `rib_${i + 8}_left`, name: `Côte ${i + 8} gauche`, nameEn: `Left rib ${i + 8}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [-0.14, 0.28 - i * 0.045, 0.04] as [number, number, number], size: 0.015, description: `Fausse côte ${i + 8} gauche`, system: 'Axial' },
    { id: `rib_${i + 8}_right`, name: `Côte ${i + 8} droite`, nameEn: `Right rib ${i + 8}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [0.14, 0.28 - i * 0.045, 0.04] as [number, number, number], size: 0.015, description: `Fausse côte ${i + 8} droite`, system: 'Axial' },
  ]).flat(),
  // Côtes flottantes (11-12)
  ...Array.from({ length: 2 }, (_, i) => [
    { id: `rib_${i + 11}_left`, name: `Côte ${i + 11} gauche`, nameEn: `Left rib ${i + 11}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [-0.15, 0.14 - i * 0.04, 0.02] as [number, number, number], size: 0.012, description: `Côte flottante ${i + 11} gauche`, system: 'Axial' },
    { id: `rib_${i + 11}_right`, name: `Côte ${i + 11} droite`, nameEn: `Right rib ${i + 11}`, category: 'bone' as AnatomyCategory, region: 'trunk' as AnatomyRegion, position: [0.15, 0.14 - i * 0.04, 0.02] as [number, number, number], size: 0.012, description: `Côte flottante ${i + 11} droite`, system: 'Axial' },
  ]).flat(),
];

// Ceinture scapulaire (4 os)
const SHOULDER_GIRDLE: AnatomyPart[] = [
  { id: 'clavicle_left', name: 'Clavicule gauche', nameEn: 'Left clavicle', category: 'bone', region: 'trunk', position: [-0.12, 0.68, 0.08], size: 0.025, description: 'Os de la clavicule gauche', system: 'Appendiculaire' },
  { id: 'clavicle_right', name: 'Clavicule droite', nameEn: 'Right clavicle', category: 'bone', region: 'trunk', position: [0.12, 0.68, 0.08], size: 0.025, description: 'Os de la clavicule droite', system: 'Appendiculaire' },
  { id: 'scapula_left', name: 'Omoplate gauche', nameEn: 'Left scapula', category: 'bone', region: 'trunk', position: [-0.15, 0.55, -0.08], size: 0.035, description: 'Omoplate gauche', system: 'Appendiculaire' },
  { id: 'scapula_right', name: 'Omoplate droite', nameEn: 'Right scapula', category: 'bone', region: 'trunk', position: [0.15, 0.55, -0.08], size: 0.035, description: 'Omoplate droite', system: 'Appendiculaire' },
];

// Bras (6 os)
const ARM_BONES: AnatomyPart[] = [
  { id: 'humerus_left', name: 'Humérus gauche', nameEn: 'Left humerus', category: 'bone', region: 'arm_left', position: [-0.28, 0.5, 0], size: 0.03, description: 'Os du bras gauche', system: 'Appendiculaire' },
  { id: 'humerus_right', name: 'Humérus droit', nameEn: 'Right humerus', category: 'bone', region: 'arm_right', position: [0.28, 0.5, 0], size: 0.03, description: 'Os du bras droit', system: 'Appendiculaire' },
  { id: 'radius_left', name: 'Radius gauche', nameEn: 'Left radius', category: 'bone', region: 'arm_left', position: [-0.32, 0.22, 0.02], size: 0.02, description: 'Os de l\'avant-bras gauche (côté pouce)', system: 'Appendiculaire' },
  { id: 'radius_right', name: 'Radius droit', nameEn: 'Right radius', category: 'bone', region: 'arm_right', position: [0.32, 0.22, 0.02], size: 0.02, description: 'Os de l\'avant-bras droit (côté pouce)', system: 'Appendiculaire' },
  { id: 'ulna_left', name: 'Cubitus gauche', nameEn: 'Left ulna', category: 'bone', region: 'arm_left', position: [-0.32, 0.22, -0.02], size: 0.02, description: 'Os de l\'avant-bras gauche (côté auriculaire)', system: 'Appendiculaire' },
  { id: 'ulna_right', name: 'Cubitus droit', nameEn: 'Right ulna', category: 'bone', region: 'arm_right', position: [0.32, 0.22, -0.02], size: 0.02, description: 'Os de l\'avant-bras droit (côté auriculaire)', system: 'Appendiculaire' },
];

// Carpes - Os du poignet (16 os)
const CARPAL_BONES: AnatomyPart[] = [
  // Main gauche
  { id: 'scaphoid_left', name: 'Scaphoïde gauche', nameEn: 'Left scaphoid', category: 'bone', region: 'hand_left', position: [-0.35, 0.05, 0.02], size: 0.008, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'lunate_left', name: 'Lunatum gauche', nameEn: 'Left lunate', category: 'bone', region: 'hand_left', position: [-0.36, 0.05, 0], size: 0.007, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'triquetrum_left', name: 'Triquetrum gauche', nameEn: 'Left triquetrum', category: 'bone', region: 'hand_left', position: [-0.37, 0.05, -0.02], size: 0.007, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'pisiform_left', name: 'Pisiforme gauche', nameEn: 'Left pisiform', category: 'bone', region: 'hand_left', position: [-0.375, 0.04, -0.025], size: 0.005, description: 'Plus petit os du carpe', system: 'Appendiculaire' },
  { id: 'trapezium_left', name: 'Trapèze gauche', nameEn: 'Left trapezium', category: 'bone', region: 'hand_left', position: [-0.34, 0.02, 0.03], size: 0.007, description: 'Os du carpe, rangée distale', system: 'Appendiculaire' },
  { id: 'trapezoid_left', name: 'Trapézoïde gauche', nameEn: 'Left trapezoid', category: 'bone', region: 'hand_left', position: [-0.355, 0.02, 0.015], size: 0.006, description: 'Os du carpe, rangée distale', system: 'Appendiculaire' },
  { id: 'capitate_left', name: 'Grand os gauche', nameEn: 'Left capitate', category: 'bone', region: 'hand_left', position: [-0.365, 0.02, 0], size: 0.008, description: 'Plus grand os du carpe', system: 'Appendiculaire' },
  { id: 'hamate_left', name: 'Hamatum gauche', nameEn: 'Left hamate', category: 'bone', region: 'hand_left', position: [-0.375, 0.02, -0.015], size: 0.007, description: 'Os du carpe avec crochet', system: 'Appendiculaire' },
  // Main droite
  { id: 'scaphoid_right', name: 'Scaphoïde droit', nameEn: 'Right scaphoid', category: 'bone', region: 'hand_right', position: [0.35, 0.05, 0.02], size: 0.008, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'lunate_right', name: 'Lunatum droit', nameEn: 'Right lunate', category: 'bone', region: 'hand_right', position: [0.36, 0.05, 0], size: 0.007, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'triquetrum_right', name: 'Triquetrum droit', nameEn: 'Right triquetrum', category: 'bone', region: 'hand_right', position: [0.37, 0.05, -0.02], size: 0.007, description: 'Os du carpe, rangée proximale', system: 'Appendiculaire' },
  { id: 'pisiform_right', name: 'Pisiforme droit', nameEn: 'Right pisiform', category: 'bone', region: 'hand_right', position: [0.375, 0.04, -0.025], size: 0.005, description: 'Plus petit os du carpe', system: 'Appendiculaire' },
  { id: 'trapezium_right', name: 'Trapèze droit', nameEn: 'Right trapezium', category: 'bone', region: 'hand_right', position: [0.34, 0.02, 0.03], size: 0.007, description: 'Os du carpe, rangée distale', system: 'Appendiculaire' },
  { id: 'trapezoid_right', name: 'Trapézoïde droit', nameEn: 'Right trapezoid', category: 'bone', region: 'hand_right', position: [0.355, 0.02, 0.015], size: 0.006, description: 'Os du carpe, rangée distale', system: 'Appendiculaire' },
  { id: 'capitate_right', name: 'Grand os droit', nameEn: 'Right capitate', category: 'bone', region: 'hand_right', position: [0.365, 0.02, 0], size: 0.008, description: 'Plus grand os du carpe', system: 'Appendiculaire' },
  { id: 'hamate_right', name: 'Hamatum droit', nameEn: 'Right hamate', category: 'bone', region: 'hand_right', position: [0.375, 0.02, -0.015], size: 0.007, description: 'Os du carpe avec crochet', system: 'Appendiculaire' },
];

// Métacarpes et Phalanges de la main (38 os)
const HAND_BONES: AnatomyPart[] = [
  // Métacarpes gauche (5)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `metacarpal_${i + 1}_left`,
    name: `Métacarpien ${i + 1} gauche`,
    nameEn: `Left metacarpal ${i + 1}`,
    category: 'bone' as AnatomyCategory,
    region: 'hand_left' as AnatomyRegion,
    position: [-0.34 - i * 0.015, -0.02, 0.03 - i * 0.015] as [number, number, number],
    size: 0.01,
    description: `Os du métacarpe ${i + 1}`,
    system: 'Appendiculaire',
  })),
  // Métacarpes droit (5)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `metacarpal_${i + 1}_right`,
    name: `Métacarpien ${i + 1} droit`,
    nameEn: `Right metacarpal ${i + 1}`,
    category: 'bone' as AnatomyCategory,
    region: 'hand_right' as AnatomyRegion,
    position: [0.34 + i * 0.015, -0.02, 0.03 - i * 0.015] as [number, number, number],
    size: 0.01,
    description: `Os du métacarpe ${i + 1}`,
    system: 'Appendiculaire',
  })),
  // Phalanges gauche (14: 2 pour pouce, 3 pour autres doigts)
  // Pouce
  { id: 'thumb_proximal_left', name: 'Phalange proximale pouce G', nameEn: 'Left thumb proximal phalanx', category: 'bone', region: 'hand_left', position: [-0.32, -0.05, 0.04], size: 0.008, system: 'Appendiculaire' },
  { id: 'thumb_distal_left', name: 'Phalange distale pouce G', nameEn: 'Left thumb distal phalanx', category: 'bone', region: 'hand_left', position: [-0.30, -0.08, 0.05], size: 0.006, system: 'Appendiculaire' },
  // Index à auriculaire
  ...['index', 'majeur', 'annulaire', 'auriculaire'].flatMap((finger, fi) => [
    { id: `${finger}_proximal_left`, name: `Phalange prox. ${finger} G`, nameEn: `Left ${finger} proximal phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_left' as AnatomyRegion, position: [-0.355 - fi * 0.015, -0.05, 0.02 - fi * 0.015] as [number, number, number], size: 0.007, system: 'Appendiculaire' },
    { id: `${finger}_middle_left`, name: `Phalange moy. ${finger} G`, nameEn: `Left ${finger} middle phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_left' as AnatomyRegion, position: [-0.36 - fi * 0.015, -0.08, 0.02 - fi * 0.015] as [number, number, number], size: 0.006, system: 'Appendiculaire' },
    { id: `${finger}_distal_left`, name: `Phalange dist. ${finger} G`, nameEn: `Left ${finger} distal phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_left' as AnatomyRegion, position: [-0.365 - fi * 0.015, -0.11, 0.02 - fi * 0.015] as [number, number, number], size: 0.005, system: 'Appendiculaire' },
  ]),
  // Phalanges droite
  { id: 'thumb_proximal_right', name: 'Phalange proximale pouce D', nameEn: 'Right thumb proximal phalanx', category: 'bone', region: 'hand_right', position: [0.32, -0.05, 0.04], size: 0.008, system: 'Appendiculaire' },
  { id: 'thumb_distal_right', name: 'Phalange distale pouce D', nameEn: 'Right thumb distal phalanx', category: 'bone', region: 'hand_right', position: [0.30, -0.08, 0.05], size: 0.006, system: 'Appendiculaire' },
  ...['index', 'majeur', 'annulaire', 'auriculaire'].flatMap((finger, fi) => [
    { id: `${finger}_proximal_right`, name: `Phalange prox. ${finger} D`, nameEn: `Right ${finger} proximal phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_right' as AnatomyRegion, position: [0.355 + fi * 0.015, -0.05, 0.02 - fi * 0.015] as [number, number, number], size: 0.007, system: 'Appendiculaire' },
    { id: `${finger}_middle_right`, name: `Phalange moy. ${finger} D`, nameEn: `Right ${finger} middle phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_right' as AnatomyRegion, position: [0.36 + fi * 0.015, -0.08, 0.02 - fi * 0.015] as [number, number, number], size: 0.006, system: 'Appendiculaire' },
    { id: `${finger}_distal_right`, name: `Phalange dist. ${finger} D`, nameEn: `Right ${finger} distal phalanx`, category: 'bone' as AnatomyCategory, region: 'hand_right' as AnatomyRegion, position: [0.365 + fi * 0.015, -0.11, 0.02 - fi * 0.015] as [number, number, number], size: 0.005, system: 'Appendiculaire' },
  ]),
];

// Ceinture pelvienne (2 os)
const PELVIC_GIRDLE: AnatomyPart[] = [
  { id: 'hip_bone_left', name: 'Os coxal gauche', nameEn: 'Left hip bone', category: 'bone', region: 'trunk', position: [-0.12, -0.35, 0], size: 0.05, description: 'Os de la hanche gauche (ilium, ischium, pubis fusionnés)', system: 'Appendiculaire' },
  { id: 'hip_bone_right', name: 'Os coxal droit', nameEn: 'Right hip bone', category: 'bone', region: 'trunk', position: [0.12, -0.35, 0], size: 0.05, description: 'Os de la hanche droit (ilium, ischium, pubis fusionnés)', system: 'Appendiculaire' },
];

// Os des jambes (8 os)
const LEG_BONES: AnatomyPart[] = [
  { id: 'femur_left', name: 'Fémur gauche', nameEn: 'Left femur', category: 'bone', region: 'leg_left', position: [-0.1, -0.65, 0], size: 0.035, description: 'Os de la cuisse gauche, le plus long du corps', system: 'Appendiculaire' },
  { id: 'femur_right', name: 'Fémur droit', nameEn: 'Right femur', category: 'bone', region: 'leg_right', position: [0.1, -0.65, 0], size: 0.035, description: 'Os de la cuisse droit, le plus long du corps', system: 'Appendiculaire' },
  { id: 'patella_left', name: 'Rotule gauche', nameEn: 'Left patella', category: 'bone', region: 'leg_left', position: [-0.1, -0.95, 0.06], size: 0.02, description: 'Os sésamoïde du genou gauche', system: 'Appendiculaire' },
  { id: 'patella_right', name: 'Rotule droite', nameEn: 'Right patella', category: 'bone', region: 'leg_right', position: [0.1, -0.95, 0.06], size: 0.02, description: 'Os sésamoïde du genou droit', system: 'Appendiculaire' },
  { id: 'tibia_left', name: 'Tibia gauche', nameEn: 'Left tibia', category: 'bone', region: 'leg_left', position: [-0.1, -1.2, 0.02], size: 0.03, description: 'Os antérieur de la jambe gauche', system: 'Appendiculaire' },
  { id: 'tibia_right', name: 'Tibia droit', nameEn: 'Right tibia', category: 'bone', region: 'leg_right', position: [0.1, -1.2, 0.02], size: 0.03, description: 'Os antérieur de la jambe droit', system: 'Appendiculaire' },
  { id: 'fibula_left', name: 'Péroné gauche', nameEn: 'Left fibula', category: 'bone', region: 'leg_left', position: [-0.13, -1.2, 0], size: 0.015, description: 'Os latéral de la jambe gauche', system: 'Appendiculaire' },
  { id: 'fibula_right', name: 'Péroné droit', nameEn: 'Right fibula', category: 'bone', region: 'leg_right', position: [0.13, -1.2, 0], size: 0.015, description: 'Os latéral de la jambe droit', system: 'Appendiculaire' },
];

// Tarses - Os du pied (14 os)
const TARSAL_BONES: AnatomyPart[] = [
  // Pied gauche
  { id: 'calcaneus_left', name: 'Calcanéum gauche', nameEn: 'Left calcaneus', category: 'bone', region: 'foot_left', position: [-0.1, -1.48, -0.03], size: 0.02, description: 'Os du talon gauche', system: 'Appendiculaire' },
  { id: 'talus_left', name: 'Talus gauche', nameEn: 'Left talus', category: 'bone', region: 'foot_left', position: [-0.1, -1.46, 0.02], size: 0.015, description: 'Os de la cheville gauche', system: 'Appendiculaire' },
  { id: 'navicular_left', name: 'Naviculaire gauche', nameEn: 'Left navicular', category: 'bone', region: 'foot_left', position: [-0.09, -1.48, 0.06], size: 0.01, description: 'Os du tarse gauche', system: 'Appendiculaire' },
  { id: 'cuboid_left', name: 'Cuboïde gauche', nameEn: 'Left cuboid', category: 'bone', region: 'foot_left', position: [-0.12, -1.48, 0.06], size: 0.01, description: 'Os du tarse latéral gauche', system: 'Appendiculaire' },
  { id: 'cuneiform_medial_left', name: 'Cunéiforme médial G', nameEn: 'Left medial cuneiform', category: 'bone', region: 'foot_left', position: [-0.08, -1.49, 0.09], size: 0.008, description: 'Cunéiforme médial gauche', system: 'Appendiculaire' },
  { id: 'cuneiform_intermediate_left', name: 'Cunéiforme interméd. G', nameEn: 'Left intermediate cuneiform', category: 'bone', region: 'foot_left', position: [-0.095, -1.49, 0.09], size: 0.007, description: 'Cunéiforme intermédiaire gauche', system: 'Appendiculaire' },
  { id: 'cuneiform_lateral_left', name: 'Cunéiforme latéral G', nameEn: 'Left lateral cuneiform', category: 'bone', region: 'foot_left', position: [-0.11, -1.49, 0.09], size: 0.007, description: 'Cunéiforme latéral gauche', system: 'Appendiculaire' },
  // Pied droit
  { id: 'calcaneus_right', name: 'Calcanéum droit', nameEn: 'Right calcaneus', category: 'bone', region: 'foot_right', position: [0.1, -1.48, -0.03], size: 0.02, description: 'Os du talon droit', system: 'Appendiculaire' },
  { id: 'talus_right', name: 'Talus droit', nameEn: 'Right talus', category: 'bone', region: 'foot_right', position: [0.1, -1.46, 0.02], size: 0.015, description: 'Os de la cheville droit', system: 'Appendiculaire' },
  { id: 'navicular_right', name: 'Naviculaire droit', nameEn: 'Right navicular', category: 'bone', region: 'foot_right', position: [0.09, -1.48, 0.06], size: 0.01, description: 'Os du tarse droit', system: 'Appendiculaire' },
  { id: 'cuboid_right', name: 'Cuboïde droit', nameEn: 'Right cuboid', category: 'bone', region: 'foot_right', position: [0.12, -1.48, 0.06], size: 0.01, description: 'Os du tarse latéral droit', system: 'Appendiculaire' },
  { id: 'cuneiform_medial_right', name: 'Cunéiforme médial D', nameEn: 'Right medial cuneiform', category: 'bone', region: 'foot_right', position: [0.08, -1.49, 0.09], size: 0.008, description: 'Cunéiforme médial droit', system: 'Appendiculaire' },
  { id: 'cuneiform_intermediate_right', name: 'Cunéiforme interméd. D', nameEn: 'Right intermediate cuneiform', category: 'bone', region: 'foot_right', position: [0.095, -1.49, 0.09], size: 0.007, description: 'Cunéiforme intermédiaire droit', system: 'Appendiculaire' },
  { id: 'cuneiform_lateral_right', name: 'Cunéiforme latéral D', nameEn: 'Right lateral cuneiform', category: 'bone', region: 'foot_right', position: [0.11, -1.49, 0.09], size: 0.007, description: 'Cunéiforme latéral droit', system: 'Appendiculaire' },
];

// Métatarses et Phalanges du pied (38 os)
const FOOT_BONES: AnatomyPart[] = [
  // Métatarses gauche (5)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `metatarsal_${i + 1}_left`,
    name: `Métatarsien ${i + 1} gauche`,
    nameEn: `Left metatarsal ${i + 1}`,
    category: 'bone' as AnatomyCategory,
    region: 'foot_left' as AnatomyRegion,
    position: [-0.07 - i * 0.015, -1.5, 0.12 + i * 0.005] as [number, number, number],
    size: 0.01,
    description: `Os du métatarse ${i + 1}`,
    system: 'Appendiculaire',
  })),
  // Métatarses droit (5)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `metatarsal_${i + 1}_right`,
    name: `Métatarsien ${i + 1} droit`,
    nameEn: `Right metatarsal ${i + 1}`,
    category: 'bone' as AnatomyCategory,
    region: 'foot_right' as AnatomyRegion,
    position: [0.07 + i * 0.015, -1.5, 0.12 + i * 0.005] as [number, number, number],
    size: 0.01,
    description: `Os du métatarse ${i + 1}`,
    system: 'Appendiculaire',
  })),
  // Phalanges orteils gauche (14)
  { id: 'hallux_proximal_left', name: 'Phalange prox. gros orteil G', nameEn: 'Left hallux proximal', category: 'bone', region: 'foot_left', position: [-0.07, -1.52, 0.16], size: 0.008, system: 'Appendiculaire' },
  { id: 'hallux_distal_left', name: 'Phalange dist. gros orteil G', nameEn: 'Left hallux distal', category: 'bone', region: 'foot_left', position: [-0.07, -1.53, 0.19], size: 0.006, system: 'Appendiculaire' },
  ...['2', '3', '4', '5'].flatMap((toe, ti) => [
    { id: `toe${toe}_proximal_left`, name: `Phalange prox. orteil ${toe} G`, nameEn: `Left toe ${toe} proximal`, category: 'bone' as AnatomyCategory, region: 'foot_left' as AnatomyRegion, position: [-0.085 - ti * 0.015, -1.52, 0.15 + ti * 0.005] as [number, number, number], size: 0.006, system: 'Appendiculaire' },
    { id: `toe${toe}_middle_left`, name: `Phalange moy. orteil ${toe} G`, nameEn: `Left toe ${toe} middle`, category: 'bone' as AnatomyCategory, region: 'foot_left' as AnatomyRegion, position: [-0.085 - ti * 0.015, -1.525, 0.17 + ti * 0.005] as [number, number, number], size: 0.005, system: 'Appendiculaire' },
    { id: `toe${toe}_distal_left`, name: `Phalange dist. orteil ${toe} G`, nameEn: `Left toe ${toe} distal`, category: 'bone' as AnatomyCategory, region: 'foot_left' as AnatomyRegion, position: [-0.085 - ti * 0.015, -1.53, 0.18 + ti * 0.005] as [number, number, number], size: 0.004, system: 'Appendiculaire' },
  ]),
  // Phalanges orteils droit (14)
  { id: 'hallux_proximal_right', name: 'Phalange prox. gros orteil D', nameEn: 'Right hallux proximal', category: 'bone', region: 'foot_right', position: [0.07, -1.52, 0.16], size: 0.008, system: 'Appendiculaire' },
  { id: 'hallux_distal_right', name: 'Phalange dist. gros orteil D', nameEn: 'Right hallux distal', category: 'bone', region: 'foot_right', position: [0.07, -1.53, 0.19], size: 0.006, system: 'Appendiculaire' },
  ...['2', '3', '4', '5'].flatMap((toe, ti) => [
    { id: `toe${toe}_proximal_right`, name: `Phalange prox. orteil ${toe} D`, nameEn: `Right toe ${toe} proximal`, category: 'bone' as AnatomyCategory, region: 'foot_right' as AnatomyRegion, position: [0.085 + ti * 0.015, -1.52, 0.15 + ti * 0.005] as [number, number, number], size: 0.006, system: 'Appendiculaire' },
    { id: `toe${toe}_middle_right`, name: `Phalange moy. orteil ${toe} D`, nameEn: `Right toe ${toe} middle`, category: 'bone' as AnatomyCategory, region: 'foot_right' as AnatomyRegion, position: [0.085 + ti * 0.015, -1.525, 0.17 + ti * 0.005] as [number, number, number], size: 0.005, system: 'Appendiculaire' },
    { id: `toe${toe}_distal_right`, name: `Phalange dist. orteil ${toe} D`, nameEn: `Right toe ${toe} distal`, category: 'bone' as AnatomyCategory, region: 'foot_right' as AnatomyRegion, position: [0.085 + ti * 0.015, -1.53, 0.18 + ti * 0.005] as [number, number, number], size: 0.004, system: 'Appendiculaire' },
  ]),
];

// ========================================
// TEETH - 32 dents (nomenclature FDI)
// ========================================

const TEETH: AnatomyPart[] = [
  // Arcade supérieure droite (11-18)
  { id: 'tooth_11', name: 'Incisive centrale sup. D (11)', nameEn: 'Upper right central incisor', category: 'tooth', region: 'head', position: [0.01, 0.92, 0.12], size: 0.006, description: 'Incisive centrale supérieure droite', system: 'Dentaire' },
  { id: 'tooth_12', name: 'Incisive latérale sup. D (12)', nameEn: 'Upper right lateral incisor', category: 'tooth', region: 'head', position: [0.025, 0.92, 0.115], size: 0.005, description: 'Incisive latérale supérieure droite', system: 'Dentaire' },
  { id: 'tooth_13', name: 'Canine supérieure D (13)', nameEn: 'Upper right canine', category: 'tooth', region: 'head', position: [0.04, 0.92, 0.105], size: 0.006, description: 'Canine supérieure droite', system: 'Dentaire' },
  { id: 'tooth_14', name: '1ère prémolaire sup. D (14)', nameEn: 'Upper right 1st premolar', category: 'tooth', region: 'head', position: [0.055, 0.92, 0.09], size: 0.006, description: 'Première prémolaire supérieure droite', system: 'Dentaire' },
  { id: 'tooth_15', name: '2ème prémolaire sup. D (15)', nameEn: 'Upper right 2nd premolar', category: 'tooth', region: 'head', position: [0.065, 0.92, 0.075], size: 0.006, description: 'Deuxième prémolaire supérieure droite', system: 'Dentaire' },
  { id: 'tooth_16', name: '1ère molaire sup. D (16)', nameEn: 'Upper right 1st molar', category: 'tooth', region: 'head', position: [0.075, 0.92, 0.055], size: 0.008, description: 'Première molaire supérieure droite', system: 'Dentaire' },
  { id: 'tooth_17', name: '2ème molaire sup. D (17)', nameEn: 'Upper right 2nd molar', category: 'tooth', region: 'head', position: [0.08, 0.92, 0.035], size: 0.008, description: 'Deuxième molaire supérieure droite', system: 'Dentaire' },
  { id: 'tooth_18', name: 'Sagesse supérieure D (18)', nameEn: 'Upper right wisdom tooth', category: 'tooth', region: 'head', position: [0.082, 0.92, 0.015], size: 0.008, description: 'Dent de sagesse supérieure droite', system: 'Dentaire' },
  
  // Arcade supérieure gauche (21-28)
  { id: 'tooth_21', name: 'Incisive centrale sup. G (21)', nameEn: 'Upper left central incisor', category: 'tooth', region: 'head', position: [-0.01, 0.92, 0.12], size: 0.006, description: 'Incisive centrale supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_22', name: 'Incisive latérale sup. G (22)', nameEn: 'Upper left lateral incisor', category: 'tooth', region: 'head', position: [-0.025, 0.92, 0.115], size: 0.005, description: 'Incisive latérale supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_23', name: 'Canine supérieure G (23)', nameEn: 'Upper left canine', category: 'tooth', region: 'head', position: [-0.04, 0.92, 0.105], size: 0.006, description: 'Canine supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_24', name: '1ère prémolaire sup. G (24)', nameEn: 'Upper left 1st premolar', category: 'tooth', region: 'head', position: [-0.055, 0.92, 0.09], size: 0.006, description: 'Première prémolaire supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_25', name: '2ème prémolaire sup. G (25)', nameEn: 'Upper left 2nd premolar', category: 'tooth', region: 'head', position: [-0.065, 0.92, 0.075], size: 0.006, description: 'Deuxième prémolaire supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_26', name: '1ère molaire sup. G (26)', nameEn: 'Upper left 1st molar', category: 'tooth', region: 'head', position: [-0.075, 0.92, 0.055], size: 0.008, description: 'Première molaire supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_27', name: '2ème molaire sup. G (27)', nameEn: 'Upper left 2nd molar', category: 'tooth', region: 'head', position: [-0.08, 0.92, 0.035], size: 0.008, description: 'Deuxième molaire supérieure gauche', system: 'Dentaire' },
  { id: 'tooth_28', name: 'Sagesse supérieure G (28)', nameEn: 'Upper left wisdom tooth', category: 'tooth', region: 'head', position: [-0.082, 0.92, 0.015], size: 0.008, description: 'Dent de sagesse supérieure gauche', system: 'Dentaire' },
  
  // Arcade inférieure gauche (31-38)
  { id: 'tooth_31', name: 'Incisive centrale inf. G (31)', nameEn: 'Lower left central incisor', category: 'tooth', region: 'head', position: [-0.008, 0.86, 0.11], size: 0.005, description: 'Incisive centrale inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_32', name: 'Incisive latérale inf. G (32)', nameEn: 'Lower left lateral incisor', category: 'tooth', region: 'head', position: [-0.02, 0.86, 0.105], size: 0.005, description: 'Incisive latérale inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_33', name: 'Canine inférieure G (33)', nameEn: 'Lower left canine', category: 'tooth', region: 'head', position: [-0.035, 0.86, 0.095], size: 0.006, description: 'Canine inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_34', name: '1ère prémolaire inf. G (34)', nameEn: 'Lower left 1st premolar', category: 'tooth', region: 'head', position: [-0.05, 0.86, 0.08], size: 0.006, description: 'Première prémolaire inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_35', name: '2ème prémolaire inf. G (35)', nameEn: 'Lower left 2nd premolar', category: 'tooth', region: 'head', position: [-0.06, 0.86, 0.065], size: 0.006, description: 'Deuxième prémolaire inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_36', name: '1ère molaire inf. G (36)', nameEn: 'Lower left 1st molar', category: 'tooth', region: 'head', position: [-0.07, 0.86, 0.045], size: 0.008, description: 'Première molaire inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_37', name: '2ème molaire inf. G (37)', nameEn: 'Lower left 2nd molar', category: 'tooth', region: 'head', position: [-0.075, 0.86, 0.025], size: 0.008, description: 'Deuxième molaire inférieure gauche', system: 'Dentaire' },
  { id: 'tooth_38', name: 'Sagesse inférieure G (38)', nameEn: 'Lower left wisdom tooth', category: 'tooth', region: 'head', position: [-0.078, 0.86, 0.005], size: 0.008, description: 'Dent de sagesse inférieure gauche', system: 'Dentaire' },
  
  // Arcade inférieure droite (41-48)
  { id: 'tooth_41', name: 'Incisive centrale inf. D (41)', nameEn: 'Lower right central incisor', category: 'tooth', region: 'head', position: [0.008, 0.86, 0.11], size: 0.005, description: 'Incisive centrale inférieure droite', system: 'Dentaire' },
  { id: 'tooth_42', name: 'Incisive latérale inf. D (42)', nameEn: 'Lower right lateral incisor', category: 'tooth', region: 'head', position: [0.02, 0.86, 0.105], size: 0.005, description: 'Incisive latérale inférieure droite', system: 'Dentaire' },
  { id: 'tooth_43', name: 'Canine inférieure D (43)', nameEn: 'Lower right canine', category: 'tooth', region: 'head', position: [0.035, 0.86, 0.095], size: 0.006, description: 'Canine inférieure droite', system: 'Dentaire' },
  { id: 'tooth_44', name: '1ère prémolaire inf. D (44)', nameEn: 'Lower right 1st premolar', category: 'tooth', region: 'head', position: [0.05, 0.86, 0.08], size: 0.006, description: 'Première prémolaire inférieure droite', system: 'Dentaire' },
  { id: 'tooth_45', name: '2ème prémolaire inf. D (45)', nameEn: 'Lower right 2nd premolar', category: 'tooth', region: 'head', position: [0.06, 0.86, 0.065], size: 0.006, description: 'Deuxième prémolaire inférieure droite', system: 'Dentaire' },
  { id: 'tooth_46', name: '1ère molaire inf. D (46)', nameEn: 'Lower right 1st molar', category: 'tooth', region: 'head', position: [0.07, 0.86, 0.045], size: 0.008, description: 'Première molaire inférieure droite', system: 'Dentaire' },
  { id: 'tooth_47', name: '2ème molaire inf. D (47)', nameEn: 'Lower right 2nd molar', category: 'tooth', region: 'head', position: [0.075, 0.86, 0.025], size: 0.008, description: 'Deuxième molaire inférieure droite', system: 'Dentaire' },
  { id: 'tooth_48', name: 'Sagesse inférieure D (48)', nameEn: 'Lower right wisdom tooth', category: 'tooth', region: 'head', position: [0.078, 0.86, 0.005], size: 0.008, description: 'Dent de sagesse inférieure droite', system: 'Dentaire' },
];

// ========================================
// ORGANS - 80+ organes
// ========================================

const ORGANS: AnatomyPart[] = [
  // Système nerveux central
  { id: 'brain', name: 'Cerveau', nameEn: 'Brain', category: 'organ', region: 'head', position: [0, 1.08, 0], size: 0.05, description: 'Centre de contrôle du système nerveux', system: 'Nerveux' },
  { id: 'frontal_lobe_left', name: 'Lobe frontal gauche', nameEn: 'Left frontal lobe', category: 'organ', region: 'head', position: [-0.05, 1.12, 0.06], size: 0.025, description: 'Raisonnement, planification, mouvement volontaire', system: 'Nerveux' },
  { id: 'frontal_lobe_right', name: 'Lobe frontal droit', nameEn: 'Right frontal lobe', category: 'organ', region: 'head', position: [0.05, 1.12, 0.06], size: 0.025, description: 'Raisonnement, planification, mouvement volontaire', system: 'Nerveux' },
  { id: 'parietal_lobe_left', name: 'Lobe pariétal gauche', nameEn: 'Left parietal lobe', category: 'organ', region: 'head', position: [-0.06, 1.15, -0.02], size: 0.022, description: 'Traitement sensoriel et spatial', system: 'Nerveux' },
  { id: 'parietal_lobe_right', name: 'Lobe pariétal droit', nameEn: 'Right parietal lobe', category: 'organ', region: 'head', position: [0.06, 1.15, -0.02], size: 0.022, description: 'Traitement sensoriel et spatial', system: 'Nerveux' },
  { id: 'temporal_lobe_left', name: 'Lobe temporal gauche', nameEn: 'Left temporal lobe', category: 'organ', region: 'head', position: [-0.1, 1.03, 0.02], size: 0.02, description: 'Audition, langage, mémoire', system: 'Nerveux' },
  { id: 'temporal_lobe_right', name: 'Lobe temporal droit', nameEn: 'Right temporal lobe', category: 'organ', region: 'head', position: [0.1, 1.03, 0.02], size: 0.02, description: 'Audition, langage, mémoire', system: 'Nerveux' },
  { id: 'occipital_lobe', name: 'Lobe occipital', nameEn: 'Occipital lobe', category: 'organ', region: 'head', position: [0, 1.08, -0.08], size: 0.025, description: 'Traitement visuel', system: 'Nerveux' },
  { id: 'cerebellum', name: 'Cervelet', nameEn: 'Cerebellum', category: 'organ', region: 'head', position: [0, 0.98, -0.06], size: 0.03, description: 'Coordination motrice et équilibre', system: 'Nerveux' },
  { id: 'brainstem', name: 'Tronc cérébral', nameEn: 'Brainstem', category: 'organ', region: 'head', position: [0, 0.95, -0.02], size: 0.015, description: 'Fonctions vitales automatiques', system: 'Nerveux' },
  { id: 'spinal_cord', name: 'Moelle épinière', nameEn: 'Spinal cord', category: 'organ', region: 'neck', position: [0, 0.4, -0.05], size: 0.02, description: 'Transmission des signaux nerveux', system: 'Nerveux' },
  { id: 'hypothalamus', name: 'Hypothalamus', nameEn: 'Hypothalamus', category: 'organ', region: 'head', position: [0, 1.0, 0.02], size: 0.01, description: 'Régulation hormonale et homéostasie', system: 'Nerveux' },
  { id: 'thalamus', name: 'Thalamus', nameEn: 'Thalamus', category: 'organ', region: 'head', position: [0, 1.02, 0], size: 0.012, description: 'Relais sensoriel vers le cortex', system: 'Nerveux' },
  { id: 'hippocampus_left', name: 'Hippocampe gauche', nameEn: 'Left hippocampus', category: 'organ', region: 'head', position: [-0.04, 1.0, 0], size: 0.008, description: 'Mémoire et apprentissage', system: 'Nerveux' },
  { id: 'hippocampus_right', name: 'Hippocampe droit', nameEn: 'Right hippocampus', category: 'organ', region: 'head', position: [0.04, 1.0, 0], size: 0.008, description: 'Mémoire et apprentissage', system: 'Nerveux' },
  { id: 'amygdala_left', name: 'Amygdale gauche', nameEn: 'Left amygdala', category: 'organ', region: 'head', position: [-0.035, 0.99, 0.02], size: 0.006, description: 'Émotions et réponse à la peur', system: 'Nerveux' },
  { id: 'amygdala_right', name: 'Amygdale droite', nameEn: 'Right amygdala', category: 'organ', region: 'head', position: [0.035, 0.99, 0.02], size: 0.006, description: 'Émotions et réponse à la peur', system: 'Nerveux' },
  
  // Yeux
  { id: 'eye_left', name: 'Œil gauche', nameEn: 'Left eye', category: 'organ', region: 'head', position: [-0.04, 1.0, 0.12], size: 0.015, description: 'Organe de la vision', system: 'Sensoriel' },
  { id: 'eye_right', name: 'Œil droit', nameEn: 'Right eye', category: 'organ', region: 'head', position: [0.04, 1.0, 0.12], size: 0.015, description: 'Organe de la vision', system: 'Sensoriel' },
  
  // Oreilles
  { id: 'inner_ear_left', name: 'Oreille interne gauche', nameEn: 'Left inner ear', category: 'organ', region: 'head', position: [-0.12, 1.02, 0], size: 0.01, description: 'Audition et équilibre', system: 'Sensoriel' },
  { id: 'inner_ear_right', name: 'Oreille interne droite', nameEn: 'Right inner ear', category: 'organ', region: 'head', position: [0.12, 1.02, 0], size: 0.01, description: 'Audition et équilibre', system: 'Sensoriel' },
  
  // Système cardiovasculaire
  { id: 'heart', name: 'Cœur', nameEn: 'Heart', category: 'organ', region: 'trunk', position: [0.02, 0.45, 0.08], size: 0.04, description: 'Pompe le sang dans tout le corps', system: 'Cardiovasculaire' },
  { id: 'right_atrium', name: 'Oreillette droite', nameEn: 'Right atrium', category: 'organ', region: 'trunk', position: [0.06, 0.47, 0.08], size: 0.015, description: 'Reçoit le sang veineux', system: 'Cardiovasculaire' },
  { id: 'left_atrium', name: 'Oreillette gauche', nameEn: 'Left atrium', category: 'organ', region: 'trunk', position: [-0.02, 0.48, 0.06], size: 0.015, description: 'Reçoit le sang oxygéné des poumons', system: 'Cardiovasculaire' },
  { id: 'right_ventricle', name: 'Ventricule droit', nameEn: 'Right ventricle', category: 'organ', region: 'trunk', position: [0.05, 0.42, 0.1], size: 0.018, description: 'Pompe le sang vers les poumons', system: 'Cardiovasculaire' },
  { id: 'left_ventricle', name: 'Ventricule gauche', nameEn: 'Left ventricle', category: 'organ', region: 'trunk', position: [-0.01, 0.42, 0.08], size: 0.02, description: 'Pompe le sang vers le corps', system: 'Cardiovasculaire' },
  { id: 'aorta', name: 'Aorte', nameEn: 'Aorta', category: 'organ', region: 'trunk', position: [0, 0.5, 0.02], size: 0.015, description: 'Principale artère du corps', system: 'Cardiovasculaire' },
  { id: 'pulmonary_artery', name: 'Artère pulmonaire', nameEn: 'Pulmonary artery', category: 'organ', region: 'trunk', position: [0.04, 0.5, 0.06], size: 0.01, description: 'Transporte le sang vers les poumons', system: 'Cardiovasculaire' },
  { id: 'vena_cava_superior', name: 'Veine cave supérieure', nameEn: 'Superior vena cava', category: 'organ', region: 'trunk', position: [0.05, 0.55, 0.03], size: 0.01, description: 'Retour veineux partie supérieure', system: 'Cardiovasculaire' },
  { id: 'vena_cava_inferior', name: 'Veine cave inférieure', nameEn: 'Inferior vena cava', category: 'organ', region: 'trunk', position: [0.05, 0.2, 0], size: 0.012, description: 'Retour veineux partie inférieure', system: 'Cardiovasculaire' },
  
  // Système respiratoire
  { id: 'lung_left', name: 'Poumon gauche', nameEn: 'Left lung', category: 'organ', region: 'trunk', position: [-0.12, 0.45, 0.02], size: 0.045, description: 'Poumon gauche (2 lobes)', system: 'Respiratoire' },
  { id: 'lung_right', name: 'Poumon droit', nameEn: 'Right lung', category: 'organ', region: 'trunk', position: [0.12, 0.45, 0.02], size: 0.05, description: 'Poumon droit (3 lobes)', system: 'Respiratoire' },
  { id: 'lung_left_upper_lobe', name: 'Lobe sup. poumon G', nameEn: 'Left upper lobe', category: 'organ', region: 'trunk', position: [-0.12, 0.52, 0.03], size: 0.025, description: 'Lobe supérieur gauche', system: 'Respiratoire' },
  { id: 'lung_left_lower_lobe', name: 'Lobe inf. poumon G', nameEn: 'Left lower lobe', category: 'organ', region: 'trunk', position: [-0.12, 0.38, 0.01], size: 0.025, description: 'Lobe inférieur gauche', system: 'Respiratoire' },
  { id: 'lung_right_upper_lobe', name: 'Lobe sup. poumon D', nameEn: 'Right upper lobe', category: 'organ', region: 'trunk', position: [0.12, 0.54, 0.03], size: 0.022, description: 'Lobe supérieur droit', system: 'Respiratoire' },
  { id: 'lung_right_middle_lobe', name: 'Lobe moy. poumon D', nameEn: 'Right middle lobe', category: 'organ', region: 'trunk', position: [0.14, 0.45, 0.05], size: 0.018, description: 'Lobe moyen droit', system: 'Respiratoire' },
  { id: 'lung_right_lower_lobe', name: 'Lobe inf. poumon D', nameEn: 'Right lower lobe', category: 'organ', region: 'trunk', position: [0.12, 0.36, 0], size: 0.025, description: 'Lobe inférieur droit', system: 'Respiratoire' },
  { id: 'trachea', name: 'Trachée', nameEn: 'Trachea', category: 'organ', region: 'neck', position: [0, 0.72, 0.05], size: 0.015, description: 'Conduit d\'air vers les poumons', system: 'Respiratoire' },
  { id: 'bronchus_left', name: 'Bronche gauche', nameEn: 'Left bronchus', category: 'organ', region: 'trunk', position: [-0.06, 0.58, 0.03], size: 0.01, description: 'Conduit d\'air vers le poumon gauche', system: 'Respiratoire' },
  { id: 'bronchus_right', name: 'Bronche droite', nameEn: 'Right bronchus', category: 'organ', region: 'trunk', position: [0.06, 0.58, 0.03], size: 0.01, description: 'Conduit d\'air vers le poumon droit', system: 'Respiratoire' },
  { id: 'diaphragm', name: 'Diaphragme', nameEn: 'Diaphragm', category: 'organ', region: 'trunk', position: [0, 0.28, 0.02], size: 0.06, description: 'Muscle principal de la respiration', system: 'Respiratoire' },
  { id: 'larynx', name: 'Larynx', nameEn: 'Larynx', category: 'organ', region: 'neck', position: [0, 0.78, 0.06], size: 0.015, description: 'Organe de la voix', system: 'Respiratoire' },
  { id: 'pharynx', name: 'Pharynx', nameEn: 'Pharynx', category: 'organ', region: 'neck', position: [0, 0.85, 0.02], size: 0.015, description: 'Carrefour aéro-digestif', system: 'Respiratoire' },
  
  // Système digestif
  { id: 'esophagus', name: 'Œsophage', nameEn: 'Esophagus', category: 'organ', region: 'trunk', position: [0, 0.55, -0.02], size: 0.012, description: 'Conduit alimentaire vers l\'estomac', system: 'Digestif' },
  { id: 'stomach', name: 'Estomac', nameEn: 'Stomach', category: 'organ', region: 'trunk', position: [-0.05, 0.18, 0.08], size: 0.04, description: 'Digestion mécanique et chimique', system: 'Digestif' },
  { id: 'liver', name: 'Foie', nameEn: 'Liver', category: 'organ', region: 'trunk', position: [0.08, 0.22, 0.08], size: 0.055, description: 'Détoxification et métabolisme', system: 'Digestif' },
  { id: 'liver_left_lobe', name: 'Lobe gauche du foie', nameEn: 'Left lobe of liver', category: 'organ', region: 'trunk', position: [-0.02, 0.22, 0.1], size: 0.025, description: 'Lobe hépatique gauche', system: 'Digestif' },
  { id: 'liver_right_lobe', name: 'Lobe droit du foie', nameEn: 'Right lobe of liver', category: 'organ', region: 'trunk', position: [0.1, 0.22, 0.06], size: 0.04, description: 'Lobe hépatique droit', system: 'Digestif' },
  { id: 'gallbladder', name: 'Vésicule biliaire', nameEn: 'Gallbladder', category: 'organ', region: 'trunk', position: [0.08, 0.18, 0.1], size: 0.015, description: 'Stockage de la bile', system: 'Digestif' },
  { id: 'pancreas', name: 'Pancréas', nameEn: 'Pancreas', category: 'organ', region: 'trunk', position: [0, 0.12, 0.02], size: 0.03, description: 'Production d\'insuline et enzymes digestives', system: 'Digestif' },
  { id: 'spleen', name: 'Rate', nameEn: 'Spleen', category: 'organ', region: 'trunk', position: [-0.14, 0.18, 0], size: 0.025, description: 'Filtration du sang et immunité', system: 'Digestif' },
  { id: 'duodenum', name: 'Duodénum', nameEn: 'Duodenum', category: 'organ', region: 'trunk', position: [0.04, 0.08, 0.06], size: 0.02, description: 'Première partie de l\'intestin grêle', system: 'Digestif' },
  { id: 'jejunum', name: 'Jéjunum', nameEn: 'Jejunum', category: 'organ', region: 'trunk', position: [-0.02, 0, 0.06], size: 0.03, description: 'Partie médiane de l\'intestin grêle', system: 'Digestif' },
  { id: 'ileum', name: 'Iléon', nameEn: 'Ileum', category: 'organ', region: 'trunk', position: [0, -0.1, 0.06], size: 0.03, description: 'Dernière partie de l\'intestin grêle', system: 'Digestif' },
  { id: 'cecum', name: 'Cæcum', nameEn: 'Cecum', category: 'organ', region: 'trunk', position: [0.12, -0.2, 0.04], size: 0.02, description: 'Début du gros intestin', system: 'Digestif' },
  { id: 'appendix', name: 'Appendice', nameEn: 'Appendix', category: 'organ', region: 'trunk', position: [0.14, -0.25, 0.04], size: 0.01, description: 'Organe lymphoïde vestigial', system: 'Digestif' },
  { id: 'ascending_colon', name: 'Côlon ascendant', nameEn: 'Ascending colon', category: 'organ', region: 'trunk', position: [0.14, -0.1, 0.02], size: 0.02, description: 'Partie droite du gros intestin', system: 'Digestif' },
  { id: 'transverse_colon', name: 'Côlon transverse', nameEn: 'Transverse colon', category: 'organ', region: 'trunk', position: [0, 0.02, 0.08], size: 0.025, description: 'Partie horizontale du gros intestin', system: 'Digestif' },
  { id: 'descending_colon', name: 'Côlon descendant', nameEn: 'Descending colon', category: 'organ', region: 'trunk', position: [-0.14, -0.1, 0.02], size: 0.02, description: 'Partie gauche du gros intestin', system: 'Digestif' },
  { id: 'sigmoid_colon', name: 'Côlon sigmoïde', nameEn: 'Sigmoid colon', category: 'organ', region: 'trunk', position: [-0.1, -0.25, 0.04], size: 0.018, description: 'Partie en S avant le rectum', system: 'Digestif' },
  { id: 'rectum', name: 'Rectum', nameEn: 'Rectum', category: 'organ', region: 'trunk', position: [0, -0.35, -0.02], size: 0.015, description: 'Dernière partie du tube digestif', system: 'Digestif' },
  
  // Système urinaire
  { id: 'kidney_left', name: 'Rein gauche', nameEn: 'Left kidney', category: 'organ', region: 'trunk', position: [-0.1, 0.08, -0.04], size: 0.025, description: 'Filtration du sang et production d\'urine', system: 'Urinaire' },
  { id: 'kidney_right', name: 'Rein droit', nameEn: 'Right kidney', category: 'organ', region: 'trunk', position: [0.1, 0.06, -0.04], size: 0.025, description: 'Filtration du sang et production d\'urine', system: 'Urinaire' },
  { id: 'adrenal_gland_left', name: 'Surrénale gauche', nameEn: 'Left adrenal gland', category: 'organ', region: 'trunk', position: [-0.1, 0.12, -0.02], size: 0.012, description: 'Production d\'hormones (cortisol, adrénaline)', system: 'Endocrinien' },
  { id: 'adrenal_gland_right', name: 'Surrénale droite', nameEn: 'Right adrenal gland', category: 'organ', region: 'trunk', position: [0.1, 0.1, -0.02], size: 0.012, description: 'Production d\'hormones (cortisol, adrénaline)', system: 'Endocrinien' },
  { id: 'ureter_left', name: 'Uretère gauche', nameEn: 'Left ureter', category: 'organ', region: 'trunk', position: [-0.08, -0.15, -0.02], size: 0.008, description: 'Conduit urinaire vers la vessie', system: 'Urinaire' },
  { id: 'ureter_right', name: 'Uretère droit', nameEn: 'Right ureter', category: 'organ', region: 'trunk', position: [0.08, -0.15, -0.02], size: 0.008, description: 'Conduit urinaire vers la vessie', system: 'Urinaire' },
  { id: 'bladder', name: 'Vessie', nameEn: 'Bladder', category: 'organ', region: 'trunk', position: [0, -0.4, 0.05], size: 0.03, description: 'Réservoir d\'urine', system: 'Urinaire' },
  { id: 'urethra', name: 'Urètre', nameEn: 'Urethra', category: 'organ', region: 'trunk', position: [0, -0.48, 0.06], size: 0.008, description: 'Canal d\'évacuation de l\'urine', system: 'Urinaire' },
  
  // Système endocrinien
  { id: 'pituitary_gland', name: 'Hypophyse', nameEn: 'Pituitary gland', category: 'organ', region: 'head', position: [0, 0.98, 0.03], size: 0.008, description: 'Glande maîtresse, régulation hormonale', system: 'Endocrinien' },
  { id: 'pineal_gland', name: 'Glande pinéale', nameEn: 'Pineal gland', category: 'organ', region: 'head', position: [0, 1.02, -0.02], size: 0.006, description: 'Production de mélatonine', system: 'Endocrinien' },
  { id: 'thyroid', name: 'Thyroïde', nameEn: 'Thyroid', category: 'organ', region: 'neck', position: [0, 0.75, 0.07], size: 0.02, description: 'Régulation du métabolisme', system: 'Endocrinien' },
  { id: 'parathyroid_1', name: 'Parathyroïde 1', nameEn: 'Parathyroid 1', category: 'organ', region: 'neck', position: [-0.015, 0.74, 0.06], size: 0.005, description: 'Régulation du calcium', system: 'Endocrinien' },
  { id: 'parathyroid_2', name: 'Parathyroïde 2', nameEn: 'Parathyroid 2', category: 'organ', region: 'neck', position: [0.015, 0.74, 0.06], size: 0.005, description: 'Régulation du calcium', system: 'Endocrinien' },
  { id: 'parathyroid_3', name: 'Parathyroïde 3', nameEn: 'Parathyroid 3', category: 'organ', region: 'neck', position: [-0.015, 0.73, 0.055], size: 0.005, description: 'Régulation du calcium', system: 'Endocrinien' },
  { id: 'parathyroid_4', name: 'Parathyroïde 4', nameEn: 'Parathyroid 4', category: 'organ', region: 'neck', position: [0.015, 0.73, 0.055], size: 0.005, description: 'Régulation du calcium', system: 'Endocrinien' },
  { id: 'thymus', name: 'Thymus', nameEn: 'Thymus', category: 'organ', region: 'trunk', position: [0, 0.58, 0.08], size: 0.02, description: 'Maturation des lymphocytes T', system: 'Lymphatique' },
];

// ========================================
// MUSCLES - 100+ muscles principaux
// ========================================

const MUSCLES: AnatomyPart[] = [
  // Muscles de la tête et du cou
  { id: 'masseter_left', name: 'Masséter gauche', nameEn: 'Left masseter', category: 'muscle', region: 'head', position: [-0.08, 0.93, 0.08], size: 0.015, description: 'Muscle de la mastication', system: 'Musculaire' },
  { id: 'masseter_right', name: 'Masséter droit', nameEn: 'Right masseter', category: 'muscle', region: 'head', position: [0.08, 0.93, 0.08], size: 0.015, description: 'Muscle de la mastication', system: 'Musculaire' },
  { id: 'temporalis_left', name: 'Temporal gauche', nameEn: 'Left temporalis', category: 'muscle', region: 'head', position: [-0.1, 1.05, 0.04], size: 0.02, description: 'Muscle de la mastication', system: 'Musculaire' },
  { id: 'temporalis_right', name: 'Temporal droit', nameEn: 'Right temporalis', category: 'muscle', region: 'head', position: [0.1, 1.05, 0.04], size: 0.02, description: 'Muscle de la mastication', system: 'Musculaire' },
  { id: 'orbicularis_oculi_left', name: 'Orbiculaire œil G', nameEn: 'Left orbicularis oculi', category: 'muscle', region: 'head', position: [-0.04, 1.0, 0.13], size: 0.012, description: 'Fermeture des paupières', system: 'Musculaire' },
  { id: 'orbicularis_oculi_right', name: 'Orbiculaire œil D', nameEn: 'Right orbicularis oculi', category: 'muscle', region: 'head', position: [0.04, 1.0, 0.13], size: 0.012, description: 'Fermeture des paupières', system: 'Musculaire' },
  { id: 'orbicularis_oris', name: 'Orbiculaire des lèvres', nameEn: 'Orbicularis oris', category: 'muscle', region: 'head', position: [0, 0.91, 0.13], size: 0.015, description: 'Mouvement des lèvres', system: 'Musculaire' },
  { id: 'frontalis', name: 'Frontal', nameEn: 'Frontalis', category: 'muscle', region: 'head', position: [0, 1.12, 0.1], size: 0.025, description: 'Élévation des sourcils', system: 'Musculaire' },
  { id: 'sternocleidomastoid_left', name: 'Sterno-cléido-mastoïdien G', nameEn: 'Left sternocleidomastoid', category: 'muscle', region: 'neck', position: [-0.06, 0.78, 0.04], size: 0.02, description: 'Rotation et flexion de la tête', system: 'Musculaire' },
  { id: 'sternocleidomastoid_right', name: 'Sterno-cléido-mastoïdien D', nameEn: 'Right sternocleidomastoid', category: 'muscle', region: 'neck', position: [0.06, 0.78, 0.04], size: 0.02, description: 'Rotation et flexion de la tête', system: 'Musculaire' },
  { id: 'platysma_left', name: 'Platysma gauche', nameEn: 'Left platysma', category: 'muscle', region: 'neck', position: [-0.05, 0.72, 0.06], size: 0.018, description: 'Muscle superficiel du cou', system: 'Musculaire' },
  { id: 'platysma_right', name: 'Platysma droit', nameEn: 'Right platysma', category: 'muscle', region: 'neck', position: [0.05, 0.72, 0.06], size: 0.018, description: 'Muscle superficiel du cou', system: 'Musculaire' },
  { id: 'trapezius', name: 'Trapèze', nameEn: 'Trapezius', category: 'muscle', region: 'trunk', position: [0, 0.6, -0.1], size: 0.06, description: 'Élévation et adduction des omoplates', system: 'Musculaire' },
  { id: 'scalene_anterior_left', name: 'Scalène antérieur G', nameEn: 'Left anterior scalene', category: 'muscle', region: 'neck', position: [-0.04, 0.75, 0.02], size: 0.01, description: 'Flexion latérale du cou', system: 'Musculaire' },
  { id: 'scalene_anterior_right', name: 'Scalène antérieur D', nameEn: 'Right anterior scalene', category: 'muscle', region: 'neck', position: [0.04, 0.75, 0.02], size: 0.01, description: 'Flexion latérale du cou', system: 'Musculaire' },
  
  // Muscles du tronc - antérieurs
  { id: 'pectoralis_major_left', name: 'Grand pectoral gauche', nameEn: 'Left pectoralis major', category: 'muscle', region: 'trunk', position: [-0.12, 0.52, 0.1], size: 0.04, description: 'Adduction et rotation du bras', system: 'Musculaire' },
  { id: 'pectoralis_major_right', name: 'Grand pectoral droit', nameEn: 'Right pectoralis major', category: 'muscle', region: 'trunk', position: [0.12, 0.52, 0.1], size: 0.04, description: 'Adduction et rotation du bras', system: 'Musculaire' },
  { id: 'pectoralis_minor_left', name: 'Petit pectoral gauche', nameEn: 'Left pectoralis minor', category: 'muscle', region: 'trunk', position: [-0.1, 0.5, 0.06], size: 0.02, description: 'Abaissement de l\'omoplate', system: 'Musculaire' },
  { id: 'pectoralis_minor_right', name: 'Petit pectoral droit', nameEn: 'Right pectoralis minor', category: 'muscle', region: 'trunk', position: [0.1, 0.5, 0.06], size: 0.02, description: 'Abaissement de l\'omoplate', system: 'Musculaire' },
  { id: 'serratus_anterior_left', name: 'Dentelé antérieur G', nameEn: 'Left serratus anterior', category: 'muscle', region: 'trunk', position: [-0.18, 0.42, 0.02], size: 0.025, description: 'Protraction de l\'omoplate', system: 'Musculaire' },
  { id: 'serratus_anterior_right', name: 'Dentelé antérieur D', nameEn: 'Right serratus anterior', category: 'muscle', region: 'trunk', position: [0.18, 0.42, 0.02], size: 0.025, description: 'Protraction de l\'omoplate', system: 'Musculaire' },
  { id: 'rectus_abdominis', name: 'Grand droit de l\'abdomen', nameEn: 'Rectus abdominis', category: 'muscle', region: 'trunk', position: [0, 0.1, 0.12], size: 0.05, description: 'Flexion du tronc (tablettes de chocolat)', system: 'Musculaire' },
  { id: 'external_oblique_left', name: 'Oblique externe gauche', nameEn: 'Left external oblique', category: 'muscle', region: 'trunk', position: [-0.12, 0.1, 0.08], size: 0.035, description: 'Rotation et flexion latérale du tronc', system: 'Musculaire' },
  { id: 'external_oblique_right', name: 'Oblique externe droit', nameEn: 'Right external oblique', category: 'muscle', region: 'trunk', position: [0.12, 0.1, 0.08], size: 0.035, description: 'Rotation et flexion latérale du tronc', system: 'Musculaire' },
  { id: 'internal_oblique_left', name: 'Oblique interne gauche', nameEn: 'Left internal oblique', category: 'muscle', region: 'trunk', position: [-0.1, 0.08, 0.06], size: 0.03, description: 'Rotation et flexion latérale du tronc', system: 'Musculaire' },
  { id: 'internal_oblique_right', name: 'Oblique interne droit', nameEn: 'Right internal oblique', category: 'muscle', region: 'trunk', position: [0.1, 0.08, 0.06], size: 0.03, description: 'Rotation et flexion latérale du tronc', system: 'Musculaire' },
  { id: 'transversus_abdominis', name: 'Transverse de l\'abdomen', nameEn: 'Transversus abdominis', category: 'muscle', region: 'trunk', position: [0, 0.05, 0.04], size: 0.04, description: 'Compression abdominale', system: 'Musculaire' },
  
  // Muscles du tronc - postérieurs
  { id: 'latissimus_dorsi_left', name: 'Grand dorsal gauche', nameEn: 'Left latissimus dorsi', category: 'muscle', region: 'trunk', position: [-0.15, 0.25, -0.08], size: 0.05, description: 'Extension et adduction du bras', system: 'Musculaire' },
  { id: 'latissimus_dorsi_right', name: 'Grand dorsal droit', nameEn: 'Right latissimus dorsi', category: 'muscle', region: 'trunk', position: [0.15, 0.25, -0.08], size: 0.05, description: 'Extension et adduction du bras', system: 'Musculaire' },
  { id: 'rhomboid_major_left', name: 'Rhomboïde majeur G', nameEn: 'Left rhomboid major', category: 'muscle', region: 'trunk', position: [-0.08, 0.45, -0.08], size: 0.02, description: 'Rétraction de l\'omoplate', system: 'Musculaire' },
  { id: 'rhomboid_major_right', name: 'Rhomboïde majeur D', nameEn: 'Right rhomboid major', category: 'muscle', region: 'trunk', position: [0.08, 0.45, -0.08], size: 0.02, description: 'Rétraction de l\'omoplate', system: 'Musculaire' },
  { id: 'erector_spinae_left', name: 'Érecteur du rachis G', nameEn: 'Left erector spinae', category: 'muscle', region: 'trunk', position: [-0.04, 0.2, -0.06], size: 0.03, description: 'Extension de la colonne', system: 'Musculaire' },
  { id: 'erector_spinae_right', name: 'Érecteur du rachis D', nameEn: 'Right erector spinae', category: 'muscle', region: 'trunk', position: [0.04, 0.2, -0.06], size: 0.03, description: 'Extension de la colonne', system: 'Musculaire' },
  { id: 'quadratus_lumborum_left', name: 'Carré des lombes G', nameEn: 'Left quadratus lumborum', category: 'muscle', region: 'trunk', position: [-0.08, 0.02, -0.04], size: 0.02, description: 'Flexion latérale du tronc', system: 'Musculaire' },
  { id: 'quadratus_lumborum_right', name: 'Carré des lombes D', nameEn: 'Right quadratus lumborum', category: 'muscle', region: 'trunk', position: [0.08, 0.02, -0.04], size: 0.02, description: 'Flexion latérale du tronc', system: 'Musculaire' },
  
  // Muscles de l'épaule
  { id: 'deltoid_anterior_left', name: 'Deltoïde antérieur G', nameEn: 'Left anterior deltoid', category: 'muscle', region: 'arm_left', position: [-0.22, 0.65, 0.06], size: 0.02, description: 'Flexion du bras', system: 'Musculaire' },
  { id: 'deltoid_anterior_right', name: 'Deltoïde antérieur D', nameEn: 'Right anterior deltoid', category: 'muscle', region: 'arm_right', position: [0.22, 0.65, 0.06], size: 0.02, description: 'Flexion du bras', system: 'Musculaire' },
  { id: 'deltoid_lateral_left', name: 'Deltoïde latéral G', nameEn: 'Left lateral deltoid', category: 'muscle', region: 'arm_left', position: [-0.24, 0.65, 0], size: 0.02, description: 'Abduction du bras', system: 'Musculaire' },
  { id: 'deltoid_lateral_right', name: 'Deltoïde latéral D', nameEn: 'Right lateral deltoid', category: 'muscle', region: 'arm_right', position: [0.24, 0.65, 0], size: 0.02, description: 'Abduction du bras', system: 'Musculaire' },
  { id: 'deltoid_posterior_left', name: 'Deltoïde postérieur G', nameEn: 'Left posterior deltoid', category: 'muscle', region: 'arm_left', position: [-0.22, 0.65, -0.06], size: 0.02, description: 'Extension du bras', system: 'Musculaire' },
  { id: 'deltoid_posterior_right', name: 'Deltoïde postérieur D', nameEn: 'Right posterior deltoid', category: 'muscle', region: 'arm_right', position: [0.22, 0.65, -0.06], size: 0.02, description: 'Extension du bras', system: 'Musculaire' },
  { id: 'supraspinatus_left', name: 'Sus-épineux gauche', nameEn: 'Left supraspinatus', category: 'muscle', region: 'trunk', position: [-0.14, 0.62, -0.06], size: 0.015, description: 'Initiation de l\'abduction', system: 'Musculaire' },
  { id: 'supraspinatus_right', name: 'Sus-épineux droit', nameEn: 'Right supraspinatus', category: 'muscle', region: 'trunk', position: [0.14, 0.62, -0.06], size: 0.015, description: 'Initiation de l\'abduction', system: 'Musculaire' },
  { id: 'infraspinatus_left', name: 'Sous-épineux gauche', nameEn: 'Left infraspinatus', category: 'muscle', region: 'trunk', position: [-0.14, 0.52, -0.08], size: 0.02, description: 'Rotation externe de l\'épaule', system: 'Musculaire' },
  { id: 'infraspinatus_right', name: 'Sous-épineux droit', nameEn: 'Right infraspinatus', category: 'muscle', region: 'trunk', position: [0.14, 0.52, -0.08], size: 0.02, description: 'Rotation externe de l\'épaule', system: 'Musculaire' },
  { id: 'teres_major_left', name: 'Grand rond gauche', nameEn: 'Left teres major', category: 'muscle', region: 'trunk', position: [-0.16, 0.45, -0.06], size: 0.015, description: 'Extension et rotation interne', system: 'Musculaire' },
  { id: 'teres_major_right', name: 'Grand rond droit', nameEn: 'Right teres major', category: 'muscle', region: 'trunk', position: [0.16, 0.45, -0.06], size: 0.015, description: 'Extension et rotation interne', system: 'Musculaire' },
  { id: 'subscapularis_left', name: 'Sous-scapulaire gauche', nameEn: 'Left subscapularis', category: 'muscle', region: 'trunk', position: [-0.14, 0.52, -0.04], size: 0.02, description: 'Rotation interne de l\'épaule', system: 'Musculaire' },
  { id: 'subscapularis_right', name: 'Sous-scapulaire droit', nameEn: 'Right subscapularis', category: 'muscle', region: 'trunk', position: [0.14, 0.52, -0.04], size: 0.02, description: 'Rotation interne de l\'épaule', system: 'Musculaire' },
  
  // Muscles du bras
  { id: 'biceps_brachii_left', name: 'Biceps brachial gauche', nameEn: 'Left biceps brachii', category: 'muscle', region: 'arm_left', position: [-0.28, 0.48, 0.04], size: 0.025, description: 'Flexion du coude et supination', system: 'Musculaire' },
  { id: 'biceps_brachii_right', name: 'Biceps brachial droit', nameEn: 'Right biceps brachii', category: 'muscle', region: 'arm_right', position: [0.28, 0.48, 0.04], size: 0.025, description: 'Flexion du coude et supination', system: 'Musculaire' },
  { id: 'triceps_brachii_left', name: 'Triceps brachial gauche', nameEn: 'Left triceps brachii', category: 'muscle', region: 'arm_left', position: [-0.28, 0.48, -0.04], size: 0.025, description: 'Extension du coude', system: 'Musculaire' },
  { id: 'triceps_brachii_right', name: 'Triceps brachial droit', nameEn: 'Right triceps brachii', category: 'muscle', region: 'arm_right', position: [0.28, 0.48, -0.04], size: 0.025, description: 'Extension du coude', system: 'Musculaire' },
  { id: 'brachialis_left', name: 'Brachial gauche', nameEn: 'Left brachialis', category: 'muscle', region: 'arm_left', position: [-0.29, 0.4, 0.02], size: 0.018, description: 'Flexion du coude', system: 'Musculaire' },
  { id: 'brachialis_right', name: 'Brachial droit', nameEn: 'Right brachialis', category: 'muscle', region: 'arm_right', position: [0.29, 0.4, 0.02], size: 0.018, description: 'Flexion du coude', system: 'Musculaire' },
  { id: 'brachioradialis_left', name: 'Brachio-radial gauche', nameEn: 'Left brachioradialis', category: 'muscle', region: 'arm_left', position: [-0.32, 0.28, 0.03], size: 0.015, description: 'Flexion du coude', system: 'Musculaire' },
  { id: 'brachioradialis_right', name: 'Brachio-radial droit', nameEn: 'Right brachioradialis', category: 'muscle', region: 'arm_right', position: [0.32, 0.28, 0.03], size: 0.015, description: 'Flexion du coude', system: 'Musculaire' },
  
  // Muscles de l'avant-bras
  { id: 'flexor_carpi_radialis_left', name: 'Fléchisseur radial carpe G', nameEn: 'Left flexor carpi radialis', category: 'muscle', region: 'arm_left', position: [-0.33, 0.18, 0.03], size: 0.012, description: 'Flexion du poignet', system: 'Musculaire' },
  { id: 'flexor_carpi_radialis_right', name: 'Fléchisseur radial carpe D', nameEn: 'Right flexor carpi radialis', category: 'muscle', region: 'arm_right', position: [0.33, 0.18, 0.03], size: 0.012, description: 'Flexion du poignet', system: 'Musculaire' },
  { id: 'flexor_carpi_ulnaris_left', name: 'Fléchisseur ulnaire carpe G', nameEn: 'Left flexor carpi ulnaris', category: 'muscle', region: 'arm_left', position: [-0.34, 0.18, -0.02], size: 0.012, description: 'Flexion du poignet', system: 'Musculaire' },
  { id: 'flexor_carpi_ulnaris_right', name: 'Fléchisseur ulnaire carpe D', nameEn: 'Right flexor carpi ulnaris', category: 'muscle', region: 'arm_right', position: [0.34, 0.18, -0.02], size: 0.012, description: 'Flexion du poignet', system: 'Musculaire' },
  { id: 'extensor_carpi_radialis_left', name: 'Extenseur radial carpe G', nameEn: 'Left extensor carpi radialis', category: 'muscle', region: 'arm_left', position: [-0.32, 0.2, -0.03], size: 0.012, description: 'Extension du poignet', system: 'Musculaire' },
  { id: 'extensor_carpi_radialis_right', name: 'Extenseur radial carpe D', nameEn: 'Right extensor carpi radialis', category: 'muscle', region: 'arm_right', position: [0.32, 0.2, -0.03], size: 0.012, description: 'Extension du poignet', system: 'Musculaire' },
  { id: 'pronator_teres_left', name: 'Rond pronateur gauche', nameEn: 'Left pronator teres', category: 'muscle', region: 'arm_left', position: [-0.31, 0.28, 0.01], size: 0.012, description: 'Pronation de l\'avant-bras', system: 'Musculaire' },
  { id: 'pronator_teres_right', name: 'Rond pronateur droit', nameEn: 'Right pronator teres', category: 'muscle', region: 'arm_right', position: [0.31, 0.28, 0.01], size: 0.012, description: 'Pronation de l\'avant-bras', system: 'Musculaire' },
  
  // Muscles de la hanche et fessiers
  { id: 'gluteus_maximus_left', name: 'Grand fessier gauche', nameEn: 'Left gluteus maximus', category: 'muscle', region: 'trunk', position: [-0.12, -0.4, -0.08], size: 0.04, description: 'Extension et rotation externe de la hanche', system: 'Musculaire' },
  { id: 'gluteus_maximus_right', name: 'Grand fessier droit', nameEn: 'Right gluteus maximus', category: 'muscle', region: 'trunk', position: [0.12, -0.4, -0.08], size: 0.04, description: 'Extension et rotation externe de la hanche', system: 'Musculaire' },
  { id: 'gluteus_medius_left', name: 'Moyen fessier gauche', nameEn: 'Left gluteus medius', category: 'muscle', region: 'trunk', position: [-0.15, -0.32, -0.04], size: 0.025, description: 'Abduction de la hanche', system: 'Musculaire' },
  { id: 'gluteus_medius_right', name: 'Moyen fessier droit', nameEn: 'Right gluteus medius', category: 'muscle', region: 'trunk', position: [0.15, -0.32, -0.04], size: 0.025, description: 'Abduction de la hanche', system: 'Musculaire' },
  { id: 'gluteus_minimus_left', name: 'Petit fessier gauche', nameEn: 'Left gluteus minimus', category: 'muscle', region: 'trunk', position: [-0.14, -0.35, -0.02], size: 0.018, description: 'Abduction et rotation interne', system: 'Musculaire' },
  { id: 'gluteus_minimus_right', name: 'Petit fessier droit', nameEn: 'Right gluteus minimus', category: 'muscle', region: 'trunk', position: [0.14, -0.35, -0.02], size: 0.018, description: 'Abduction et rotation interne', system: 'Musculaire' },
  { id: 'iliopsoas_left', name: 'Ilio-psoas gauche', nameEn: 'Left iliopsoas', category: 'muscle', region: 'trunk', position: [-0.08, -0.25, 0.04], size: 0.02, description: 'Flexion de la hanche', system: 'Musculaire' },
  { id: 'iliopsoas_right', name: 'Ilio-psoas droit', nameEn: 'Right iliopsoas', category: 'muscle', region: 'trunk', position: [0.08, -0.25, 0.04], size: 0.02, description: 'Flexion de la hanche', system: 'Musculaire' },
  { id: 'piriformis_left', name: 'Piriforme gauche', nameEn: 'Left piriformis', category: 'muscle', region: 'trunk', position: [-0.1, -0.38, -0.05], size: 0.015, description: 'Rotation externe de la hanche', system: 'Musculaire' },
  { id: 'piriformis_right', name: 'Piriforme droit', nameEn: 'Right piriformis', category: 'muscle', region: 'trunk', position: [0.1, -0.38, -0.05], size: 0.015, description: 'Rotation externe de la hanche', system: 'Musculaire' },
  
  // Muscles de la cuisse - antérieurs
  { id: 'rectus_femoris_left', name: 'Droit fémoral gauche', nameEn: 'Left rectus femoris', category: 'muscle', region: 'leg_left', position: [-0.1, -0.62, 0.06], size: 0.025, description: 'Extension du genou, flexion hanche', system: 'Musculaire' },
  { id: 'rectus_femoris_right', name: 'Droit fémoral droit', nameEn: 'Right rectus femoris', category: 'muscle', region: 'leg_right', position: [0.1, -0.62, 0.06], size: 0.025, description: 'Extension du genou, flexion hanche', system: 'Musculaire' },
  { id: 'vastus_lateralis_left', name: 'Vaste latéral gauche', nameEn: 'Left vastus lateralis', category: 'muscle', region: 'leg_left', position: [-0.14, -0.65, 0.03], size: 0.025, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'vastus_lateralis_right', name: 'Vaste latéral droit', nameEn: 'Right vastus lateralis', category: 'muscle', region: 'leg_right', position: [0.14, -0.65, 0.03], size: 0.025, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'vastus_medialis_left', name: 'Vaste médial gauche', nameEn: 'Left vastus medialis', category: 'muscle', region: 'leg_left', position: [-0.06, -0.75, 0.05], size: 0.022, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'vastus_medialis_right', name: 'Vaste médial droit', nameEn: 'Right vastus medialis', category: 'muscle', region: 'leg_right', position: [0.06, -0.75, 0.05], size: 0.022, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'vastus_intermedius_left', name: 'Vaste intermédiaire G', nameEn: 'Left vastus intermedius', category: 'muscle', region: 'leg_left', position: [-0.1, -0.68, 0.02], size: 0.02, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'vastus_intermedius_right', name: 'Vaste intermédiaire D', nameEn: 'Right vastus intermedius', category: 'muscle', region: 'leg_right', position: [0.1, -0.68, 0.02], size: 0.02, description: 'Extension du genou', system: 'Musculaire' },
  { id: 'sartorius_left', name: 'Sartorius gauche', nameEn: 'Left sartorius', category: 'muscle', region: 'leg_left', position: [-0.08, -0.6, 0.08], size: 0.015, description: 'Flexion hanche et genou', system: 'Musculaire' },
  { id: 'sartorius_right', name: 'Sartorius droit', nameEn: 'Right sartorius', category: 'muscle', region: 'leg_right', position: [0.08, -0.6, 0.08], size: 0.015, description: 'Flexion hanche et genou', system: 'Musculaire' },
  
  // Muscles de la cuisse - postérieurs (ischio-jambiers)
  { id: 'biceps_femoris_left', name: 'Biceps fémoral gauche', nameEn: 'Left biceps femoris', category: 'muscle', region: 'leg_left', position: [-0.13, -0.7, -0.05], size: 0.025, description: 'Flexion du genou', system: 'Musculaire' },
  { id: 'biceps_femoris_right', name: 'Biceps fémoral droit', nameEn: 'Right biceps femoris', category: 'muscle', region: 'leg_right', position: [0.13, -0.7, -0.05], size: 0.025, description: 'Flexion du genou', system: 'Musculaire' },
  { id: 'semitendinosus_left', name: 'Semi-tendineux gauche', nameEn: 'Left semitendinosus', category: 'muscle', region: 'leg_left', position: [-0.08, -0.7, -0.05], size: 0.02, description: 'Flexion du genou', system: 'Musculaire' },
  { id: 'semitendinosus_right', name: 'Semi-tendineux droit', nameEn: 'Right semitendinosus', category: 'muscle', region: 'leg_right', position: [0.08, -0.7, -0.05], size: 0.02, description: 'Flexion du genou', system: 'Musculaire' },
  { id: 'semimembranosus_left', name: 'Semi-membraneux gauche', nameEn: 'Left semimembranosus', category: 'muscle', region: 'leg_left', position: [-0.06, -0.72, -0.04], size: 0.022, description: 'Flexion du genou', system: 'Musculaire' },
  { id: 'semimembranosus_right', name: 'Semi-membraneux droit', nameEn: 'Right semimembranosus', category: 'muscle', region: 'leg_right', position: [0.06, -0.72, -0.04], size: 0.022, description: 'Flexion du genou', system: 'Musculaire' },
  
  // Muscles de la cuisse - médiaux (adducteurs)
  { id: 'adductor_magnus_left', name: 'Grand adducteur gauche', nameEn: 'Left adductor magnus', category: 'muscle', region: 'leg_left', position: [-0.06, -0.58, 0], size: 0.025, description: 'Adduction de la cuisse', system: 'Musculaire' },
  { id: 'adductor_magnus_right', name: 'Grand adducteur droit', nameEn: 'Right adductor magnus', category: 'muscle', region: 'leg_right', position: [0.06, -0.58, 0], size: 0.025, description: 'Adduction de la cuisse', system: 'Musculaire' },
  { id: 'adductor_longus_left', name: 'Long adducteur gauche', nameEn: 'Left adductor longus', category: 'muscle', region: 'leg_left', position: [-0.05, -0.52, 0.04], size: 0.018, description: 'Adduction de la cuisse', system: 'Musculaire' },
  { id: 'adductor_longus_right', name: 'Long adducteur droit', nameEn: 'Right adductor longus', category: 'muscle', region: 'leg_right', position: [0.05, -0.52, 0.04], size: 0.018, description: 'Adduction de la cuisse', system: 'Musculaire' },
  { id: 'gracilis_left', name: 'Gracile gauche', nameEn: 'Left gracilis', category: 'muscle', region: 'leg_left', position: [-0.04, -0.65, 0.02], size: 0.012, description: 'Adduction et flexion du genou', system: 'Musculaire' },
  { id: 'gracilis_right', name: 'Gracile droit', nameEn: 'Right gracilis', category: 'muscle', region: 'leg_right', position: [0.04, -0.65, 0.02], size: 0.012, description: 'Adduction et flexion du genou', system: 'Musculaire' },
  { id: 'tensor_fasciae_latae_left', name: 'Tenseur fascia lata G', nameEn: 'Left tensor fasciae latae', category: 'muscle', region: 'leg_left', position: [-0.15, -0.45, 0.02], size: 0.015, description: 'Stabilisation du genou', system: 'Musculaire' },
  { id: 'tensor_fasciae_latae_right', name: 'Tenseur fascia lata D', nameEn: 'Right tensor fasciae latae', category: 'muscle', region: 'leg_right', position: [0.15, -0.45, 0.02], size: 0.015, description: 'Stabilisation du genou', system: 'Musculaire' },
  
  // Muscles de la jambe
  { id: 'gastrocnemius_left', name: 'Gastrocnémien gauche', nameEn: 'Left gastrocnemius', category: 'muscle', region: 'leg_left', position: [-0.1, -1.08, -0.03], size: 0.025, description: 'Flexion plantaire et flexion genou', system: 'Musculaire' },
  { id: 'gastrocnemius_right', name: 'Gastrocnémien droit', nameEn: 'Right gastrocnemius', category: 'muscle', region: 'leg_right', position: [0.1, -1.08, -0.03], size: 0.025, description: 'Flexion plantaire et flexion genou', system: 'Musculaire' },
  { id: 'soleus_left', name: 'Soléaire gauche', nameEn: 'Left soleus', category: 'muscle', region: 'leg_left', position: [-0.1, -1.15, -0.02], size: 0.022, description: 'Flexion plantaire', system: 'Musculaire' },
  { id: 'soleus_right', name: 'Soléaire droit', nameEn: 'Right soleus', category: 'muscle', region: 'leg_right', position: [0.1, -1.15, -0.02], size: 0.022, description: 'Flexion plantaire', system: 'Musculaire' },
  { id: 'tibialis_anterior_left', name: 'Tibial antérieur gauche', nameEn: 'Left tibialis anterior', category: 'muscle', region: 'leg_left', position: [-0.08, -1.12, 0.05], size: 0.018, description: 'Dorsiflexion du pied', system: 'Musculaire' },
  { id: 'tibialis_anterior_right', name: 'Tibial antérieur droit', nameEn: 'Right tibialis anterior', category: 'muscle', region: 'leg_right', position: [0.08, -1.12, 0.05], size: 0.018, description: 'Dorsiflexion du pied', system: 'Musculaire' },
  { id: 'tibialis_posterior_left', name: 'Tibial postérieur gauche', nameEn: 'Left tibialis posterior', category: 'muscle', region: 'leg_left', position: [-0.1, -1.18, 0], size: 0.015, description: 'Inversion du pied', system: 'Musculaire' },
  { id: 'tibialis_posterior_right', name: 'Tibial postérieur droit', nameEn: 'Right tibialis posterior', category: 'muscle', region: 'leg_right', position: [0.1, -1.18, 0], size: 0.015, description: 'Inversion du pied', system: 'Musculaire' },
  { id: 'peroneus_longus_left', name: 'Long péronier gauche', nameEn: 'Left peroneus longus', category: 'muscle', region: 'leg_left', position: [-0.14, -1.12, 0.02], size: 0.015, description: 'Éversion du pied', system: 'Musculaire' },
  { id: 'peroneus_longus_right', name: 'Long péronier droit', nameEn: 'Right peroneus longus', category: 'muscle', region: 'leg_right', position: [0.14, -1.12, 0.02], size: 0.015, description: 'Éversion du pied', system: 'Musculaire' },
  { id: 'extensor_digitorum_longus_left', name: 'Extenseur commun orteils G', nameEn: 'Left extensor digitorum longus', category: 'muscle', region: 'leg_left', position: [-0.11, -1.15, 0.04], size: 0.012, description: 'Extension des orteils', system: 'Musculaire' },
  { id: 'extensor_digitorum_longus_right', name: 'Extenseur commun orteils D', nameEn: 'Right extensor digitorum longus', category: 'muscle', region: 'leg_right', position: [0.11, -1.15, 0.04], size: 0.012, description: 'Extension des orteils', system: 'Musculaire' },
];

// ========================================
// EXPORT COMPLETE DATABASE
// ========================================

export const ALL_BONES: AnatomyPart[] = [
  ...SKULL_BONES,
  ...FACE_BONES,
  ...EAR_OSSICLES,
  ...HYOID,
  ...CERVICAL_VERTEBRAE,
  ...THORACIC_VERTEBRAE,
  ...LUMBAR_VERTEBRAE,
  ...SACRUM_COCCYX,
  ...STERNUM,
  ...RIBS,
  ...SHOULDER_GIRDLE,
  ...ARM_BONES,
  ...CARPAL_BONES,
  ...HAND_BONES,
  ...PELVIC_GIRDLE,
  ...LEG_BONES,
  ...TARSAL_BONES,
  ...FOOT_BONES,
];

export const ALL_TEETH = TEETH;
export const ALL_ORGANS = ORGANS;
export const ALL_MUSCLES = MUSCLES;

export const ALL_ANATOMY_PARTS: AnatomyPart[] = [
  ...ALL_BONES,
  ...ALL_TEETH,
  ...ALL_ORGANS,
  ...ALL_MUSCLES,
];

// Statistics
export const ANATOMY_STATS = {
  bones: ALL_BONES.length,
  teeth: ALL_TEETH.length,
  organs: ALL_ORGANS.length,
  muscles: ALL_MUSCLES.length,
  total: ALL_ANATOMY_PARTS.length,
};

// Helper functions
export const getPartsByCategory = (category: AnatomyCategory): AnatomyPart[] => 
  ALL_ANATOMY_PARTS.filter(part => part.category === category);

export const getPartsByRegion = (region: AnatomyRegion): AnatomyPart[] => 
  ALL_ANATOMY_PARTS.filter(part => part.region === region);

export const getPartsBySystem = (system: string): AnatomyPart[] => 
  ALL_ANATOMY_PARTS.filter(part => part.system === system);

export const searchParts = (query: string): AnatomyPart[] => {
  const lowerQuery = query.toLowerCase();
  return ALL_ANATOMY_PARTS.filter(part => 
    part.name.toLowerCase().includes(lowerQuery) ||
    part.nameEn.toLowerCase().includes(lowerQuery) ||
    part.description?.toLowerCase().includes(lowerQuery) ||
    part.system?.toLowerCase().includes(lowerQuery)
  );
};
