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
      appointments: {
        Row: {
          appointment_date: string
          appointment_type: string | null
          company_id: string | null
          created_at: string
          end_time: string
          id: string
          notes: string | null
          patient_id: string
          reminder_sent: boolean | null
          start_time: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_type?: string | null
          company_id?: string | null
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          patient_id: string
          reminder_sent?: boolean | null
          start_time: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_type?: string | null
          company_id?: string | null
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          patient_id?: string
          reminder_sent?: boolean | null
          start_time?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_actions: {
        Row: {
          blue_teeth: number[]
          created_at: string
          examination_id: string
          id: string
          is_sin: boolean | null
          yellow_teeth: number[]
        }
        Insert: {
          blue_teeth?: number[]
          created_at?: string
          examination_id: string
          id?: string
          is_sin?: boolean | null
          yellow_teeth?: number[]
        }
        Update: {
          blue_teeth?: number[]
          created_at?: string
          examination_id?: string
          id?: string
          is_sin?: boolean | null
          yellow_teeth?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "bridge_actions_examination_id_fkey"
            columns: ["examination_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          telephely: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          telephely?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          telephely?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_app_config: {
        Row: {
          company_id: string
          created_at: string | null
          enforce_mandatory_update: boolean
          min_required_version: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          enforce_mandatory_update?: boolean
          min_required_version?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          enforce_mandatory_update?: boolean
          min_required_version?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_app_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnoses: {
        Row: {
          created_at: string
          description: string
          examination_id: string
          id: string
          tooth_number: number | null
        }
        Insert: {
          created_at?: string
          description: string
          examination_id: string
          id?: string
          tooth_number?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          examination_id?: string
          id?: string
          tooth_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_examination_id_fkey"
            columns: ["examination_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
        ]
      }
      examinations: {
        Row: {
          all_on_4_lower: boolean | null
          all_on_4_upper: boolean | null
          allergies: string[] | null
          appliances: boolean | null
          asa_class: number | null
          chief_complaint: string | null
          company_id: string | null
          conditions: string[] | null
          created_at: string
          csak_hid: boolean | null
          diet_frequency: boolean | null
          egybeontott_korona: boolean | null
          fluoride_exposure: boolean | null
          full_lower_prosthesis: boolean | null
          full_upper_prosthesis: boolean | null
          history_notes: string | null
          id: string
          manual_override: boolean | null
          medications: string[] | null
          pain_scale: number | null
          partial_removable_prosthesis: boolean | null
          patient_id: string
          recent_caries: boolean | null
          risk_level: string | null
          risk_rationale: string | null
          saliva_adequacy: boolean | null
          smoker: boolean | null
          updated_at: string
          user_id: string
          visible_plaque: boolean | null
        }
        Insert: {
          all_on_4_lower?: boolean | null
          all_on_4_upper?: boolean | null
          allergies?: string[] | null
          appliances?: boolean | null
          asa_class?: number | null
          chief_complaint?: string | null
          company_id?: string | null
          conditions?: string[] | null
          created_at?: string
          csak_hid?: boolean | null
          diet_frequency?: boolean | null
          egybeontott_korona?: boolean | null
          fluoride_exposure?: boolean | null
          full_lower_prosthesis?: boolean | null
          full_upper_prosthesis?: boolean | null
          history_notes?: string | null
          id?: string
          manual_override?: boolean | null
          medications?: string[] | null
          pain_scale?: number | null
          partial_removable_prosthesis?: boolean | null
          patient_id: string
          recent_caries?: boolean | null
          risk_level?: string | null
          risk_rationale?: string | null
          saliva_adequacy?: boolean | null
          smoker?: boolean | null
          updated_at?: string
          user_id: string
          visible_plaque?: boolean | null
        }
        Update: {
          all_on_4_lower?: boolean | null
          all_on_4_upper?: boolean | null
          allergies?: string[] | null
          appliances?: boolean | null
          asa_class?: number | null
          chief_complaint?: string | null
          company_id?: string | null
          conditions?: string[] | null
          created_at?: string
          csak_hid?: boolean | null
          diet_frequency?: boolean | null
          egybeontott_korona?: boolean | null
          fluoride_exposure?: boolean | null
          full_lower_prosthesis?: boolean | null
          full_upper_prosthesis?: boolean | null
          history_notes?: string | null
          id?: string
          manual_override?: boolean | null
          medications?: string[] | null
          pain_scale?: number | null
          partial_removable_prosthesis?: boolean | null
          patient_id?: string
          recent_caries?: boolean | null
          risk_level?: string | null
          risk_rationale?: string | null
          saliva_adequacy?: boolean | null
          smoker?: boolean | null
          updated_at?: string
          user_id?: string
          visible_plaque?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "examinations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examinations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      feltoltott_pdf: {
        Row: {
          company_id: string | null
          created_at: string
          file_hash_sha256: string | null
          file_name: string
          file_path: string
          file_size: number | null
          fogalom: string | null
          id: string
          telephely_id: string | null
          uploaded_by: string
          webhook_status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          file_hash_sha256?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          fogalom?: string | null
          id?: string
          telephely_id?: string | null
          uploaded_by: string
          webhook_status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          file_hash_sha256?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          fogalom?: string | null
          id?: string
          telephely_id?: string | null
          uploaded_by?: string
          webhook_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feltoltott_pdf_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feltoltott_pdf_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      file_hashes: {
        Row: {
          company_id: string | null
          created_at: string | null
          path: string
          sha256: string
          size: number
          updated_at: string | null
          version: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          path: string
          sha256: string
          size: number
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          path?: string
          sha256?: string
          size?: number
          updated_at?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_hashes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_by: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_by: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_by?: string
          user_id?: string
        }
        Relationships: []
      }
      flexi_auth: {
        Row: {
          created_at: string
          flexi_pw: string | null
          flexi_username: string | null
          id: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flexi_pw?: string | null
          flexi_username?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flexi_pw?: string | null
          flexi_username?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      folder_access: {
        Row: {
          folder_id: string
          granted_at: string | null
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          folder_id: string
          granted_at?: string | null
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          folder_id?: string
          granted_at?: string | null
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_access_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folder_structure"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_structure: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          folder_path: string
          id: string
          is_client_folder: boolean
          parent_path: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          folder_path: string
          id?: string
          is_client_folder?: boolean
          parent_path?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          folder_path?: string
          id?: string
          is_client_folder?: boolean
          parent_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_structure_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invitation_token: string | null
          invited_by_user_id: string
          invited_email: string | null
          invited_user_id: string
          responded_at: string | null
          status: string
          telephely_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invitation_token?: string | null
          invited_by_user_id: string
          invited_email?: string | null
          invited_user_id: string
          responded_at?: string | null
          status?: string
          telephely_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invitation_token?: string | null
          invited_by_user_id?: string
          invited_email?: string | null
          invited_user_id?: string
          responded_at?: string | null
          status?: string
          telephely_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          company_id: string | null
          created_at: string
          date_of_birth: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          date_of_birth: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          date_of_birth?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_extractions: {
        Row: {
          created_at: string | null
          document_id: string
          error_message: string | null
          event_id: string
          finished_at: string | null
          id: string
          items_count: number | null
          raw_json: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          error_message?: string | null
          event_id: string
          finished_at?: string | null
          id?: string
          items_count?: number | null
          raw_json?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          event_id?: string
          finished_at?: string | null
          id?: string
          items_count?: number | null
          raw_json?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "feltoltott_pdf"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_create_users: boolean
          company_id: string | null
          company_name: string | null
          created_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          subscription_amount: number | null
          subscription_end_date: string | null
          subscription_plan: string | null
          subscription_start_date: string | null
          subscription_status: string
          telephely: string | null
          telephely_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          can_create_users?: boolean
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          subscription_amount?: number | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_start_date?: string | null
          subscription_status?: string
          telephely?: string | null
          telephely_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          can_create_users?: boolean
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          subscription_amount?: number | null
          subscription_end_date?: string | null
          subscription_plan?: string | null
          subscription_start_date?: string | null
          subscription_status?: string
          telephely?: string | null
          telephely_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          quantity: number
          scaling: string
          target_tooth_type: string
          unit: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          quantity?: number
          scaling?: string
          target_tooth_type?: string
          unit?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          quantity?: number
          scaling?: string
          target_tooth_type?: string
          unit?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rule_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_visits: {
        Row: {
          created_at: string
          display_order: number
          duration_days: number | null
          healing_months: number | null
          id: string
          rule_id: string
          visit_number: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          healing_months?: number | null
          id?: string
          rule_id: string
          visit_number?: number
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          healing_months?: number | null
          id?: string
          rule_id?: string
          visit_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rule_visits_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "treatment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      szabalyepito_teszt_extractions: {
        Row: {
          company_id: string | null
          created_at: string
          event_id: string
          fogalom: string
          id: string
          kategoria: string | null
          parsed_file_name: string | null
          parsed_json: Json
          source_file_name: string
          telephely_id: string | null
          trigger_words: Json | null
          uploaded_by: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_id: string
          fogalom: string
          id?: string
          kategoria?: string | null
          parsed_file_name?: string | null
          parsed_json: Json
          source_file_name: string
          telephely_id?: string | null
          trigger_words?: Json | null
          uploaded_by: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_id?: string
          fogalom?: string
          id?: string
          kategoria?: string | null
          parsed_file_name?: string | null
          parsed_json?: Json
          source_file_name?: string
          telephely_id?: string | null
          trigger_words?: Json | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "szabalyepito_teszt_extractions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "szabalyepito_teszt_extractions_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      szotar: {
        Row: {
          content: Json
          created_at: string
          created_by: string
          id: string
          telephely_id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by: string
          id?: string
          telephely_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          telephely_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "szotar_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: true
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      szotar_embeddings: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          source_type: string
          szotar_kezeles_id: string
          text_source: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          source_type: string
          szotar_kezeles_id: string
          text_source: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          source_type?: string
          szotar_kezeles_id?: string
          text_source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "szotar_embeddings_szotar_kezeles_id_fkey"
            columns: ["szotar_kezeles_id"]
            isOneToOne: false
            referencedRelation: "szotar_kezelesek"
            referencedColumns: ["id"]
          },
        ]
      }
      szotar_kezelesek: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          telephely_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          telephely_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          telephely_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "szotar_kezelesek_telephely_id_fkey"
            columns: ["telephely_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      teeth: {
        Row: {
          bridge: string
          caries: boolean | null
          caries_locations: string[] | null
          created_at: string
          crown: string
          endo_status: string
          examination_id: string
          fissure_sealing: boolean | null
          id: string
          mobility: number | null
          notes: string | null
          pathology: string
          present: boolean | null
          prosthesis: string
          restoration: string
          restoration_locations: string[] | null
          tooth_number: number
          tooth_type: string
          treatment_plan: string
          updated_at: string
        }
        Insert: {
          bridge?: string
          caries?: boolean | null
          caries_locations?: string[] | null
          created_at?: string
          crown?: string
          endo_status?: string
          examination_id: string
          fissure_sealing?: boolean | null
          id?: string
          mobility?: number | null
          notes?: string | null
          pathology?: string
          present?: boolean | null
          prosthesis?: string
          restoration?: string
          restoration_locations?: string[] | null
          tooth_number: number
          tooth_type?: string
          treatment_plan?: string
          updated_at?: string
        }
        Update: {
          bridge?: string
          caries?: boolean | null
          caries_locations?: string[] | null
          created_at?: string
          crown?: string
          endo_status?: string
          examination_id?: string
          fissure_sealing?: boolean | null
          id?: string
          mobility?: number | null
          notes?: string | null
          pathology?: string
          present?: boolean | null
          prosthesis?: string
          restoration?: string
          restoration_locations?: string[] | null
          tooth_number?: number
          tooth_type?: string
          treatment_plan?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teeth_examination_id_fkey"
            columns: ["examination_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
        ]
      }
      telephely: {
        Row: {
          company_id: string
          created_at: string | null
          flexi_domain: string | null
          id: string
          name: string
          probapaciens_neve: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          flexi_domain?: string | null
          id?: string
          name: string
          probapaciens_neve?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          flexi_domain?: string | null
          id?: string
          name?: string
          probapaciens_neve?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telephely_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_embeddings: {
        Row: {
          created_at: string
          embedding: string
          id: string
          source_type: string
          text_source: string
          treatment_rule_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding: string
          id?: string
          source_type?: string
          text_source: string
          treatment_rule_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string
          id?: string
          source_type?: string
          text_source?: string
          treatment_rule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_embeddings_treatment_rule_id_fkey"
            columns: ["treatment_rule_id"]
            isOneToOne: false
            referencedRelation: "treatment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_items: {
        Row: {
          created_at: string
          display_order: number
          estimated_cost: number | null
          examination_id: string
          id: string
          label: string
          notes: string | null
          priority: string | null
          status: string | null
          tooth_number: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order: number
          estimated_cost?: number | null
          examination_id: string
          id?: string
          label: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          tooth_number?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          estimated_cost?: number | null
          examination_id?: string
          id?: string
          label?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          tooth_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_items_examination_id_fkey"
            columns: ["examination_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_rules: {
        Row: {
          category: string | null
          clinic_id: string
          created_at: string
          id: string
          name: string
          semantic_description: string | null
          trigger_words: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          semantic_description?: string | null
          trigger_words?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          semantic_description?: string | null
          trigger_words?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      treatment_embeddings_stats: {
        Row: {
          clinic_id: string | null
          item_embeddings: number | null
          last_updated: string | null
          rules_with_embeddings: number | null
          semantic_embeddings: number | null
          total_embeddings: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "telephely"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_company_version: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_path: {
        Args: { _path: string; _user_id: string }
        Returns: boolean
      }
      cleanup_orphaned_embeddings: { Args: never; Returns: number }
      get_company_names: {
        Args: never
        Returns: {
          company_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_szotar_embedding: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_source_types?: string[]
          p_telephely_id?: string
          query_embedding: string
        }
        Returns: {
          category: string
          matched_text: string
          name: string
          rule_name: string
          similarity: number
          source_type: string
          szotar_kezeles_id: string
        }[]
      }
      match_treatment_embedding:
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              p_clinic_id?: string
              p_source_types?: string[]
              query_embedding: string
            }
            Returns: {
              matched_text: string
              rule_name: string
              similarity: number
              source_type: string
              treatment_rule_id: string
            }[]
          }
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              p_clinic_id?: string
              query_embedding: string
            }
            Returns: {
              matched_text: string
              rule_name: string
              similarity: number
              source_type: string
              treatment_rule_id: string
            }[]
          }
      subscription_is_active: { Args: { _user_id: string }; Returns: boolean }
      upsert_szotar_embedding: {
        Args: {
          p_embedding: string
          p_source_type: string
          p_szotar_kezeles_id: string
          p_text_source: string
        }
        Returns: string
      }
      upsert_treatment_embedding: {
        Args: {
          p_embedding: string
          p_source_type: string
          p_text_source: string
          p_treatment_rule_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "klinika_admin"
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
      app_role: ["admin", "user", "klinika_admin"],
    },
  },
} as const
