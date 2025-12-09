-- ============================================================================
-- SCRIPT : Import des données depuis les fichiers locaux
-- MediMind Nexus - Peuplement complet des tables
-- ============================================================================

-- ============================================================================
-- 1. SYMPTÔMES - Depuis medicalSymptoms.ts (205 symptômes)
-- ============================================================================

-- Général
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Fièvre', 'Général', 'Élévation anormale de la température corporelle', 'Général'),
('Fatigue', 'Général', 'Sensation de manque d''énergie ou d''épuisement', 'Général'),
('Perte de poids', 'Général', 'Diminution involontaire du poids corporel', 'Général'),
('Prise de poids', 'Général', 'Augmentation involontaire du poids corporel', 'Général'),
('Frissons', 'Général', 'Tremblements involontaires avec sensation de froid', 'Général'),
('Sueurs nocturnes', 'Général', 'Transpiration excessive pendant le sommeil', 'Général'),
('Malaise général', 'Général', 'Sensation de mal-être diffuse', 'Général'),
('Asthénie', 'Général', 'Faiblesse généralisée', 'Général'),
('Anorexie', 'Général', 'Perte d''appétit', 'Général'),
('Déshydratation', 'Général', 'Manque d''eau dans l''organisme', 'Général')
ON CONFLICT DO NOTHING;

-- Neurologique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Céphalées', 'Neurologique', 'Douleurs à la tête', 'Neurologique'),
('Migraines', 'Neurologique', 'Céphalées intenses et pulsatiles', 'Neurologique'),
('Vertiges', 'Neurologique', 'Sensation de mouvement ou de rotation', 'Neurologique'),
('Syncope', 'Neurologique', 'Perte de connaissance brève', 'Neurologique'),
('Tremblements', 'Neurologique', 'Mouvements involontaires oscillatoires', 'Neurologique'),
('Convulsions', 'Neurologique', 'Contractions musculaires involontaires', 'Neurologique'),
('Paresthésies', 'Neurologique', 'Sensations anormales (fourmillements, picotements)', 'Neurologique'),
('Engourdissements', 'Neurologique', 'Perte de sensibilité', 'Neurologique'),
('Troubles de la mémoire', 'Neurologique', 'Difficultés à retenir les informations', 'Neurologique'),
('Confusion', 'Neurologique', 'Désorientation et troubles de la pensée', 'Neurologique'),
('Troubles de la concentration', 'Neurologique', 'Difficulté à maintenir l''attention', 'Neurologique'),
('Insomnie', 'Neurologique', 'Difficulté à s''endormir ou à maintenir le sommeil', 'Neurologique'),
('Somnolence', 'Neurologique', 'Envie excessive de dormir', 'Neurologique'),
('Paralysie', 'Neurologique', 'Perte de la fonction motrice', 'Neurologique'),
('Troubles de l''équilibre', 'Neurologique', 'Difficultés à maintenir la posture', 'Neurologique'),
('Troubles de la vision', 'Neurologique', 'Altération de la vue', 'Neurologique'),
('Diplopie', 'Neurologique', 'Vision double', 'Neurologique'),
('Photophobie', 'Neurologique', 'Intolérance à la lumière', 'Neurologique'),
('Acouphènes', 'Neurologique', 'Perception de sons sans source externe', 'Neurologique')
ON CONFLICT DO NOTHING;

-- Cardiovasculaire
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Douleur thoracique', 'Cardiovasculaire', 'Douleur dans la région du thorax', 'Cardiovasculaire'),
('Palpitations', 'Cardiovasculaire', 'Perception anormale des battements cardiaques', 'Cardiovasculaire'),
('Dyspnée', 'Cardiovasculaire', 'Difficulté à respirer', 'Cardiovasculaire'),
('Œdèmes des membres inférieurs', 'Cardiovasculaire', 'Gonflement des jambes', 'Cardiovasculaire'),
('Hypertension', 'Cardiovasculaire', 'Pression artérielle élevée', 'Cardiovasculaire'),
('Hypotension', 'Cardiovasculaire', 'Pression artérielle basse', 'Cardiovasculaire'),
('Tachycardie', 'Cardiovasculaire', 'Accélération du rythme cardiaque', 'Cardiovasculaire'),
('Bradycardie', 'Cardiovasculaire', 'Ralentissement du rythme cardiaque', 'Cardiovasculaire'),
('Cyanose', 'Cardiovasculaire', 'Coloration bleutée de la peau', 'Cardiovasculaire'),
('Claudication intermittente', 'Cardiovasculaire', 'Douleur à la marche', 'Cardiovasculaire'),
('Varices', 'Cardiovasculaire', 'Dilatation des veines', 'Cardiovasculaire')
ON CONFLICT DO NOTHING;

-- Respiratoire
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Toux', 'Respiratoire', 'Expulsion brutale d''air des poumons', 'Respiratoire'),
('Toux productive', 'Respiratoire', 'Toux avec expectorations', 'Respiratoire'),
('Expectorations', 'Respiratoire', 'Rejet de sécrétions bronchiques', 'Respiratoire'),
('Hémoptysie', 'Respiratoire', 'Crachats de sang', 'Respiratoire'),
('Essoufflement', 'Respiratoire', 'Difficulté à reprendre son souffle', 'Respiratoire'),
('Wheezing', 'Respiratoire', 'Sifflement respiratoire', 'Respiratoire'),
('Stridor', 'Respiratoire', 'Bruit respiratoire aigu', 'Respiratoire'),
('Apnée du sommeil', 'Respiratoire', 'Arrêts respiratoires pendant le sommeil', 'Respiratoire'),
('Rhinorrhée', 'Respiratoire', 'Écoulement nasal', 'Respiratoire'),
('Congestion nasale', 'Respiratoire', 'Obstruction nasale', 'Respiratoire'),
('Éternuements', 'Respiratoire', 'Expulsion brutale d''air par le nez', 'Respiratoire'),
('Épistaxis', 'Respiratoire', 'Saignement de nez', 'Respiratoire'),
('Douleur pleurale', 'Respiratoire', 'Douleur thoracique à la respiration', 'Respiratoire')
ON CONFLICT DO NOTHING;

-- Digestif
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Douleur abdominale', 'Digestif', 'Douleur dans la région de l''abdomen', 'Digestif'),
('Nausées', 'Digestif', 'Envie de vomir', 'Digestif'),
('Vomissements', 'Digestif', 'Rejet du contenu gastrique', 'Digestif'),
('Diarrhée', 'Digestif', 'Selles liquides et fréquentes', 'Digestif'),
('Constipation', 'Digestif', 'Difficulté à évacuer les selles', 'Digestif'),
('Ballonnements', 'Digestif', 'Sensation de gonflement abdominal', 'Digestif'),
('Flatulences', 'Digestif', 'Émission de gaz intestinaux', 'Digestif'),
('Dysphagie', 'Digestif', 'Difficulté à avaler', 'Digestif'),
('Pyrosis', 'Digestif', 'Brûlures d''estomac', 'Digestif'),
('Reflux gastro-œsophagien', 'Digestif', 'Remontée du contenu gastrique', 'Digestif'),
('Hématémèse', 'Digestif', 'Vomissement de sang', 'Digestif'),
('Méléna', 'Digestif', 'Selles noires (sang digéré)', 'Digestif'),
('Rectorragies', 'Digestif', 'Saignement rectal', 'Digestif'),
('Ictère', 'Digestif', 'Jaunisse', 'Digestif'),
('Hépatomégalie', 'Digestif', 'Augmentation du volume du foie', 'Digestif'),
('Splénomégalie', 'Digestif', 'Augmentation du volume de la rate', 'Digestif'),
('Ascite', 'Digestif', 'Accumulation de liquide dans l''abdomen', 'Digestif'),
('Prurit anal', 'Digestif', 'Démangeaisons anales', 'Digestif')
ON CONFLICT DO NOTHING;

-- Urinaire
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Dysurie', 'Urinaire', 'Difficulté ou douleur à uriner', 'Urinaire'),
('Pollakiurie', 'Urinaire', 'Mictions fréquentes', 'Urinaire'),
('Nycturie', 'Urinaire', 'Mictions nocturnes fréquentes', 'Urinaire'),
('Hématurie', 'Urinaire', 'Présence de sang dans les urines', 'Urinaire'),
('Incontinence urinaire', 'Urinaire', 'Perte involontaire d''urine', 'Urinaire'),
('Rétention urinaire', 'Urinaire', 'Impossibilité d''uriner', 'Urinaire'),
('Urgence mictionnelle', 'Urinaire', 'Besoin urgent d''uriner', 'Urinaire'),
('Douleur lombaire', 'Urinaire', 'Douleur dans le bas du dos', 'Urinaire'),
('Colique néphrétique', 'Urinaire', 'Douleur intense liée aux calculs rénaux', 'Urinaire'),
('Oligurie', 'Urinaire', 'Diminution du volume urinaire', 'Urinaire'),
('Polyurie', 'Urinaire', 'Augmentation du volume urinaire', 'Urinaire'),
('Protéinurie', 'Urinaire', 'Présence de protéines dans les urines', 'Urinaire')
ON CONFLICT DO NOTHING;

-- Musculo-squelettique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Douleurs articulaires', 'Musculo-squelettique', 'Douleur dans les articulations', 'Musculo-squelettique'),
('Arthralgie', 'Musculo-squelettique', 'Douleur articulaire', 'Musculo-squelettique'),
('Myalgies', 'Musculo-squelettique', 'Douleurs musculaires', 'Musculo-squelettique'),
('Raideur articulaire', 'Musculo-squelettique', 'Difficulté à bouger les articulations', 'Musculo-squelettique'),
('Gonflement articulaire', 'Musculo-squelettique', 'Œdème des articulations', 'Musculo-squelettique'),
('Lombalgie', 'Musculo-squelettique', 'Douleur lombaire', 'Musculo-squelettique'),
('Cervicalgie', 'Musculo-squelettique', 'Douleur cervicale', 'Musculo-squelettique'),
('Dorsalgie', 'Musculo-squelettique', 'Douleur dorsale', 'Musculo-squelettique'),
('Crampes musculaires', 'Musculo-squelettique', 'Contractions musculaires douloureuses', 'Musculo-squelettique'),
('Faiblesse musculaire', 'Musculo-squelettique', 'Diminution de la force musculaire', 'Musculo-squelettique'),
('Atrophie musculaire', 'Musculo-squelettique', 'Diminution du volume musculaire', 'Musculo-squelettique'),
('Fractures', 'Musculo-squelettique', 'Rupture osseuse', 'Musculo-squelettique'),
('Déformations articulaires', 'Musculo-squelettique', 'Altération de la forme des articulations', 'Musculo-squelettique')
ON CONFLICT DO NOTHING;

-- Dermatologique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Éruption cutanée', 'Dermatologique', 'Lésions visibles sur la peau', 'Dermatologique'),
('Prurit', 'Dermatologique', 'Démangeaisons', 'Dermatologique'),
('Urticaire', 'Dermatologique', 'Plaques rouges prurigineuses', 'Dermatologique'),
('Eczéma', 'Dermatologique', 'Inflammation cutanée avec démangeaisons', 'Dermatologique'),
('Psoriasis', 'Dermatologique', 'Plaques squameuses rouges', 'Dermatologique'),
('Acné', 'Dermatologique', 'Lésions inflammatoires de la peau', 'Dermatologique'),
('Alopécie', 'Dermatologique', 'Perte de cheveux', 'Dermatologique'),
('Hyperpigmentation', 'Dermatologique', 'Taches sombres sur la peau', 'Dermatologique'),
('Hypopigmentation', 'Dermatologique', 'Décoloration de la peau', 'Dermatologique'),
('Pétéchies', 'Dermatologique', 'Petites taches rouges (hémorragies)', 'Dermatologique'),
('Ecchymoses', 'Dermatologique', 'Bleus (hématomes)', 'Dermatologique'),
('Ulcères cutanés', 'Dermatologique', 'Plaies ouvertes de la peau', 'Dermatologique'),
('Nodules cutanés', 'Dermatologique', 'Masses sous la peau', 'Dermatologique'),
('Xérose cutanée', 'Dermatologique', 'Peau sèche', 'Dermatologique'),
('Hyperhidrose', 'Dermatologique', 'Transpiration excessive', 'Dermatologique')
ON CONFLICT DO NOTHING;

-- Endocrinien
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Polydipsie', 'Endocrinien', 'Soif excessive', 'Endocrinien'),
('Polyphagie', 'Endocrinien', 'Faim excessive', 'Endocrinien'),
('Intolérance au froid', 'Endocrinien', 'Sensibilité accrue au froid', 'Endocrinien'),
('Intolérance à la chaleur', 'Endocrinien', 'Sensibilité accrue à la chaleur', 'Endocrinien'),
('Goitre', 'Endocrinien', 'Gonflement de la thyroïde', 'Endocrinien'),
('Exophtalmie', 'Endocrinien', 'Protrusion des globes oculaires', 'Endocrinien'),
('Gynécomastie', 'Endocrinien', 'Développement des seins chez l''homme', 'Endocrinien'),
('Hirsutisme', 'Endocrinien', 'Pilosité excessive chez la femme', 'Endocrinien'),
('Troubles de la croissance', 'Endocrinien', 'Anomalies de la croissance', 'Endocrinien')
ON CONFLICT DO NOTHING;

-- Hématologique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Anémie', 'Hématologique', 'Diminution des globules rouges', 'Hématologique'),
('Pâleur', 'Hématologique', 'Décoloration de la peau et muqueuses', 'Hématologique'),
('Saignements anormaux', 'Hématologique', 'Saignements excessifs ou prolongés', 'Hématologique'),
('Thrombose', 'Hématologique', 'Formation de caillots sanguins', 'Hématologique'),
('Adénopathies', 'Hématologique', 'Ganglions lymphatiques gonflés', 'Hématologique'),
('Purpura', 'Hématologique', 'Taches hémorragiques sous la peau', 'Hématologique')
ON CONFLICT DO NOTHING;

-- Psychiatrique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Anxiété', 'Psychiatrique', 'Sentiment d''inquiétude excessive', 'Psychiatrique'),
('Dépression', 'Psychiatrique', 'Tristesse persistante, perte d''intérêt', 'Psychiatrique'),
('Irritabilité', 'Psychiatrique', 'Susceptibilité accrue', 'Psychiatrique'),
('Troubles du sommeil', 'Psychiatrique', 'Altération du sommeil', 'Psychiatrique'),
('Hallucinations', 'Psychiatrique', 'Perceptions sans objet réel', 'Psychiatrique'),
('Délires', 'Psychiatrique', 'Croyances fausses et irrationnelles', 'Psychiatrique'),
('Troubles de l''humeur', 'Psychiatrique', 'Variations anormales de l''humeur', 'Psychiatrique'),
('Attaques de panique', 'Psychiatrique', 'Épisodes d''anxiété intense', 'Psychiatrique'),
('Phobies', 'Psychiatrique', 'Peurs irrationnelles', 'Psychiatrique'),
('Troubles obsessionnels', 'Psychiatrique', 'Pensées intrusives et comportements répétitifs', 'Psychiatrique'),
('Troubles alimentaires', 'Psychiatrique', 'Comportements alimentaires pathologiques', 'Psychiatrique'),
('Agitation', 'Psychiatrique', 'Activité motrice excessive', 'Psychiatrique'),
('Apathie', 'Psychiatrique', 'Manque d''intérêt et d''émotion', 'Psychiatrique')
ON CONFLICT DO NOTHING;

-- ORL
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Otalgie', 'ORL', 'Douleur de l''oreille', 'ORL'),
('Otorrhée', 'ORL', 'Écoulement de l''oreille', 'ORL'),
('Surdité', 'ORL', 'Perte d''audition', 'ORL'),
('Pharyngite', 'ORL', 'Inflammation du pharynx', 'ORL'),
('Odynophagie', 'ORL', 'Douleur à la déglutition', 'ORL'),
('Dysphonie', 'ORL', 'Altération de la voix', 'ORL'),
('Aphonie', 'ORL', 'Perte totale de la voix', 'ORL'),
('Sinusite', 'ORL', 'Inflammation des sinus', 'ORL'),
('Anosmie', 'ORL', 'Perte de l''odorat', 'ORL'),
('Dysgueusie', 'ORL', 'Altération du goût', 'ORL')
ON CONFLICT DO NOTHING;

-- Ophtalmologique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Douleur oculaire', 'Ophtalmologique', 'Douleur dans l''œil', 'Ophtalmologique'),
('Rougeur oculaire', 'Ophtalmologique', 'Œil rouge', 'Ophtalmologique'),
('Larmoiement', 'Ophtalmologique', 'Écoulement de larmes excessif', 'Ophtalmologique'),
('Sécheresse oculaire', 'Ophtalmologique', 'Manque de lubrification de l''œil', 'Ophtalmologique'),
('Vision floue', 'Ophtalmologique', 'Perte de netteté de la vision', 'Ophtalmologique'),
('Scotomes', 'Ophtalmologique', 'Taches dans le champ visuel', 'Ophtalmologique'),
('Phosphènes', 'Ophtalmologique', 'Perception de flashs lumineux', 'Ophtalmologique'),
('Myodésopsies', 'Ophtalmologique', 'Corps flottants dans la vision', 'Ophtalmologique'),
('Conjonctivite', 'Ophtalmologique', 'Inflammation de la conjonctive', 'Ophtalmologique')
ON CONFLICT DO NOTHING;

-- Gynécologique
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Aménorrhée', 'Gynécologique', 'Absence de règles', 'Gynécologique'),
('Dysménorrhée', 'Gynécologique', 'Règles douloureuses', 'Gynécologique'),
('Ménorragies', 'Gynécologique', 'Règles abondantes', 'Gynécologique'),
('Métrorragies', 'Gynécologique', 'Saignements entre les règles', 'Gynécologique'),
('Leucorrhées', 'Gynécologique', 'Pertes vaginales', 'Gynécologique'),
('Douleurs pelviennes', 'Gynécologique', 'Douleur dans le bas-ventre', 'Gynécologique'),
('Dyspareunie', 'Gynécologique', 'Douleur pendant les rapports', 'Gynécologique'),
('Bouffées de chaleur', 'Gynécologique', 'Sensation soudaine de chaleur', 'Gynécologique'),
('Mastodynie', 'Gynécologique', 'Douleur mammaire', 'Gynécologique')
ON CONFLICT DO NOTHING;

-- Infectieux
INSERT INTO symptoms (name, body_system, description, category) VALUES
('Fièvre prolongée', 'Infectieux', 'Fièvre durant plus de 7 jours', 'Infectieux'),
('Syndrome grippal', 'Infectieux', 'Ensemble de symptômes pseudo-grippaux', 'Infectieux'),
('Sepsis', 'Infectieux', 'Infection généralisée grave', 'Infectieux'),
('Abcès', 'Infectieux', 'Collection de pus', 'Infectieux'),
('Cellulite infectieuse', 'Infectieux', 'Infection du tissu sous-cutané', 'Infectieux')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. PATHOLOGIES COURANTES
-- ============================================================================

INSERT INTO pathologies (name, category, specialty, severity, description, synonyms) VALUES
-- Respiratoire
('Asthme', 'Respiratory', 'Pneumologie', 'moderate', 'Maladie inflammatoire chronique des voies respiratoires', ARRAY['Asthma']),
('Asthme sévère', 'Respiratory', 'Pneumologie', 'severe', 'Forme sévère d''asthme nécessitant un traitement intensif', ARRAY['Severe asthma']),
('BPCO', 'Respiratory', 'Pneumologie', 'severe', 'Bronchopneumopathie chronique obstructive', ARRAY['COPD', 'Bronchopneumopathie Chronique Obstructive']),
('Pneumonie', 'Respiratory', 'Pneumologie', 'moderate', 'Infection pulmonaire', ARRAY['Pneumonia']),
('Bronchite', 'Respiratory', 'Pneumologie', 'mild', 'Inflammation des bronches', ARRAY['Bronchitis']),
('Polypose nasosinusienne', 'Respiratory', 'ORL', 'moderate', 'Polypes dans les sinus et fosses nasales', ARRAY['Nasal polyps', 'Polypose nasale']),

-- Cardiovasculaire
('Hypertension artérielle', 'Cardiovascular', 'Cardiologie', 'moderate', 'Pression artérielle élevée chronique', ARRAY['HTA', 'High blood pressure', 'Hypertension']),
('Insuffisance cardiaque', 'Cardiovascular', 'Cardiologie', 'severe', 'Défaillance de la pompe cardiaque', ARRAY['Heart failure']),
('Arythmie', 'Cardiovascular', 'Cardiologie', 'moderate', 'Trouble du rythme cardiaque', ARRAY['Arrhythmia']),
('Infarctus du myocarde', 'Cardiovascular', 'Cardiologie', 'critical', 'Crise cardiaque', ARRAY['Heart attack', 'MI']),

-- Digestif
('Reflux gastro-oesophagien', 'Digestive', 'Gastroentérologie', 'mild', 'Remontée du contenu gastrique', ARRAY['RGO', 'GERD', 'Reflux acide']),
('Ulcère gastrique', 'Digestive', 'Gastroentérologie', 'moderate', 'Lésion de la muqueuse gastrique', ARRAY['Gastric ulcer']),
('Syndrome du côlon irritable', 'Digestive', 'Gastroentérologie', 'mild', 'Troubles fonctionnels intestinaux', ARRAY['IBS', 'Colopathie fonctionnelle']),
('Maladie de Crohn', 'Digestive', 'Gastroentérologie', 'moderate', 'Maladie inflammatoire chronique intestinale', ARRAY['Crohn''s disease']),
('Cirrhose', 'Digestive', 'Hépatologie', 'severe', 'Maladie hépatique chronique', ARRAY['Cirrhosis']),

-- Endocrinien
('Diabète de type 1', 'Endocrine', 'Endocrinologie', 'moderate', 'Diabète insulinodépendant', ARRAY['Type 1 diabetes', 'T1D']),
('Diabète de type 2', 'Endocrine', 'Endocrinologie', 'moderate', 'Diabète non insulinodépendant', ARRAY['Type 2 diabetes', 'T2D', 'Diabète']),
('Hypothyroïdie', 'Endocrine', 'Endocrinologie', 'mild', 'Insuffisance thyroïdienne', ARRAY['Hypothyroidism']),
('Hyperthyroïdie', 'Endocrine', 'Endocrinologie', 'moderate', 'Hyperfonction thyroïdienne', ARRAY['Hyperthyroidism']),

-- Allergies
('Rhinite allergique', 'Allergy', 'Allergologie', 'mild', 'Allergie nasale', ARRAY['Allergic rhinitis', 'Hay fever']),
('Syndrome de Widal', 'Allergy', 'Allergologie', 'severe', 'Triade asthme, polypose nasale, intolérance aspirine', ARRAY['Samter''s triad', 'AERD', 'Intolérance aspirine']),
('Dermatite atopique', 'Allergy', 'Dermatologie', 'mild', 'Eczéma atopique', ARRAY['Atopic dermatitis', 'Eczema']),

-- Neurologique
('Migraine', 'Neurological', 'Neurologie', 'moderate', 'Céphalées intenses récurrentes', ARRAY['Migraine headache']),
('Épilepsie', 'Neurological', 'Neurologie', 'moderate', 'Trouble neurologique avec crises', ARRAY['Epilepsy']),
('Maladie de Parkinson', 'Neurological', 'Neurologie', 'severe', 'Maladie neurodégénérative', ARRAY['Parkinson''s disease']),
('Maladie d''Alzheimer', 'Neurological', 'Neurologie', 'severe', 'Démence neurodégénérative', ARRAY['Alzheimer''s disease']),
('Sclérose en plaques', 'Neurological', 'Neurologie', 'moderate', 'Maladie auto-immune du SNC', ARRAY['Multiple sclerosis', 'MS']),

-- Psychiatrique
('Dépression majeure', 'Psychiatric', 'Psychiatrie', 'moderate', 'Trouble dépressif majeur', ARRAY['Major depression', 'MDD']),
('Trouble anxieux généralisé', 'Psychiatric', 'Psychiatrie', 'moderate', 'Anxiété chronique', ARRAY['GAD', 'Generalized anxiety disorder']),
('Trouble bipolaire', 'Psychiatric', 'Psychiatrie', 'moderate', 'Alternance d''épisodes maniaco-dépressifs', ARRAY['Bipolar disorder']),
('Schizophrénie', 'Psychiatric', 'Psychiatrie', 'severe', 'Trouble psychotique chronique', ARRAY['Schizophrenia']),

-- Rhumatologique
('Polyarthrite rhumatoïde', 'Rheumatological', 'Rhumatologie', 'moderate', 'Maladie auto-immune des articulations', ARRAY['Rheumatoid arthritis', 'RA']),
('Arthrose', 'Rheumatological', 'Rhumatologie', 'mild', 'Dégénérescence articulaire', ARRAY['Osteoarthritis']),
('Goutte', 'Rheumatological', 'Rhumatologie', 'moderate', 'Arthrite par dépôt de cristaux d''urate', ARRAY['Gout']),
('Spondylarthrite ankylosante', 'Rheumatological', 'Rhumatologie', 'moderate', 'Inflammation de la colonne vertébrale', ARRAY['Ankylosing spondylitis']),
('Lupus érythémateux systémique', 'Rheumatological', 'Rhumatologie', 'moderate', 'Maladie auto-immune systémique', ARRAY['SLE', 'Systemic lupus erythematosus']),

-- Dermatologique
('Psoriasis', 'Dermatological', 'Dermatologie', 'moderate', 'Maladie inflammatoire de la peau', ARRAY['Psoriasis vulgaris']),
('Acné', 'Dermatological', 'Dermatologie', 'mild', 'Inflammation des follicules pileux', ARRAY['Acne vulgaris']),
('Rosacée', 'Dermatological', 'Dermatologie', 'mild', 'Dermatose faciale', ARRAY['Rosacea']),

-- Infectieux
('Grippe', 'Infectious', 'Infectiologie', 'mild', 'Infection virale respiratoire', ARRAY['Influenza', 'Flu']),
('COVID-19', 'Infectious', 'Infectiologie', 'moderate', 'Infection par SARS-CoV-2', ARRAY['Coronavirus', 'SARS-CoV-2']),
('Tuberculose', 'Infectious', 'Infectiologie', 'moderate', 'Infection à Mycobacterium tuberculosis', ARRAY['TB', 'Tuberculosis']),
('Hépatite B', 'Infectious', 'Hépatologie', 'moderate', 'Infection virale du foie', ARRAY['HBV', 'Hepatitis B']),
('Hépatite C', 'Infectious', 'Hépatologie', 'moderate', 'Infection virale du foie', ARRAY['HCV', 'Hepatitis C']),
('VIH/SIDA', 'Infectious', 'Infectiologie', 'severe', 'Virus de l''immunodéficience humaine', ARRAY['HIV', 'AIDS']),

-- Oncologie
('Cancer du poumon', 'Oncological', 'Oncologie', 'critical', 'Tumeur maligne pulmonaire', ARRAY['Lung cancer']),
('Cancer du sein', 'Oncological', 'Oncologie', 'moderate', 'Tumeur maligne mammaire', ARRAY['Breast cancer']),
('Cancer colorectal', 'Oncological', 'Oncologie', 'moderate', 'Tumeur maligne du côlon/rectum', ARRAY['Colorectal cancer']),
('Leucémie', 'Oncological', 'Hématologie', 'severe', 'Cancer du sang', ARRAY['Leukemia']),
('Lymphome', 'Oncological', 'Hématologie', 'moderate', 'Cancer du système lymphatique', ARRAY['Lymphoma'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. TRAITEMENTS COURANTS
-- ============================================================================

-- Pour chaque pathologie majeure, ajouter des traitements standards
-- (Cela nécessite les IDs des pathologies, on utilise des sous-requêtes)

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Bronchodilatateurs', id, 'medication', 'Médicaments qui dilatent les bronches'
FROM pathologies WHERE name = 'Asthme'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Corticostéroïdes inhalés', id, 'medication', 'Anti-inflammatoires par inhalation'
FROM pathologies WHERE name = 'Asthme'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Immunothérapie', id, 'therapy', 'Traitement de fond par modification de la réponse immunitaire'
FROM pathologies WHERE name = 'Asthme sévère'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Inhibiteurs de la pompe à protons', id, 'medication', 'Réduction de l''acidité gastrique'
FROM pathologies WHERE name = 'Reflux gastro-oesophagien'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Metformine', id, 'medication', 'Antidiabétique oral de première intention'
FROM pathologies WHERE name = 'Diabète de type 2'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Insulinothérapie', id, 'therapy', 'Administration d''insuline exogène'
FROM pathologies WHERE name = 'Diabète de type 1'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Antihypertenseurs', id, 'medication', 'Médicaments pour réduire la tension artérielle'
FROM pathologies WHERE name = 'Hypertension artérielle'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Antihistaminiques', id, 'medication', 'Médicaments anti-allergiques'
FROM pathologies WHERE name = 'Rhinite allergique'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Triptans', id, 'medication', 'Traitement de la crise migraineuse'
FROM pathologies WHERE name = 'Migraine'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Antidépresseurs ISRS', id, 'medication', 'Inhibiteurs sélectifs de la recapture de la sérotonine'
FROM pathologies WHERE name = 'Dépression majeure'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Méthotrexate', id, 'medication', 'Immunosuppresseur pour les maladies auto-immunes'
FROM pathologies WHERE name = 'Polyarthrite rhumatoïde'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Colchicine', id, 'medication', 'Traitement de la crise de goutte'
FROM pathologies WHERE name = 'Goutte'
ON CONFLICT DO NOTHING;

INSERT INTO treatments (name, pathology_id, type, description)
SELECT 'Allopurinol', id, 'medication', 'Traitement de fond pour réduire l''uricémie'
FROM pathologies WHERE name = 'Goutte'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. STATISTIQUES FINALES
-- ============================================================================

DO $$
DECLARE
    sym_count INTEGER;
    path_count INTEGER;
    treat_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO sym_count FROM symptoms;
    SELECT COUNT(*) INTO path_count FROM pathologies;
    SELECT COUNT(*) INTO treat_count FROM treatments;
    
    RAISE NOTICE '=== Statistiques après import ===';
    RAISE NOTICE 'Symptômes: %', sym_count;
    RAISE NOTICE 'Pathologies: %', path_count;
    RAISE NOTICE 'Traitements: %', treat_count;
END $$;
