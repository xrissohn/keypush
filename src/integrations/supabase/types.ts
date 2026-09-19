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
      context_watches: {
        Row: {
          active: boolean
          created_at: string
          id: string
          intent_summary: string
          last_run_at: string | null
          last_status: string | null
          next_run_at: string
          owner_id: string | null
          plan: Json
          plan_engine: string
          raw_query: string
          refresh_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          intent_summary?: string
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          owner_id?: string | null
          plan?: Json
          plan_engine?: string
          raw_query: string
          refresh_minutes?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          intent_summary?: string
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          owner_id?: string | null
          plan?: Json
          plan_engine?: string
          raw_query?: string
          refresh_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          confidence: number
          contradictions: Json
          created_at: string
          dedupe_key: string
          discovered_by: string[]
          evidence: Json
          first_seen_at: string
          id: string
          last_seen_at: string
          match_score: number
          matched_constraints: Json
          missing_constraints: Json
          run_id: string | null
          source_type: string
          source_url: string
          summary: string
          title: string
          updated_at: string
          verified: boolean
          watch_id: string
          why_matched: string
        }
        Insert: {
          confidence?: number
          contradictions?: Json
          created_at?: string
          dedupe_key: string
          discovered_by?: string[]
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          match_score?: number
          matched_constraints?: Json
          missing_constraints?: Json
          run_id?: string | null
          source_type?: string
          source_url: string
          summary?: string
          title: string
          updated_at?: string
          verified?: boolean
          watch_id: string
          why_matched?: string
        }
        Update: {
          confidence?: number
          contradictions?: Json
          created_at?: string
          dedupe_key?: string
          discovered_by?: string[]
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          match_score?: number
          matched_constraints?: Json
          missing_constraints?: Json
          run_id?: string | null
          source_type?: string
          source_url?: string
          summary?: string
          title?: string
          updated_at?: string
          verified?: boolean
          watch_id?: string
          why_matched?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "watch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "context_watches"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          finding_id: string
          id: string
          payload: Json
          sent_at: string | null
          status: string
          watch_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          finding_id: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          watch_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          finding_id?: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "context_watches"
            referencedColumns: ["id"]
          },
        ]
      }
      source_evidence: {
        Row: {
          accessible: boolean
          created_at: string
          engine: string
          finding_id: string
          id: string
          is_x: boolean
          snippet: string
          status_code: number | null
          title: string
          url: string
        }
        Insert: {
          accessible?: boolean
          created_at?: string
          engine: string
          finding_id: string
          id?: string
          is_x?: boolean
          snippet?: string
          status_code?: number | null
          title?: string
          url: string
        }
        Update: {
          accessible?: boolean
          created_at?: string
          engine?: string
          finding_id?: string
          id?: string
          is_x?: boolean
          snippet?: string
          status_code?: number | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_evidence_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_runs: {
        Row: {
          created_at: string
          engines_used: string[]
          error: string | null
          findings_count: number
          finished_at: string | null
          id: string
          started_at: string
          status: string
          step_logs: Json
          trigger: string
          watch_id: string
        }
        Insert: {
          created_at?: string
          engines_used?: string[]
          error?: string | null
          findings_count?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          step_logs?: Json
          trigger?: string
          watch_id: string
        }
        Update: {
          created_at?: string
          engines_used?: string[]
          error?: string | null
          findings_count?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          step_logs?: Json
          trigger?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_runs_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "context_watches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_due_watches: {
        Args: { p_limit?: number }
        Returns: {
          active: boolean
          created_at: string
          id: string
          intent_summary: string
          last_run_at: string | null
          last_status: string | null
          next_run_at: string
          owner_id: string | null
          plan: Json
          plan_engine: string
          raw_query: string
          refresh_minutes: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "context_watches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
