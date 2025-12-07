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
          characteristics: string | null
          composition: string | null
          created_at: string | null
          description: string | null
          dispensing_category: string | null
          dosage_forms: string[] | null
          gtin: string | null
          id: string
          indications: string | null
          manufacturer: string | null
          name: string
          pharmacode: string | null
          posology: string | null
          source_url: string | null
          substance: string | null
          swissmedic_name: string | null
          updated_at: string | null
        }
        Insert: {
          atc_code?: string | null
          characteristics?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          dispensing_category?: string | null
          dosage_forms?: string[] | null
          gtin?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          name: string
          pharmacode?: string | null
          posology?: string | null
          source_url?: string | null
          substance?: string | null
          swissmedic_name?: string | null
          updated_at?: string | null
        }
        Update: {
          atc_code?: string | null
          characteristics?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          dispensing_category?: string | null
          dosage_forms?: string[] | null
          gtin?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          name?: string
          pharmacode?: string | null
          posology?: string | null
          source_url?: string | null
          substance?: string | null
          swissmedic_name?: string | null
          updated_at?: string | null
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
