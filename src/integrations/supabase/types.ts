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
      app_settings: {
        Row: {
          bath_unit_price: number
          created_at: string
          dashboard_section_order: string[]
          nav_menu_hidden: string[]
          nav_menu_order: string[]
          ocr_enabled: boolean
          season_id: string
        }
        Insert: {
          bath_unit_price?: number
          created_at?: string
          dashboard_section_order?: string[]
          nav_menu_hidden?: string[]
          nav_menu_order?: string[]
          ocr_enabled?: boolean
          season_id: string
        }
        Update: {
          bath_unit_price?: number
          created_at?: string
          dashboard_section_order?: string[]
          nav_menu_hidden?: string[]
          nav_menu_order?: string[]
          ocr_enabled?: boolean
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_config: {
        Row: {
          admin_password_hash: string
          id: number
          staff_password_hash: string | null
          updated_at: string
          user_password_hash: string
        }
        Insert: {
          admin_password_hash: string
          id?: number
          staff_password_hash?: string | null
          updated_at?: string
          user_password_hash: string
        }
        Update: {
          admin_password_hash?: string
          id?: number
          staff_password_hash?: string | null
          updated_at?: string
          user_password_hash?: string
        }
        Relationships: []
      }
      bath_coupons: {
        Row: {
          amount: number
          cash_at: string | null
          created_at: string
          id: string
          name: string
          paid_cash: boolean
          paid_transfer: boolean
          qty: number
          season_id: string
          transfer_at: string | null
          weekday: string | null
        }
        Insert: {
          amount?: number
          cash_at?: string | null
          created_at?: string
          id?: string
          name: string
          paid_cash?: boolean
          paid_transfer?: boolean
          qty?: number
          season_id: string
          transfer_at?: string | null
          weekday?: string | null
        }
        Update: {
          amount?: number
          cash_at?: string | null
          created_at?: string
          id?: string
          name?: string
          paid_cash?: boolean
          paid_transfer?: boolean
          qty?: number
          season_id?: string
          transfer_at?: string | null
          weekday?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bath_coupons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      church_payments: {
        Row: {
          amount: number
          cash_at: string | null
          church_id: string
          created_at: string
          id: string
          paid_cash: boolean
          paid_transfer: boolean
          season_id: string
          transfer_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cash_at?: string | null
          church_id: string
          created_at?: string
          id?: string
          paid_cash?: boolean
          paid_transfer?: boolean
          season_id: string
          transfer_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cash_at?: string | null
          church_id?: string
          created_at?: string
          id?: string
          paid_cash?: boolean
          paid_transfer?: boolean
          season_id?: string
          transfer_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_payments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          actual_count: number | null
          checked_in_at: string | null
          contact_name: string | null
          created_at: string
          denomination: string | null
          id: string
          is_checked_in: boolean
          memo: string | null
          name: string
          phone: string | null
          season_id: string
          source: string
        }
        Insert: {
          actual_count?: number | null
          checked_in_at?: string | null
          contact_name?: string | null
          created_at?: string
          denomination?: string | null
          id?: string
          is_checked_in?: boolean
          memo?: string | null
          name: string
          phone?: string | null
          season_id: string
          source?: string
        }
        Update: {
          actual_count?: number | null
          checked_in_at?: string | null
          contact_name?: string | null
          created_at?: string
          denomination?: string | null
          id?: string
          is_checked_in?: boolean
          memo?: string | null
          name?: string
          phone?: string | null
          season_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "churches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_dismissals: {
        Row: {
          church_a_id: string
          church_b_id: string
          created_at: string
          id: string
          note: string | null
          season_id: string
        }
        Insert: {
          church_a_id: string
          church_b_id: string
          created_at?: string
          id?: string
          note?: string | null
          season_id: string
        }
        Update: {
          church_a_id?: string
          church_b_id?: string
          created_at?: string
          id?: string
          note?: string | null
          season_id?: string
        }
        Relationships: []
      }
      lodgings: {
        Row: {
          active: boolean
          building: string
          capacity: number
          created_at: string
          floor: string | null
          gender: string | null
          id: string
          name: string
          note: string | null
          season_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          building: string
          capacity?: number
          created_at?: string
          floor?: string | null
          gender?: string | null
          id?: string
          name: string
          note?: string | null
          season_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          building?: string
          capacity?: number
          created_at?: string
          floor?: string | null
          gender?: string | null
          id?: string
          name?: string
          note?: string | null
          season_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lodgings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_config: {
        Row: {
          api_key: string | null
          backup_api_key: string | null
          base_url: string | null
          id: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          backup_api_key?: string | null
          base_url?: string | null
          id: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          backup_api_key?: string | null
          base_url?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          age_group: string
          church_id: string
          created_at: string
          gender: string
          id: string
          lodging: boolean
          lodging_id: string | null
          name: string
          note: string | null
        }
        Insert: {
          age_group: string
          church_id: string
          created_at?: string
          gender: string
          id?: string
          lodging?: boolean
          lodging_id?: string | null
          name: string
          note?: string | null
        }
        Update: {
          age_group?: string
          church_id?: string
          created_at?: string
          gender?: string
          id?: string
          lodging?: boolean
          lodging_id?: string | null
          name?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_lodging_id_fkey"
            columns: ["lodging_id"]
            isOneToOne: false
            referencedRelation: "lodgings"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          purpose: string | null
          season_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          purpose?: string | null
          season_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          purpose?: string | null
          season_id?: string
        }
        Relationships: []
      }
      receipt_layout: {
        Row: {
          id: number
          layout: Json
          updated_at: string
        }
        Insert: {
          id?: number
          layout?: Json
          updated_at?: string
        }
        Update: {
          id?: number
          layout?: Json
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_passwords: {
        Args: {
          current_admin: string
          new_admin: string
          new_staff: string
          new_user: string
        }
        Returns: undefined
      }
      ocr_backup_key_update: {
        Args: { current_admin: string; new_key: string }
        Returns: Json
      }
      ocr_config_update: {
        Args: {
          current_admin: string
          new_api_key: string
          new_base_url: string
        }
        Returns: Json
      }
      ocr_status: { Args: never; Returns: Json }
      verify_password: { Args: { p: string }; Returns: string }
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
    Enums: {},
  },
} as const
