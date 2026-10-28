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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attempts: {
        Row: {
          assignment_id: string | null
          context_fingerprint: string
          duration_sec: number | null
          id: string
          key_version_id: string
          marking_policy_id: string
          marks_thirds: number
          question_id: string
          request_hash: string
          response: Json | null
          solution_id: string | null
          status: string
          submission_id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          context_fingerprint: string
          duration_sec?: number | null
          id?: string
          key_version_id: string
          marking_policy_id: string
          marks_thirds: number
          question_id: string
          request_hash: string
          response?: Json | null
          solution_id?: string | null
          status: string
          submission_id: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          context_fingerprint?: string
          duration_sec?: number | null
          id?: string
          key_version_id?: string
          marking_policy_id?: string
          marks_thirds?: number
          question_id?: string
          request_hash?: string
          response?: Json | null
          solution_id?: string | null
          status?: string
          submission_id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_assignment_item_fk"
            columns: ["assignment_id", "question_id"]
            isOneToOne: false
            referencedRelation: "daily_assignment_items"
            referencedColumns: ["assignment_id", "question_id"]
          },
          {
            foreignKeyName: "attempts_assignment_owner_fk"
            columns: ["assignment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_assignments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "attempts_marking_policy_id_fkey"
            columns: ["marking_policy_id"]
            isOneToOne: false
            referencedRelation: "marking_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_assignment_items: {
        Row: {
          assignment_id: string
          position: number
          question_id: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          position: number
          question_id: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          position?: number
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_assignment_items_assignment_id_user_id_fkey"
            columns: ["assignment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_assignments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_assignment_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_assignments: {
        Row: {
          generated_at: string
          generator_version: string
          id: string
          reset_time: string
          study_day: string
          timezone: string
          user_id: string
        }
        Insert: {
          generated_at?: string
          generator_version: string
          id?: string
          reset_time: string
          study_day: string
          timezone: string
          user_id: string
        }
        Update: {
          generated_at?: string
          generator_version?: string
          id?: string
          reset_time?: string
          study_day?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      marking_policies: {
        Row: {
          exam_year: number
          id: string
          mcq_penalty_thirds_1: number
          mcq_penalty_thirds_2: number
          msq_negative: boolean
          nat_negative: boolean
          partial_credit: boolean
          source_url: string | null
          verified: boolean
          verified_on: string | null
        }
        Insert: {
          exam_year: number
          id: string
          mcq_penalty_thirds_1: number
          mcq_penalty_thirds_2: number
          msq_negative?: boolean
          nat_negative?: boolean
          partial_credit?: boolean
          source_url?: string | null
          verified?: boolean
          verified_on?: string | null
        }
        Update: {
          exam_year?: number
          id?: string
          mcq_penalty_thirds_1?: number
          mcq_penalty_thirds_2?: number
          msq_negative?: boolean
          nat_negative?: boolean
          partial_credit?: boolean
          source_url?: string | null
          verified?: boolean
          verified_on?: string | null
        }
        Relationships: []
      }
      papers: {
        Row: {
          deduplicated: boolean
          exam_year: number
          id: string
          marking_policy_id: string | null
          session_label: string
          status: string
        }
        Insert: {
          deduplicated?: boolean
          exam_year: number
          id?: string
          marking_policy_id?: string | null
          session_label?: string
          status?: string
        }
        Update: {
          deduplicated?: boolean
          exam_year?: number
          id?: string
          marking_policy_id?: string | null
          session_label?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "papers_marking_policy_id_exam_year_fkey"
            columns: ["marking_policy_id", "exam_year"]
            isOneToOne: false
            referencedRelation: "marking_policies"
            referencedColumns: ["id", "exam_year"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      question_options: {
        Row: {
          body_md: string
          option_id: string
          question_id: string
        }
        Insert: {
          body_md: string
          option_id: string
          question_id: string
        }
        Update: {
          body_md?: string
          option_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          body_md: string
          created_at: string
          id: string
          marks: number
          number: number
          paper_id: string
          topic_id: string | null
          type: string
          updated_at: string
          validated_at: string | null
          validation_state: string
        }
        Insert: {
          body_md: string
          created_at?: string
          id?: string
          marks: number
          number: number
          paper_id: string
          topic_id?: string | null
          type: string
          updated_at?: string
          validated_at?: string | null
          validation_state?: string
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          marks?: number
          number?: number
          paper_id?: string
          topic_id?: string | null
          type?: string
          updated_at?: string
          validated_at?: string | null
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "syllabus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_items: {
        Row: {
          due_at: string
          ease: number
          id: string
          interval_days: number
          kind: string
          question_id: string
          reviews: number
          user_id: string
        }
        Insert: {
          due_at: string
          ease?: number
          id?: string
          interval_days?: number
          kind: string
          question_id: string
          reviews?: number
          user_id: string
        }
        Update: {
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          kind?: string
          question_id?: string
          reviews?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_topics: {
        Row: {
          code: string
          id: string
          name: string
          parent_id: string | null
          syllabus_version: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          parent_id?: string | null
          syllabus_version: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          parent_id?: string | null
          syllabus_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "syllabus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          daily_minutes: number | null
          reset_time: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_minutes?: number | null
          reset_time?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_minutes?: number | null
          reset_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      pilot_import: { Args: { p_payload: Json }; Returns: Json }
      practice_lookup_submission: {
        Args: {
          p_request_hash: string
          p_submission_id: string
          p_user_id: string
        }
        Returns: Json
      }
      practice_question_revision: {
        Args: { p_question_id: string }
        Returns: string
      }
      practice_question_view: { Args: { p_question_id: string }; Returns: Json }
      practice_record_attempt: {
        Args: {
          p_assignment_id: string
          p_context_fingerprint: string
          p_duration_sec: number
          p_key_version_id: string
          p_marks_thirds: number
          p_policy_id: string
          p_question_id: string
          p_request_hash: string
          p_response: Json
          p_status: string
          p_submission_id: string
          p_user_id: string
        }
        Returns: Json
      }
      practice_scoring_context: {
        Args: { p_question_id: string }
        Returns: Json
      }
      practice_source: { Args: { p_question_id: string }; Returns: Json }
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
