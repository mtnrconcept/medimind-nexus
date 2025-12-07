-- Create patients table for demo data
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT UNIQUE NOT NULL, -- Hashed ID for anonymity
  age INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
  nationality TEXT NOT NULL,
  pathology_id UUID REFERENCES public.pathologies(id),
  treatment TEXT,
  medical_notes_nlp TEXT, -- Free text medical notes
  lab_results_json JSONB, -- {glucose_mg_dl, blood_pressure_sys, blood_pressure_dia, temperature_c}
  outcome TEXT CHECK (outcome IN ('RESOLVED', 'ONGOING', 'SIDE_EFFECT')),
  height_cm INTEGER,
  weight_kg NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view patients"
ON public.patients FOR SELECT
USING (true);

CREATE POLICY "Admins can manage patients"
ON public.patients FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_patients_updated_at
BEFORE UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert 50+ demo patients with varied data
INSERT INTO public.patients (patient_id, age, gender, nationality, treatment, medical_notes_nlp, lab_results_json, outcome, height_cm, weight_kg) VALUES
-- French patients
('a4f1e2b3', 45, 'M', 'FR', 'Lisinopril 10mg', 'Patient présente des vertiges fréquents et bourdonnements d''oreilles depuis 3 semaines. Hypertension mal contrôlée malgré le traitement. Fatigue générale signalée.', '{"glucose_mg_dl": 98, "blood_pressure_sys": 165, "blood_pressure_dia": 95, "temperature_c": 36.8}', 'ONGOING', 175, 82.5),
('b7c2d4e5', 62, 'F', 'FR', 'Metformine 500mg', 'Diabète type 2 diagnostiqué il y a 5 ans. Bonne observance du traitement. Légère neuropathie périphérique aux pieds.', '{"glucose_mg_dl": 145, "blood_pressure_sys": 128, "blood_pressure_dia": 82, "temperature_c": 36.6}', 'ONGOING', 162, 71.0),
('c8d3e5f6', 38, 'M', 'FR', 'Ventoline PRN', 'Asthme modéré depuis l''enfance. Crises déclenchées par l''effort et le froid. Pas de symptômes nocturnes.', '{"glucose_mg_dl": 92, "blood_pressure_sys": 118, "blood_pressure_dia": 75, "temperature_c": 36.5}', 'RESOLVED', 180, 78.0),
('d9e4f6a7', 55, 'F', 'FR', 'Levothyrox 75mcg', 'Hypothyroïdie découverte lors d''un bilan de fatigue chronique. TSH normalisée sous traitement. Prise de poids modérée.', '{"glucose_mg_dl": 105, "blood_pressure_sys": 125, "blood_pressure_dia": 80, "temperature_c": 36.3}', 'RESOLVED', 165, 68.5),

-- Japanese patients
('e1f5a7b8', 52, 'M', 'JP', 'Ventoline + Seretide', 'Asthme sévère non contrôlé par bêtamimétiques seuls. Résistance partielle au traitement standard. Ajout de corticoïdes inhalés recommandé.', '{"glucose_mg_dl": 88, "blood_pressure_sys": 122, "blood_pressure_dia": 78, "temperature_c": 36.4}', 'SIDE_EFFECT', 168, 65.0),
('f2a6b8c9', 67, 'F', 'JP', 'Amlodipine 5mg', 'Hypertension essentielle bien contrôlée. Suivi cardiologique régulier. Aucune complication.', '{"glucose_mg_dl": 102, "blood_pressure_sys": 135, "blood_pressure_dia": 85, "temperature_c": 36.5}', 'RESOLVED', 155, 52.0),
('a3b7c9d0', 44, 'M', 'JP', 'Metformine 1000mg', 'Diabète type 2 avec HbA1c élevée. Régime seul insuffisant. Glycémie mal contrôlée malgré traitement.', '{"glucose_mg_dl": 240, "blood_pressure_sys": 138, "blood_pressure_dia": 88, "temperature_c": 36.7}', 'ONGOING', 172, 85.0),
('b4c8d0e1', 35, 'F', 'JP', 'Oméprazole 20mg', 'Reflux gastro-œsophagien chronique. Amélioration sous IPP. Recommandations hygiéno-diététiques suivies.', '{"glucose_mg_dl": 95, "blood_pressure_sys": 115, "blood_pressure_dia": 72, "temperature_c": 36.4}', 'RESOLVED', 160, 55.0),

-- American patients
('c5d9e1f2', 58, 'M', 'US', 'Lisinopril 20mg', 'Hypertension avec toux sèche persistante depuis 2 mois. Probable effet secondaire des IEC. Envisager switch vers Losartan.', '{"glucose_mg_dl": 110, "blood_pressure_sys": 142, "blood_pressure_dia": 92, "temperature_c": 36.6}', 'SIDE_EFFECT', 182, 95.0),
('d6e0f2a3', 71, 'F', 'US', 'Insuline Lantus', 'Diabète type 2 insulino-requérant. Hypoglycémies nocturnes fréquentes. Ajustement posologique nécessaire.', '{"glucose_mg_dl": 68, "blood_pressure_sys": 130, "blood_pressure_dia": 78, "temperature_c": 36.5}', 'ONGOING', 165, 72.0),
('e7f1a3b4', 42, 'M', 'US', 'Symbicort', 'Asthme allergique avec rhinite associée. Contrôle satisfaisant sous association fixe. Éviction allergènes recommandée.', '{"glucose_mg_dl": 90, "blood_pressure_sys": 120, "blood_pressure_dia": 75, "temperature_c": 36.4}', 'RESOLVED', 178, 80.0),
('f8a2b4c5', 49, 'F', 'US', 'Atorvastatine 40mg', 'Hypercholestérolémie familiale. LDL réduit de 45% sous statine. Tolérance musculaire correcte.', '{"glucose_mg_dl": 98, "blood_pressure_sys": 125, "blood_pressure_dia": 80, "temperature_c": 36.5}', 'RESOLVED', 168, 65.0),

-- Brazilian patients
('a9b3c5d6', 33, 'M', 'BR', 'Salbutamol PRN', 'Asthme léger intermittent. Symptômes occasionnels à l''effort. Bonne réponse aux bronchodilatateurs.', '{"glucose_mg_dl": 88, "blood_pressure_sys": 115, "blood_pressure_dia": 70, "temperature_c": 36.4}', 'RESOLVED', 175, 72.0),
('b0c4d6e7', 56, 'F', 'BR', 'Metformine + Glibenclamide', 'Diabète type 2 sous bithérapie orale. Équilibre glycémique instable. Hypoglycémies post-prandiales.', '{"glucose_mg_dl": 55, "blood_pressure_sys": 132, "blood_pressure_dia": 85, "temperature_c": 36.3}', 'SIDE_EFFECT', 158, 78.0),
('c1d5e7f8', 64, 'M', 'BR', 'Losartan 50mg', 'Hypertension avec néphropathie débutante. Protection rénale assurée par ARA2. Créatinine stable.', '{"glucose_mg_dl": 108, "blood_pressure_sys": 138, "blood_pressure_dia": 88, "temperature_c": 36.6}', 'ONGOING', 170, 82.0),
('d2e6f8a9', 47, 'F', 'BR', 'Levothyrox 100mcg', 'Thyroïdite d''Hashimoto avec hypothyroïdie. Anticorps anti-TPO positifs. TSH normalisée.', '{"glucose_mg_dl": 96, "blood_pressure_sys": 118, "blood_pressure_dia": 75, "temperature_c": 36.2}', 'RESOLVED', 163, 62.0),

-- German patients
('e3f7a9b0', 51, 'M', 'DE', 'Ramipril 5mg', 'Post-infarctus du myocarde. IEC pour protection cardiaque. Bonne tolérance. Suivi cardiologique trimestriel.', '{"glucose_mg_dl": 105, "blood_pressure_sys": 128, "blood_pressure_dia": 82, "temperature_c": 36.5}', 'RESOLVED', 180, 88.0),
('f4a8b0c1', 39, 'F', 'DE', 'Fluticasone inhalé', 'Asthme allergique aux acariens. Corticothérapie inhalée au long cours. DEP normal.', '{"glucose_mg_dl": 92, "blood_pressure_sys": 112, "blood_pressure_dia": 70, "temperature_c": 36.4}', 'RESOLVED', 172, 64.0),
('a5b9c1d2', 68, 'M', 'DE', 'Insuline + Metformine', 'Diabète type 2 évolué. Insulinothérapie basale + ADO. Surveillance podologique régulière.', '{"glucose_mg_dl": 165, "blood_pressure_sys": 145, "blood_pressure_dia": 90, "temperature_c": 36.7}', 'ONGOING', 175, 92.0),
('b6c0d2e3', 54, 'F', 'DE', 'Bisoprolol 2.5mg', 'Tachycardie sinusale symptomatique. Bêtabloquant à faible dose. Fréquence cardiaque contrôlée.', '{"glucose_mg_dl": 98, "blood_pressure_sys": 120, "blood_pressure_dia": 78, "temperature_c": 36.5}', 'RESOLVED', 165, 58.0),

-- UK patients
('c7d1e3f4', 46, 'M', 'GB', 'Amlodipine 10mg', 'Hypertension résistante. Trithérapie envisagée. Recherche d''hyperaldostéronisme en cours.', '{"glucose_mg_dl": 102, "blood_pressure_sys": 158, "blood_pressure_dia": 98, "temperature_c": 36.6}', 'ONGOING', 178, 90.0),
('d8e2f4a5', 72, 'F', 'GB', 'Metformine 850mg x2', 'Diabète type 2 du sujet âgé. Fonction rénale préservée. HbA1c cible 7.5%.', '{"glucose_mg_dl": 135, "blood_pressure_sys": 138, "blood_pressure_dia": 82, "temperature_c": 36.4}', 'ONGOING', 160, 68.0),
('e9f3a5b6', 29, 'M', 'GB', 'Montelukast 10mg', 'Asthme avec composante allergique. Anti-leucotriène en complément. Amélioration nocturne.', '{"glucose_mg_dl": 85, "blood_pressure_sys": 118, "blood_pressure_dia": 72, "temperature_c": 36.5}', 'RESOLVED', 182, 75.0),
('f0a4b6c7', 61, 'F', 'GB', 'Rosuvastatine 10mg', 'Dyslipidémie mixte. Statine de forte intensité. Surveillance hépatique normale.', '{"glucose_mg_dl": 100, "blood_pressure_sys": 125, "blood_pressure_dia": 78, "temperature_c": 36.5}', 'RESOLVED', 164, 70.0),

-- Indian patients
('a1b5c7d8', 37, 'M', 'IN', 'Metformine 500mg', 'Prédiabète avec syndrome métabolique. Mesures hygiéno-diététiques + Metformine préventive.', '{"glucose_mg_dl": 118, "blood_pressure_sys": 135, "blood_pressure_dia": 85, "temperature_c": 36.6}', 'ONGOING', 170, 85.0),
('b2c6d8e9', 55, 'F', 'IN', 'Telmisartan 40mg', 'Hypertension avec microalbuminurie. ARA2 pour néphroprotection. Contrôle tensionnel optimal.', '{"glucose_mg_dl": 95, "blood_pressure_sys": 130, "blood_pressure_dia": 82, "temperature_c": 36.4}', 'RESOLVED', 158, 62.0),
('c3d7e9f0', 48, 'M', 'IN', 'Glimepiride 2mg', 'Diabète type 2 sous sulfamide. Risque hypoglycémique modéré. Éducation patient renforcée.', '{"glucose_mg_dl": 78, "blood_pressure_sys": 122, "blood_pressure_dia": 78, "temperature_c": 36.5}', 'SIDE_EFFECT', 172, 78.0),
('d4e8f0a1', 66, 'F', 'IN', 'Thyroxine 50mcg', 'Hypothyroïdie subclinique. Traitement substitutif à faible dose. TSH cible 2-4 mUI/L.', '{"glucose_mg_dl": 102, "blood_pressure_sys": 128, "blood_pressure_dia": 80, "temperature_c": 36.3}', 'RESOLVED', 155, 58.0),

-- Canadian patients
('e5f9a1b2', 43, 'M', 'CA', 'Symbicort 200/6', 'BPCO modérée ex-fumeur. Association fixe LABA/CSI. Réhabilitation respiratoire en cours.', '{"glucose_mg_dl": 95, "blood_pressure_sys": 125, "blood_pressure_dia": 80, "temperature_c": 36.5}', 'ONGOING', 180, 85.0),
('f6a0b2c3', 59, 'F', 'CA', 'Perindopril 4mg', 'Hypertension essentielle. IEC bien toléré. PA aux objectifs. Suivi annuel suffisant.', '{"glucose_mg_dl": 98, "blood_pressure_sys": 128, "blood_pressure_dia": 78, "temperature_c": 36.4}', 'RESOLVED', 165, 68.0),
('a7b1c3d4', 34, 'M', 'CA', 'Salbutamol + Fluticasone', 'Asthme persistant léger. Traitement de fond par CSI faible dose. Contrôle optimal.', '{"glucose_mg_dl": 88, "blood_pressure_sys": 115, "blood_pressure_dia": 72, "temperature_c": 36.5}', 'RESOLVED', 175, 72.0),
('b8c2d4e5', 70, 'F', 'CA', 'Sitagliptine 100mg', 'Diabète type 2 intolérant à la Metformine. Inhibiteur DPP4 en monothérapie. Bonne tolérance.', '{"glucose_mg_dl": 142, "blood_pressure_sys": 138, "blood_pressure_dia": 85, "temperature_c": 36.6}', 'ONGOING', 162, 72.0),

-- Australian patients
('c9d3e5f6', 41, 'M', 'AU', 'Enalapril 10mg', 'Hypertension grade 1. IEC première intention. Kaliémie normale. Surveillance semestrielle.', '{"glucose_mg_dl": 92, "blood_pressure_sys": 132, "blood_pressure_dia": 85, "temperature_c": 36.5}', 'RESOLVED', 182, 88.0),
('d0e4f6a7', 53, 'F', 'AU', 'Metformine XR 1000mg', 'Diabète type 2 avec stéatose hépatique. Forme LP pour meilleure tolérance digestive.', '{"glucose_mg_dl": 155, "blood_pressure_sys": 130, "blood_pressure_dia": 82, "temperature_c": 36.5}', 'ONGOING', 168, 82.0),
('e1f5a7b8x', 28, 'M', 'AU', 'Ventoline PRN', 'Asthme d''effort du sportif. Bronchodilatateur avant exercice. Spirométrie normale.', '{"glucose_mg_dl": 85, "blood_pressure_sys": 112, "blood_pressure_dia": 68, "temperature_c": 36.4}', 'RESOLVED', 185, 78.0),
('f2a6b8c9x', 65, 'F', 'AU', 'Ezetimibe 10mg', 'Hypercholestérolémie sous statine insuffisante. Ajout d''Ezetimibe. LDL cible atteint.', '{"glucose_mg_dl": 100, "blood_pressure_sys": 125, "blood_pressure_dia": 78, "temperature_c": 36.5}', 'RESOLVED', 160, 65.0),

-- Spanish patients  
('a3b7c9d0x', 50, 'M', 'ES', 'Candesartan 16mg', 'Hypertension avec HVG échographique. ARA2 pour régression HVG. ECG normal.', '{"glucose_mg_dl": 105, "blood_pressure_sys": 145, "blood_pressure_dia": 92, "temperature_c": 36.6}', 'ONGOING', 175, 85.0),
('b4c8d0e1x', 44, 'F', 'ES', 'Liraglutide 1.2mg', 'Diabète type 2 avec obésité. Analogue GLP1 pour double effet. Perte de 8kg en 6 mois.', '{"glucose_mg_dl": 125, "blood_pressure_sys": 128, "blood_pressure_dia": 80, "temperature_c": 36.5}', 'RESOLVED', 165, 78.0),
('c5d9e1f2x', 36, 'M', 'ES', 'Budesonide/Formoterol', 'Asthme modéré persistant. SMART therapy. Bon contrôle symptomatique.', '{"glucose_mg_dl": 90, "blood_pressure_sys": 118, "blood_pressure_dia": 75, "temperature_c": 36.4}', 'RESOLVED', 178, 75.0),
('d6e0f2a3x', 58, 'F', 'ES', 'Lévothyroxine 75mcg', 'Thyroïdectomie pour goitre multinodulaire. Substitution hormonale optimisée.', '{"glucose_mg_dl": 95, "blood_pressure_sys": 122, "blood_pressure_dia": 78, "temperature_c": 36.4}', 'RESOLVED', 162, 60.0),

-- Italian patients
('e7f1a3b4x', 63, 'M', 'IT', 'Nebivolol 5mg', 'Hypertension avec dysfonction érectile sous autres BB. Nebivolol mieux toléré.', '{"glucose_mg_dl": 108, "blood_pressure_sys": 135, "blood_pressure_dia": 85, "temperature_c": 36.5}', 'RESOLVED', 172, 80.0),
('f8a2b4c5x', 47, 'F', 'IT', 'Empagliflozine 10mg', 'Diabète type 2 avec risque cardiovasculaire. Inhibiteur SGLT2 pour protection cardiaque.', '{"glucose_mg_dl": 138, "blood_pressure_sys": 128, "blood_pressure_dia": 80, "temperature_c": 36.5}', 'ONGOING', 165, 68.0),
('a9b3c5d6x', 31, 'M', 'IT', 'Formoterol 12mcg', 'Asthme persistant modéré. LABA seul insuffisant. Ajout CSI recommandé.', '{"glucose_mg_dl": 88, "blood_pressure_sys": 115, "blood_pressure_dia": 72, "temperature_c": 36.4}', 'SIDE_EFFECT', 180, 78.0),
('b0c4d6e7x', 69, 'F', 'IT', 'Pioglitazone 15mg', 'Diabète type 2 avec insulinorésistance marquée. Glitazone ajoutée. Surveillance œdèmes.', '{"glucose_mg_dl": 148, "blood_pressure_sys": 135, "blood_pressure_dia": 82, "temperature_c": 36.6}', 'ONGOING', 158, 75.0),

-- Mexican patients
('c1d5e7f8x', 40, 'M', 'MX', 'Olmesartan 20mg', 'Hypertension de novo. ARA2 en première intention. Bonne réponse tensionnelle.', '{"glucose_mg_dl": 95, "blood_pressure_sys": 128, "blood_pressure_dia": 82, "temperature_c": 36.5}', 'RESOLVED', 170, 78.0),
('d2e6f8a9x', 52, 'F', 'MX', 'Insuline NPH + Rapide', 'Diabète type 2 déséquilibré. Schéma insuline basal-bolus. Éducation thérapeutique.', '{"glucose_mg_dl": 185, "blood_pressure_sys": 142, "blood_pressure_dia": 88, "temperature_c": 36.7}', 'ONGOING', 160, 82.0),
('e3f7a9b0x', 25, 'M', 'MX', 'Cromoglycate sodique', 'Asthme allergique saisonnier. Cromone en prévention. Éviction pollinique.', '{"glucose_mg_dl": 82, "blood_pressure_sys": 110, "blood_pressure_dia": 68, "temperature_c": 36.4}', 'RESOLVED', 175, 70.0),
('f4a8b0c1x', 57, 'F', 'MX', 'Carbimazole 10mg', 'Hyperthyroïdie de Basedow. Antithyroïdien en cours. TSH en cours de normalisation.', '{"glucose_mg_dl": 88, "blood_pressure_sys": 135, "blood_pressure_dia": 85, "temperature_c": 37.2}', 'ONGOING', 165, 55.0);