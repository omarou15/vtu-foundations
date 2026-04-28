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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attachment_ai_descriptions: {
        Row: {
          attachment_id: string
          confidence_overall: number | null
          created_at: string
          description: Json
          id: string
          mode: string
          model_version: string
          organization_id: string | null
          provider: string
          user_id: string
          visit_id: string
        }
        Insert: {
          attachment_id: string
          confidence_overall?: number | null
          created_at?: string
          description: Json
          id?: string
          mode?: string
          model_version: string
          organization_id?: string | null
          provider: string
          user_id: string
          visit_id: string
        }
        Update: {
          attachment_id?: string
          confidence_overall?: number | null
          created_at?: string
          description?: Json
          id?: string
          mode?: string
          model_version?: string
          organization_id?: string | null
          provider?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachment_ai_descriptions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          compressed_path: string | null
          created_at: string
          format: string | null
          gps_lat: number | null
          gps_lng: number | null
          height_px: number | null
          id: string
          linked_sections: Json
          media_profile: string | null
          message_id: string
          metadata: Json
          mime_type: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string
          thumbnail_path: string | null
          user_id: string
          visit_id: string
          width_px: number | null
        }
        Insert: {
          bucket: string
          compressed_path?: string | null
          created_at?: string
          format?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          height_px?: number | null
          id?: string
          linked_sections?: Json
          media_profile?: string | null
          message_id: string
          metadata?: Json
          mime_type?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
          thumbnail_path?: string | null
          user_id: string
          visit_id: string
          width_px?: number | null
        }
        Update: {
          bucket?: string
          compressed_path?: string | null
          created_at?: string
          format?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          height_px?: number | null
          id?: string
          linked_sections?: Json
          media_profile?: string | null
          message_id?: string
          metadata?: Json
          mime_type?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
          thumbnail_path?: string | null
          user_id?: string
          visit_id?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_extractions: {
        Row: {
          attachment_id: string | null
          cached_input_tokens: number | null
          confidence_overall: number | null
          context_bundle: Json
          cost_usd: number | null
          created_at: string
          custom_fields_count: number
          error_message: string | null
          id: string
          input_tokens: number | null
          insert_entries_count: number
          latency_ms: number | null
          message_id: string | null
          mode: string
          model_version: string
          organization_id: string | null
          output_tokens: number | null
          patches_count: number
          provider: string
          provider_request_id: string | null
          raw_request_summary: Json
          raw_response: Json
          stable_prompt_hash: string | null
          status: string
          user_id: string
          visit_id: string
          warnings: Json
        }
        Insert: {
          attachment_id?: string | null
          cached_input_tokens?: number | null
          confidence_overall?: number | null
          context_bundle?: Json
          cost_usd?: number | null
          created_at?: string
          custom_fields_count?: number
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          insert_entries_count?: number
          latency_ms?: number | null
          message_id?: string | null
          mode: string
          model_version: string
          organization_id?: string | null
          output_tokens?: number | null
          patches_count?: number
          provider?: string
          provider_request_id?: string | null
          raw_request_summary?: Json
          raw_response?: Json
          stable_prompt_hash?: string | null
          status?: string
          user_id: string
          visit_id: string
          warnings?: Json
        }
        Update: {
          attachment_id?: string | null
          cached_input_tokens?: number | null
          confidence_overall?: number | null
          context_bundle?: Json
          cost_usd?: number | null
          created_at?: string
          custom_fields_count?: number
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          insert_entries_count?: number
          latency_ms?: number | null
          message_id?: string | null
          mode?: string
          model_version?: string
          organization_id?: string | null
          output_tokens?: number | null
          patches_count?: number
          provider?: string
          provider_request_id?: string | null
          raw_request_summary?: Json
          raw_response?: Json
          stable_prompt_hash?: string | null
          status?: string
          user_id?: string
          visit_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "llm_extractions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_system_prompts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          label: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          client_id: string
          content: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          role: string
          user_id: string
          visit_id: string
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          role: string
          user_id: string
          visit_id: string
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          role?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_registry: {
        Row: {
          ai_suggested: boolean
          created_at: string
          description: string | null
          enum_values: Json
          field_key: string
          first_seen_at: string
          id: string
          label_fr: string
          organization_id: string | null
          parent_concept: string | null
          promoted_at: string | null
          registry_urn: string
          section_path: string
          semantic_embedding: Json | null
          status: string
          synonyms: Json
          unit: string | null
          updated_at: string
          usage_count: number
          user_id: string
          value_type: string
        }
        Insert: {
          ai_suggested?: boolean
          created_at?: string
          description?: string | null
          enum_values?: Json
          field_key: string
          first_seen_at?: string
          id?: string
          label_fr: string
          organization_id?: string | null
          parent_concept?: string | null
          promoted_at?: string | null
          registry_urn: string
          section_path: string
          semantic_embedding?: Json | null
          status?: string
          synonyms?: Json
          unit?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
          value_type: string
        }
        Update: {
          ai_suggested?: boolean
          created_at?: string
          description?: string | null
          enum_values?: Json
          field_key?: string
          first_seen_at?: string
          id?: string
          label_fr?: string
          organization_id?: string | null
          parent_concept?: string | null
          promoted_at?: string | null
          registry_urn?: string
          section_path?: string
          semantic_embedding?: Json | null
          status?: string
          synonyms?: Json
          unit?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          value_type?: string
        }
        Relationships: []
      }
      user_llm_keys: {
        Row: {
          created_at: string
          enabled: boolean
          encrypted_key: string
          id: string
          model_id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          encrypted_key: string
          id?: string
          model_id: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          encrypted_key?: string
          id?: string
          model_id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      visit_json_state: {
        Row: {
          created_at: string
          created_by_message_id: string | null
          id: string
          source_extraction_id: string | null
          state: Json
          user_id: string
          version: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by_message_id?: string | null
          id?: string
          source_extraction_id?: string | null
          state: Json
          user_id: string
          version: number
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by_message_id?: string | null
          id?: string
          source_extraction_id?: string | null
          state?: Json
          user_id?: string
          version?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_json_state_created_by_message_id_fkey"
            columns: ["created_by_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_json_state_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          address: string | null
          building_type: string | null
          building_type_other: string | null
          client_id: string
          created_at: string
          gps_accuracy_m: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          mission_type: string | null
          mission_type_other: string | null
          status: string
          tertiaire_subtype: string | null
          tertiaire_subtype_other: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
          visit_started_at: string | null
        }
        Insert: {
          address?: string | null
          building_type?: string | null
          building_type_other?: string | null
          client_id: string
          created_at?: string
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          mission_type?: string | null
          mission_type_other?: string | null
          status?: string
          tertiaire_subtype?: string | null
          tertiaire_subtype_other?: string | null
          title?: string
          updated_at?: string
          user_id: string
          version?: number
          visit_started_at?: string | null
        }
        Update: {
          address?: string | null
          building_type?: string | null
          building_type_other?: string | null
          client_id?: string
          created_at?: string
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          mission_type?: string | null
          mission_type_other?: string | null
          status?: string
          tertiaire_subtype?: string | null
          tertiaire_subtype_other?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
          visit_started_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_similar_schema_fields: {
        Args: { p_query: string; p_section_path: string; p_user_id: string }
        Returns: {
          ai_suggested: boolean
          created_at: string
          description: string | null
          enum_values: Json
          field_key: string
          first_seen_at: string
          id: string
          label_fr: string
          organization_id: string | null
          parent_concept: string | null
          promoted_at: string | null
          registry_urn: string
          section_path: string
          semantic_embedding: Json | null
          status: string
          synonyms: Json
          unit: string | null
          updated_at: string
          usage_count: number
          user_id: string
          value_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "schema_registry"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_registry_usage: {
        Args: { p_registry_id: string }
        Returns: {
          ai_suggested: boolean
          created_at: string
          description: string | null
          enum_values: Json
          field_key: string
          first_seen_at: string
          id: string
          label_fr: string
          organization_id: string | null
          parent_concept: string | null
          promoted_at: string | null
          registry_urn: string
          section_path: string
          semantic_embedding: Json | null
          status: string
          synonyms: Json
          unit: string | null
          updated_at: string
          usage_count: number
          user_id: string
          value_type: string
        }
        SetofOptions: {
          from: "*"
          to: "schema_registry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
