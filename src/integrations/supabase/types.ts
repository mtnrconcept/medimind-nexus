export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cde_nodes: {
        Row: {
          id: string
          node_type: string
          external_id: string | null
          name: string
          properties: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          node_type: string
          external_id?: string | null
          name: string
          properties?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          node_type?: string
          external_id?: string | null
          name?: string
          properties?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cde_edges: {
        Row: {
          id: string
          source_node_id: string
          target_node_id: string
          relationship_type: string
          provenance: string
          evidence_level: string | null
          confidence_score: number | null
          context: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          source_node_id: string
          target_node_id: string
          relationship_type: string
          provenance?: string
          evidence_level?: string | null
          confidence_score?: number | null
          context?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          source_node_id?: string
          target_node_id?: string
          relationship_type?: string
          provenance?: string
          evidence_level?: string | null
          confidence_score?: string | null
          context?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cde_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "cde_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cde_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "cde_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_cards: {
        Row: {
          id: string
          title: string
          hypothesis: string
          reasoning_chain: Json
          involved_nodes: string[] | null
          novelty: string | null
          evidence_level: string | null
          severity_score: number | null
          plausibility_score: number | null
          frequency_score: number | null
          status: string
          sources: Json
          recommended_actions: string[] | null
          created_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          title: string
          hypothesis: string
          reasoning_chain?: Json
          involved_nodes?: string[] | null
          novelty?: string | null
          evidence_level?: string | null
          severity_score?: number | null
          plausibility_score?: number | null
          frequency_score?: number | null
          status?: string
          sources?: Json
          recommended_actions?: string[] | null
          created_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          title?: string
          hypothesis?: string
          reasoning_chain?: Json
          involved_nodes?: string[] | null
          novelty?: string | null
          evidence_level?: string | null
          severity_score?: number | null
          plausibility_score?: number | null
          frequency_score?: number | null
          status?: string
          sources?: Json
          recommended_actions?: string[] | null
          created_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_cards_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contraindications: {
        Row: {
          condition: string
          created_at: string | null
          description: string | null
          id: string
          medication_id: string | null
          severity: string | null
        }
        Insert: {
          condition: string
          created_at?: string | null
          description?: string | null
          id?: string
          medication_id?: string | null
          severity?: string | null
        }
        Update: {
          condition?: string
          created_at?: string | null
          description?: string | null
          id?: string
          medication_id?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contraindications_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_interactions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          interacting_drug: string
          interaction_type: string | null
          medication_id: string | null
          recommendation: string | null
          severity: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          interacting_drug: string
          interaction_type?: string | null
          medication_id?: string | null
          recommendation?: string | null
          severity?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          interacting_drug?: string
          interaction_type?: string | null
          medication_id?: string | null
          recommendation?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drug_interactions_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_sources: {
        Row: {
          created_at: string
          id: string
          pathology_id: string
          published_date: string | null
          pubmed_id: string | null
          source_type: string | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pathology_id: string
          published_date?: string | null
          pubmed_id?: string | null
          source_type?: string | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pathology_id?: string
          published_date?: string | null
          pubmed_id?: string | null
          source_type?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_sources_pathology_id_fkey"
            columns: ["pathology_id"]
            isOneToOne: false
            referencedRelation: "pathologies"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          atc_code: string | null
          authorization_status: string | null
          authorization_type: string | null
          characteristics: string | null
          composition: string | null
          created_at: string | null
          description: string | null
          dispensing_category: string | null
          dosage_forms: string[] | null
          first_authorization_date: string | null
          genetically_produced: boolean | null
          gtin: string | null
          id: string
          indications: string | null
          manufacturer: string | null
          medication_category: string | null
          name: string
          narcotic_category: string | null
          pharmacode: string | null
          posology: string | null
          source_url: string | null
          substance: string | null
          swissmedic_name: string | null
          swissmedic_number: string | null
          updated_at: string | null
          validity_duration: string | null
        }
        Insert: {
          atc_code?: string | null
          authorization_status?: string | null
          authorization_type?: string | null
          characteristics?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          dispensing_category?: string | null
          dosage_forms?: string[] | null
          first_authorization_date?: string | null
          genetically_produced?: boolean | null
          gtin?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          medication_category?: string | null
          name: string
          narcotic_category?: string | null
          pharmacode?: string | null
          posology?: string | null
          source_url?: string | null
          substance?: string | null
          swissmedic_name?: string | null
          swissmedic_number?: string | null
          updated_at?: string | null
          validity_duration?: string | null
        }
        Update: {
          atc_code?: string | null
          authorization_status?: string | null
          authorization_type?: string | null
          characteristics?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          dispensing_category?: string | null
          dosage_forms?: string[] | null
          first_authorization_date?: string | null
          genetically_produced?: boolean | null
          gtin?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          medication_category?: string | null
          name?: string
          narcotic_category?: string | null
          pharmacode?: string | null
          posology?: string | null
          source_url?: string | null
          substance?: string | null
          swissmedic_name?: string | null
          swissmedic_number?: string | null
          updated_at?: string | null
          validity_duration?: string | null
        }
        Relationships: []
      }
      pathologies: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icd_code: string | null
          id: string
          name: string
          severity: string | null
          specialty: string | null
          synonyms: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icd_code?: string | null
          id?: string
          name: string
          severity?: string | null
          specialty?: string | null
          synonyms?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icd_code?: string | null
          id?: string
          name?: string
          severity?: string | null
          specialty?: string | null
          synonyms?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      pathology_symptoms: {
        Row: {
          frequency_percent: number | null
          id: string
          is_primary: boolean | null
          pathology_id: string
          symptom_id: string
        }
        Insert: {
          frequency_percent?: number | null
          id?: string
          is_primary?: boolean | null
          pathology_id: string
          symptom_id: string
        }
        Update: {
          frequency_percent?: number | null
          id?: string
          is_primary?: boolean | null
          pathology_id?: string
          symptom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathology_symptoms_pathology_id_fkey"
            columns: ["pathology_id"]
            isOneToOne: false
            referencedRelation: "pathologies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathology_symptoms_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          age: number
          city: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          gender: string
          height_cm: number | null
          id: string
          lab_results_json: Json | null
          last_name: string | null
          medical_notes_nlp: string | null
          nationality: string
          outcome: string | null
          pathology_id: string | null
          patient_id: string
          phone: string | null
          postal_code: string | null
          treatment: string | null
          updated_at: string | null
          weight_kg: number | null
        }
        Insert: {
          address?: string | null
          age: number
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender: string
          height_cm?: number | null
          id?: string
          lab_results_json?: Json | null
          last_name?: string | null
          medical_notes_nlp?: string | null
          nationality: string
          outcome?: string | null
          pathology_id?: string | null
          patient_id: string
          phone?: string | null
          postal_code?: string | null
          treatment?: string | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Update: {
          address?: string | null
          age?: number
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string
          height_cm?: number | null
          id?: string
          lab_results_json?: Json | null
          last_name?: string | null
          medical_notes_nlp?: string | null
          nationality?: string
          outcome?: string | null
          pathology_id?: string | null
          patient_id?: string
          phone?: string | null
          postal_code?: string | null
          treatment?: string | null
          updated_at?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_pathology_id_fkey"
            columns: ["pathology_id"]
            isOneToOne: false
            referencedRelation: "pathologies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          institution: string | null
          last_name: string | null
          specialty: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          institution?: string | null
          last_name?: string | null
          specialty?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          institution?: string | null
          last_name?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      side_effects: {
        Row: {
          body_system: string | null
          created_at: string | null
          description: string | null
          frequency: string | null
          id: string
          medication_id: string | null
          name: string
          severity: string | null
        }
        Insert: {
          body_system?: string | null
          created_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          medication_id?: string | null
          name: string
          severity?: string | null
        }
        Update: {
          body_system?: string | null
          created_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          medication_id?: string | null
          name?: string
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "side_effects_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      symptoms: {
        Row: {
          body_system: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          body_system?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          body_system?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      patient_documents: {
        Row: {
          id: string
          patient_id: string
          file_name: string
          file_type: string
          file_path: string
          file_size: number
          category: Database["public"]["Enums"]["document_category"]
          extracted_data: Json | null
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          extraction_error: string | null
          analyzed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          file_name: string
          file_type: string
          file_path: string
          file_size: number
          category?: Database["public"]["Enums"]["document_category"]
          extracted_data?: Json | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          extraction_error?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          file_name?: string
          file_type?: string
          file_path?: string
          file_size?: number
          category?: Database["public"]["Enums"]["document_category"]
          extracted_data?: Json | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          extraction_error?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          contraindications: string[] | null
          created_at: string
          description: string | null
          id: string
          name: string
          pathology_id: string
          type: string | null
        }
        Insert: {
          contraindications?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          pathology_id: string
          type?: string | null
        }
        Update: {
          contraindications?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          pathology_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_pathology_id_fkey"
            columns: ["pathology_id"]
            isOneToOne: false
            referencedRelation: "pathologies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      patient_medications: {
        Row: {
          id: string
          patient_id: string
          medication_id: string
          dosage: string | null
          frequency: string | null
          start_date: string | null
          end_date: string | null
          is_active: boolean
          prescribed_by: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          medication_id: string
          dosage?: string | null
          frequency?: string | null
          start_date?: string | null
          end_date?: string | null
          is_active?: boolean
          prescribed_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          medication_id?: string
          dosage?: string | null
          frequency?: string | null
          start_date?: string | null
          end_date?: string | null
          is_active?: boolean
          prescribed_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medications_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_pathologies: {
        Row: {
          id: string
          patient_id: string
          pathology_id: string
          diagnosis_date: string | null
          status: string
          diagnosed_by: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          pathology_id: string
          diagnosis_date?: string | null
          status?: string
          diagnosed_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          pathology_id?: string
          diagnosis_date?: string | null
          status?: string
          diagnosed_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_pathologies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_pathologies_pathology_id_fkey"
            columns: ["pathology_id"]
            isOneToOne: false
            referencedRelation: "pathologies"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          id: string
          patient_id: string
          allergen: string
          allergen_type: string | null
          severity: string | null
          reaction: string | null
          first_reaction_date: string | null
          verified: boolean
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          allergen: string
          allergen_type?: string | null
          severity?: string | null
          reaction?: string | null
          first_reaction_date?: string | null
          verified?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          allergen?: string
          allergen_type?: string | null
          severity?: string | null
          reaction?: string | null
          first_reaction_date?: string | null
          verified?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_vaccinations: {
        Row: {
          id: string
          patient_id: string
          vaccine_name: string
          vaccine_type: string | null
          vaccination_date: string
          booster_date: string | null
          lot_number: string | null
          administered_by: string | null
          site: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          vaccine_name: string
          vaccine_type?: string | null
          vaccination_date: string
          booster_date?: string | null
          lot_number?: string | null
          administered_by?: string | null
          site?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          vaccine_name?: string
          vaccine_type?: string | null
          vaccination_date?: string
          booster_date?: string | null
          lot_number?: string | null
          administered_by?: string | null
          site?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_vaccinations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_symptoms: {
        Row: {
          id: string
          patient_id: string
          symptom_id: string | null
          symptom_name: string
          severity: string | null
          onset_date: string | null
          frequency: string | null
          is_active: boolean
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          symptom_id?: string | null
          symptom_name: string
          severity?: string | null
          onset_date?: string | null
          frequency?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          symptom_id?: string | null
          symptom_name?: string
          severity?: string | null
          onset_date?: string | null
          frequency?: string | null
          is_active?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_symptoms_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_symptoms_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_administrative: {
        Row: {
          id: string
          patient_id: string
          birth_name: string | null
          birth_place: string | null
          biological_sex: string | null
          gender_identity: string | null
          social_security_number: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          marital_status: string | null
          household_composition: string | null
          number_of_children: number
          profession: string | null
          professional_status: string | null
          employer: string | null
          insurance_provider: string | null
          insurance_policy_number: string | null
          complementary_insurance: string | null
          primary_physician_name: string | null
          primary_physician_phone: string | null
          specialists_followed: Json
          advance_directives: boolean
          advance_directives_date: string | null
          organ_donor: boolean | null
          trusted_person_name: string | null
          trusted_person_phone: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          birth_name?: string | null
          birth_place?: string | null
          biological_sex?: string | null
          gender_identity?: string | null
          social_security_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          marital_status?: string | null
          household_composition?: string | null
          number_of_children?: number
          profession?: string | null
          professional_status?: string | null
          employer?: string | null
          insurance_provider?: string | null
          insurance_policy_number?: string | null
          complementary_insurance?: string | null
          primary_physician_name?: string | null
          primary_physician_phone?: string | null
          specialists_followed?: Json
          advance_directives?: boolean
          advance_directives_date?: string | null
          organ_donor?: boolean | null
          trusted_person_name?: string | null
          trusted_person_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          birth_name?: string | null
          birth_place?: string | null
          biological_sex?: string | null
          gender_identity?: string | null
          social_security_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          marital_status?: string | null
          household_composition?: string | null
          number_of_children?: number
          profession?: string | null
          professional_status?: string | null
          employer?: string | null
          insurance_provider?: string | null
          insurance_policy_number?: string | null
          complementary_insurance?: string | null
          primary_physician_name?: string | null
          primary_physician_phone?: string | null
          specialists_followed?: Json
          advance_directives?: boolean
          advance_directives_date?: string | null
          organ_donor?: boolean | null
          trusted_person_name?: string | null
          trusted_person_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_administrative_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          id: string
          patient_id: string
          category: string
          title: string
          description: string | null
          start_date: string | null
          end_date: string | null
          is_ongoing: boolean
          severity: string | null
          treating_facility: string | null
          treating_physician: string | null
          complications: string | null
          icd_code: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          category: string
          title: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          is_ongoing?: boolean
          severity?: string | null
          treating_facility?: string | null
          treating_physician?: string | null
          complications?: string | null
          icd_code?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          category?: string
          title?: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          is_ongoing?: boolean
          severity?: string | null
          treating_facility?: string | null
          treating_physician?: string | null
          complications?: string | null
          icd_code?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_family_history: {
        Row: {
          id: string
          patient_id: string
          relationship: string
          condition: string
          age_at_diagnosis: number | null
          age_at_death: number | null
          cause_of_death: string | null
          is_hereditary: boolean
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          relationship: string
          condition: string
          age_at_diagnosis?: number | null
          age_at_death?: number | null
          cause_of_death?: string | null
          is_hereditary?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          relationship?: string
          condition?: string
          age_at_diagnosis?: number | null
          age_at_death?: number | null
          cause_of_death?: string | null
          is_hereditary?: boolean
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_family_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_lifestyle: {
        Row: {
          id: string
          patient_id: string
          smoking_status: string | null
          cigarettes_per_day: number | null
          smoking_years: number | null
          quit_date: string | null
          pack_years: number | null
          alcohol_status: string | null
          drinks_per_week: number | null
          alcohol_type: string | null
          substance_use: Json
          physical_activity_level: string | null
          exercise_type: string | null
          exercise_frequency: string | null
          exercise_duration_minutes: number | null
          diet_type: string | null
          dietary_restrictions: string[] | null
          meals_per_day: number | null
          water_intake_liters: number | null
          sleep_hours_average: number | null
          sleep_quality: string | null
          sleep_disorders: string[] | null
          occupational_hazards: string[] | null
          protective_equipment_used: boolean | null
          recent_travel: Json
          tropical_disease_exposure: boolean
          last_updated_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          smoking_status?: string | null
          cigarettes_per_day?: number | null
          smoking_years?: number | null
          quit_date?: string | null
          pack_years?: number | null
          alcohol_status?: string | null
          drinks_per_week?: number | null
          alcohol_type?: string | null
          substance_use?: Json
          physical_activity_level?: string | null
          exercise_type?: string | null
          exercise_frequency?: string | null
          exercise_duration_minutes?: number | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          meals_per_day?: number | null
          water_intake_liters?: number | null
          sleep_hours_average?: number | null
          sleep_quality?: string | null
          sleep_disorders?: string[] | null
          occupational_hazards?: string[] | null
          protective_equipment_used?: boolean | null
          recent_travel?: Json
          tropical_disease_exposure?: boolean
          last_updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          smoking_status?: string | null
          cigarettes_per_day?: number | null
          smoking_years?: number | null
          quit_date?: string | null
          pack_years?: number | null
          alcohol_status?: string | null
          drinks_per_week?: number | null
          alcohol_type?: string | null
          substance_use?: Json
          physical_activity_level?: string | null
          exercise_type?: string | null
          exercise_frequency?: string | null
          exercise_duration_minutes?: number | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          meals_per_day?: number | null
          water_intake_liters?: number | null
          sleep_hours_average?: number | null
          sleep_quality?: string | null
          sleep_disorders?: string[] | null
          occupational_hazards?: string[] | null
          protective_equipment_used?: boolean | null
          recent_travel?: Json
          tropical_disease_exposure?: boolean
          last_updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_lifestyle_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_clinical_data: {
        Row: {
          id: string
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          systolic_bp: number | null
          diastolic_bp: number | null
          heart_rate: number | null
          respiratory_rate: number | null
          temperature: number | null
          oxygen_saturation: number | null
          weight_kg: number | null
          height_cm: number | null
          bmi: number | null
          waist_circumference_cm: number | null
          pain_level: number | null
          pain_location: string | null
          pain_type: string | null
          functional_capacity: string | null
          mobility_status: string | null
          activities_of_daily_living: Json | null
          nutritional_status: string | null
          appetite: string | null
          general_appearance: string | null
          physical_exam_findings: Json | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          systolic_bp?: number | null
          diastolic_bp?: number | null
          heart_rate?: number | null
          respiratory_rate?: number | null
          temperature?: number | null
          oxygen_saturation?: number | null
          weight_kg?: number | null
          height_cm?: number | null
          bmi?: number | null
          waist_circumference_cm?: number | null
          pain_level?: number | null
          pain_location?: string | null
          pain_type?: string | null
          functional_capacity?: string | null
          mobility_status?: string | null
          activities_of_daily_living?: Json | null
          nutritional_status?: string | null
          appetite?: string | null
          general_appearance?: string | null
          physical_exam_findings?: Json | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          systolic_bp?: number | null
          diastolic_bp?: number | null
          heart_rate?: number | null
          respiratory_rate?: number | null
          temperature?: number | null
          oxygen_saturation?: number | null
          weight_kg?: number | null
          height_cm?: number | null
          bmi?: number | null
          waist_circumference_cm?: number | null
          pain_level?: number | null
          pain_location?: string | null
          pain_type?: string | null
          functional_capacity?: string | null
          mobility_status?: string | null
          activities_of_daily_living?: Json | null
          nutritional_status?: string | null
          appetite?: string | null
          general_appearance?: string | null
          physical_exam_findings?: Json | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_clinical_data_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_lab_results: {
        Row: {
          id: string
          patient_id: string
          test_date: string
          test_category: string
          test_name: string
          value: number | null
          unit: string | null
          reference_min: number | null
          reference_max: number | null
          is_abnormal: boolean
          interpretation: string | null
          laboratory: string | null
          ordering_physician: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          test_date: string
          test_category: string
          test_name: string
          value?: number | null
          unit?: string | null
          reference_min?: number | null
          reference_max?: number | null
          is_abnormal?: boolean
          interpretation?: string | null
          laboratory?: string | null
          ordering_physician?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          test_date?: string
          test_category?: string
          test_name?: string
          value?: number | null
          unit?: string | null
          reference_min?: number | null
          reference_max?: number | null
          is_abnormal?: boolean
          interpretation?: string | null
          laboratory?: string | null
          ordering_physician?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_imaging: {
        Row: {
          id: string
          patient_id: string
          exam_date: string
          imaging_type: string
          body_region: string
          indication: string | null
          findings: string | null
          conclusion: string | null
          radiologist: string | null
          facility: string | null
          contrast_used: boolean
          document_id: string | null
          images_stored: Json
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          exam_date: string
          imaging_type: string
          body_region: string
          indication?: string | null
          findings?: string | null
          conclusion?: string | null
          radiologist?: string | null
          facility?: string | null
          contrast_used?: boolean
          document_id?: string | null
          images_stored?: Json
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          exam_date?: string
          imaging_type?: string
          body_region?: string
          indication?: string | null
          findings?: string | null
          conclusion?: string | null
          radiologist?: string | null
          facility?: string | null
          contrast_used?: boolean
          document_id?: string | null
          images_stored?: Json
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_imaging_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_prevention: {
        Row: {
          id: string
          patient_id: string
          screening_type: string
          last_screening_date: string | null
          next_due_date: string | null
          result: string | null
          result_status: string | null
          follow_up_needed: boolean
          follow_up_notes: string | null
          performing_facility: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          screening_type: string
          last_screening_date?: string | null
          next_due_date?: string | null
          result?: string | null
          result_status?: string | null
          follow_up_needed?: boolean
          follow_up_notes?: string | null
          performing_facility?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          screening_type?: string
          last_screening_date?: string | null
          next_due_date?: string | null
          result?: string | null
          result_status?: string | null
          follow_up_needed?: boolean
          follow_up_notes?: string | null
          performing_facility?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_prevention_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "researcher" | "doctor"
      document_category: "ordonnance" | "compte_rendu" | "imagerie" | "analyse_biologique" | "certificat" | "autre"
      extraction_status: "pending" | "processing" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "researcher", "doctor"],
    },
  },
} as const
