-- ============================================================================
-- Script pour ajouter l'utilisateur admin
-- MediMind Nexus
-- ============================================================================

-- Supprimer l'entrée existante si elle existe
DELETE FROM user_roles WHERE user_id = '3df94b2d-55f5-4fae-a32c-b4d0a27de36f';
DELETE FROM profiles WHERE user_id = '3df94b2d-55f5-4fae-a32c-b4d0a27de36f';

-- Ajouter le rôle admin à l'utilisateur
INSERT INTO user_roles (user_id, role)
VALUES ('3df94b2d-55f5-4fae-a32c-b4d0a27de36f', 'admin');

-- Créer le profil
INSERT INTO profiles (user_id, first_name, last_name, specialty, institution)
VALUES (
  '3df94b2d-55f5-4fae-a32c-b4d0a27de36f',
  'Admin',
  'MediMind',
  'Administration',
  'MediMind Nexus'
);

-- Vérification
SELECT 
  ur.user_id,
  ur.role,
  p.first_name,
  p.last_name
FROM user_roles ur
LEFT JOIN profiles p ON ur.user_id = p.user_id
WHERE ur.user_id = '3df94b2d-55f5-4fae-a32c-b4d0a27de36f';
