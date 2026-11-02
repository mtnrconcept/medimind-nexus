# MediCore anatomical atlas and reference images

## Recovered source

`C:\Users\Pc\Downloads\MediCore-modele-3D\MediCore-Atlas3D.glb` was recovered from the authorized Windows device on 2 November 2026. The original is preserved unchanged in `assets/anatomy/MediCore-Atlas3D.glb` through Git LFS. Its SHA-256 and export metadata are recorded in `assets/anatomy/source.json`.

The glTF 2.0 source contains 3,210 meshes, 3,229 nodes, 19 system groups and 19 materials. It embeds no images or texture files. Attribution in the source: BodyParts3D / The Database Center for Life Science, CC Attribution 4.0 International; Open Anatomy Atlas geometry. The viewer displays source and licence links.

`public/models/MediCore-Atlas3D-web.glb` is a Meshopt-compressed derivative, produced with `@gltf-transform/cli 4.5.1 meshopt --quantize-position 16 --quantize-normal 14`. Size falls from 189,417,880 to 48,567,652 bytes. Mesh, node and material counts and every node name were compared with the source; they are preserved. Quantization changes vertex precision. No anatomy was generated or added. The decoder is bundled from the existing Three.js installation; no decoder CDN is required. The unmodified source stays outside public assets to avoid deploying a second 189 MB download.

The 19 selectable systems are bones/teeth, digestive, sensory, nervous, ligaments, fascias/tendons, muscles, arteries, other structures, endocrine, veins, heart, cartilage, respiratory, lymphoid organs, skin, male reproductive, urinary and membranes. System presence does not establish exhaustive anatomical coverage. For example, respiratory meshes include bronchial trees; the source does not expose a liver parenchyma mesh under an explicit liver name. The viewer does not invent such surfaces.

An older `FinalBaseMesh.obj` and `Group4.mtl` were located in `C:\Users\Pc\OneDrive\Documents\medimind-nexus-1\public\models`, but their contents could not be read because the OneDrive provider was not running. They are not included or used.

## Reference images

These four unmodified PNGs come from `MediCore-squelette-4-vues.zip`, Library item `libfile_0ab37a16acd08191affb88e8f042ef5f`:

- `squelette-face.png`
- `squelette-dos.png`
- `squelette-profil-gauche.png`
- `squelette-profil-droit.png`

Their filenames and 1254 × 1254 RGBA canvases are preserved. They retain the supplied colored edge artifacts. No background removal, recoloring, compositing, mirroring or image generation was performed. The separate `MediCore-calques-valides.zip` contains only the frontal skeleton. Additional image layers were not resolved in Library or the inspected local image/download locations; the real 3D atlas provides the other systems instead.

## Patient integration and limits

The existing patient dossier still supplies its alerts/pathology props. The procedural viewer is replaced by the four-view image mode and an on-demand 49 MB atlas mode, with rotation, zoom, reset, 19 system switches and opacity. The first dossier render does not load the 3D atlas. Rendering is demand-driven when no animated alerts are active.

Alert matching uses explicit organ identifiers and atlas names, including both `kidney` and `kidneys`. Unknown targets remain in the alert list. Cardiac matching uses the heart system to avoid confusing cerebral ventricles with cardiac ventricles. Arteries, veins, ducts and mesenteries are not substituted for missing organ surfaces. Only identified structures pulse red/orange; INFO alerts do not pulse. Reduced-motion preferences disable the pulse. Hidden/unavailable structures and an absence of color never assert normal health.

The image-mode zones are schematic and frontal only. These illustrations and the atlas are reference anatomy, not patient imaging, an individualized digital twin, validated segmentation, or a new clinical assessment. The full alert list stays accessible independently of image/WebGL availability. Anatomy search retains reference descriptions; its pre-existing coordinates are not assumed calibrated to this atlas.

## Validation and rollback

- Full Node regression suite and focused atlas typecheck are run for the integration; exact results are in the PR.
- Four independent PNG signatures/canvases, real compressed GLB structure, all 19 system groups and explicit mesh matching are regression-tested.
- The compressed model was decoded using the same GLTFLoader and bundled Meshopt decoder as the viewer: 3,210 meshes, 19 scene roots, finite upright bounds (approximately 0.67 × 1.73 × 0.29 m).
- ESLint, the existing clinical typecheck and the production build are checked.
- Edge headless verification on the authorized Windows device passed using only a synthetic renal alert: 1440px desktop, 390px mobile without horizontal overflow, image loading, frontal/back orientations, 3D loading, all 19 layer switches, muscle visibility, red renal emissive material and changing renal opacity; no page errors. The component and its real assets were bundled into an isolated local test page; the authenticated patient route and Vercel deployment remain unverified.

No database, Auth, RLS, Storage or Edge Function changes. Roll back by reverting the application and asset commits. No changes to main or merge are authorized by this task.
