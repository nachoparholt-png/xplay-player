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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notes: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          note: string
          target_user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          note: string
          target_user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          note?: string
          target_user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      club_memberships: {
        Row: {
          active: boolean | null
          auto_renew: boolean
          club_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          role: string
          status: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          auto_renew?: boolean
          club_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          role: string
          status?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          auto_renew?: boolean
          club_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          role?: string
          status?: string
          tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      club_operating_hours: {
        Row: {
          close_time: string
          club_id: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string
        }
        Insert: {
          close_time?: string
          club_id: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Update: {
          close_time?: string
          club_id?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_operating_hours_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address_line_1: string
          amenities: string | null
          approximate_location: string
          city: string
          club_description: string | null
          club_name: string
          club_status: Database["public"]["Enums"]["club_status"]
          contact_email: string | null
          contact_phone: string | null
          country: string
          created_at: string
          default_advance_days: number | null
          description: string | null
          email: string | null
          id: string
          image_url: string | null
          latitude: number | null
          location: string | null
          logo_url: string | null
          longitude: number | null
          main_court_type: Database["public"]["Enums"]["court_type"]
          notes_for_admin: string | null
          number_of_courts: number
          opening_hours: Json | null
          operating_hours: string | null
          parking_info: string | null
          phone: string | null
          postcode: string
          region: string
          stripe_account_id: string | null
          typical_active_hours: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line_1?: string
          amenities?: string | null
          approximate_location: string
          city?: string
          club_description?: string | null
          club_name: string
          club_status?: Database["public"]["Enums"]["club_status"]
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          default_advance_days?: number | null
          description?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location?: string | null
          logo_url?: string | null
          longitude?: number | null
          main_court_type?: Database["public"]["Enums"]["court_type"]
          notes_for_admin?: string | null
          number_of_courts?: number
          opening_hours?: Json | null
          operating_hours?: string | null
          parking_info?: string | null
          phone?: string | null
          postcode?: string
          region?: string
          stripe_account_id?: string | null
          typical_active_hours?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line_1?: string
          amenities?: string | null
          approximate_location?: string
          city?: string
          club_description?: string | null
          club_name?: string
          club_status?: Database["public"]["Enums"]["club_status"]
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          default_advance_days?: number | null
          description?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          location?: string | null
          logo_url?: string | null
          longitude?: number | null
          main_court_type?: Database["public"]["Enums"]["court_type"]
          notes_for_admin?: string | null
          number_of_courts?: number
          opening_hours?: Json | null
          operating_hours?: string | null
          parking_info?: string | null
          phone?: string | null
          postcode?: string
          region?: string
          stripe_account_id?: string | null
          typical_active_hours?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      coaching_enrollments: {
        Row: {
          amount_paid_cents: number
          coaching_session_id: string
          discount_pct: number
          enrolled_at: string | null
          id: string
          player_id: string
          status: string | null
        }
        Insert: {
          amount_paid_cents?: number
          coaching_session_id: string
          discount_pct?: number
          enrolled_at?: string | null
          id?: string
          player_id: string
          status?: string | null
        }
        Update: {
          amount_paid_cents?: number
          coaching_session_id?: string
          discount_pct?: number
          enrolled_at?: string | null
          id?: string
          player_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_enrollments_coaching_session_id_fkey"
            columns: ["coaching_session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_enrollments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          club_id: string
          coach_id: string
          court_id: string | null
          created_at: string | null
          ends_at: string
          id: string
          max_players: number | null
          notes: string | null
          price_cents: number | null
          session_type: string | null
          starts_at: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          club_id: string
          coach_id: string
          court_id?: string | null
          created_at?: string | null
          ends_at: string
          id?: string
          max_players?: number | null
          notes?: string | null
          price_cents?: number | null
          session_type?: string | null
          starts_at: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          coach_id?: string
          court_id?: string | null
          created_at?: string | null
          ends_at?: string
          id?: string
          max_players?: number | null
          notes?: string | null
          price_cents?: number | null
          session_type?: string | null
          starts_at?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coaching_sessions_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          responded_at: string | null
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          responded_at?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          responded_at?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          title: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      court_bookings: {
        Row: {
          amount_paid_cents: number
          club_id: string
          court_slot_id: string
          created_at: string | null
          discount_pct: number
          id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_paid_cents?: number
          club_id: string
          court_slot_id: string
          created_at?: string | null
          discount_pct?: number
          id?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_paid_cents?: number
          club_id?: string
          court_slot_id?: string
          created_at?: string | null
          discount_pct?: number
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_bookings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_court_slot_id_fkey"
            columns: ["court_slot_id"]
            isOneToOne: false
            referencedRelation: "court_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      court_pricing_windows: {
        Row: {
          active: boolean
          club_id: string
          color: string
          created_at: string | null
          days_of_week: number[]
          end_time: string
          id: string
          name: string
          price_cents: number
          priority: number
          start_time: string
        }
        Insert: {
          active?: boolean
          club_id: string
          color?: string
          created_at?: string | null
          days_of_week?: number[]
          end_time: string
          id?: string
          name: string
          price_cents?: number
          priority?: number
          start_time: string
        }
        Update: {
          active?: boolean
          club_id?: string
          color?: string
          created_at?: string | null
          days_of_week?: number[]
          end_time?: string
          id?: string
          name?: string
          price_cents?: number
          priority?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_pricing_windows_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      court_slots: {
        Row: {
          booked_by: string | null
          coaching_session_id: string | null
          court_id: string
          created_at: string | null
          ends_at: string
          id: string
          match_id: string | null
          notes: string | null
          price_cents: number | null
          starts_at: string
          status: string
          updated_at: string | null
        }
        Insert: {
          booked_by?: string | null
          coaching_session_id?: string | null
          court_id: string
          created_at?: string | null
          ends_at: string
          id?: string
          match_id?: string | null
          notes?: string | null
          price_cents?: number | null
          starts_at: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          booked_by?: string | null
          coaching_session_id?: string | null
          court_id?: string
          created_at?: string | null
          ends_at?: string
          id?: string
          match_id?: string | null
          notes?: string | null
          price_cents?: number | null
          starts_at?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_slots_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "court_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_slots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          active: boolean | null
          club_id: string
          court_type: string | null
          created_at: string | null
          default_price_cents: number
          id: string
          name: string
          nickname: string | null
          slot_duration_minutes: number
          surface: string | null
        }
        Insert: {
          active?: boolean | null
          club_id: string
          court_type?: string | null
          created_at?: string | null
          default_price_cents?: number
          id?: string
          name: string
          nickname?: string | null
          slot_duration_minutes?: number
          surface?: string | null
        }
        Update: {
          active?: boolean | null
          club_id?: string
          court_type?: string | null
          created_at?: string | null
          default_price_cents?: number
          id?: string
          name?: string
          nickname?: string | null
          slot_duration_minutes?: number
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      match_bet_config: {
        Row: {
          close_threshold: number
          created_at: string
          enabled: boolean
          high_pot_boost_pts: number
          high_pot_max_per_match: number
          house_reserve_pts: number
          id: string
          max_exposure_pct: number
          max_payout_pts: number
          max_stake: number
          min_stake: number
          pot_share_pct: number
          risk_threshold: number
          tier_config: Json
          updated_at: string
        }
        Insert: {
          close_threshold?: number
          created_at?: string
          enabled?: boolean
          high_pot_boost_pts?: number
          high_pot_max_per_match?: number
          house_reserve_pts?: number
          id?: string
          max_exposure_pct?: number
          max_payout_pts?: number
          max_stake?: number
          min_stake?: number
          pot_share_pct?: number
          risk_threshold?: number
          tier_config?: Json
          updated_at?: string
        }
        Update: {
          close_threshold?: number
          created_at?: string
          enabled?: boolean
          high_pot_boost_pts?: number
          high_pot_max_per_match?: number
          house_reserve_pts?: number
          id?: string
          max_exposure_pct?: number
          max_payout_pts?: number
          max_stake?: number
          min_stake?: number
          pot_share_pct?: number
          risk_threshold?: number
          tier_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      match_bet_markets: {
        Row: {
          config_snapshot: Json | null
          created_at: string
          factor_locked: boolean
          factor_locked_at: string | null
          high_pot_active: boolean
          high_pot_count: number
          high_pot_pool_pts: number
          house_pnl_pts: number | null
          house_pot_rake_pts: number
          id: string
          match_id: string
          match_ready_notified: boolean
          phase: string
          pot_share_pct: number
          settled_winner: string | null
          status: string
          team_a_elo: number
          team_a_final_multiplier: number | null
          team_a_line_status: string
          team_a_multiplier: number
          team_a_potential_payout: number
          team_a_tier: string
          team_a_total_staked: number
          team_a_true_prob: number
          team_b_elo: number
          team_b_final_multiplier: number | null
          team_b_line_status: string
          team_b_multiplier: number
          team_b_potential_payout: number
          team_b_tier: string
          team_b_total_staked: number
          team_b_true_prob: number
          total_pot: number
          updated_at: string
        }
        Insert: {
          config_snapshot?: Json | null
          created_at?: string
          factor_locked?: boolean
          factor_locked_at?: string | null
          high_pot_active?: boolean
          high_pot_count?: number
          high_pot_pool_pts?: number
          house_pnl_pts?: number | null
          house_pot_rake_pts?: number
          id?: string
          match_id: string
          match_ready_notified?: boolean
          phase?: string
          pot_share_pct?: number
          settled_winner?: string | null
          status?: string
          team_a_elo?: number
          team_a_final_multiplier?: number | null
          team_a_line_status?: string
          team_a_multiplier?: number
          team_a_potential_payout?: number
          team_a_tier?: string
          team_a_total_staked?: number
          team_a_true_prob?: number
          team_b_elo?: number
          team_b_final_multiplier?: number | null
          team_b_line_status?: string
          team_b_multiplier?: number
          team_b_potential_payout?: number
          team_b_tier?: string
          team_b_total_staked?: number
          team_b_true_prob?: number
          total_pot?: number
          updated_at?: string
        }
        Update: {
          config_snapshot?: Json | null
          created_at?: string
          factor_locked?: boolean
          factor_locked_at?: string | null
          high_pot_active?: boolean
          high_pot_count?: number
          high_pot_pool_pts?: number
          house_pnl_pts?: number | null
          house_pot_rake_pts?: number
          id?: string
          match_id?: string
          match_ready_notified?: boolean
          phase?: string
          pot_share_pct?: number
          settled_winner?: string | null
          status?: string
          team_a_elo?: number
          team_a_final_multiplier?: number | null
          team_a_line_status?: string
          team_a_multiplier?: number
          team_a_potential_payout?: number
          team_a_tier?: string
          team_a_total_staked?: number
          team_a_true_prob?: number
          team_b_elo?: number
          team_b_final_multiplier?: number | null
          team_b_line_status?: string
          team_b_multiplier?: number
          team_b_potential_payout?: number
          team_b_tier?: string
          team_b_total_staked?: number
          team_b_true_prob?: number
          total_pot?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_bet_markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_bets: {
        Row: {
          actual_payout_pts: number | null
          factor_payout_pts: number | null
          id: string
          is_player: boolean
          locked_multiplier: number
          market_id: string
          match_id: string
          placed_at: string
          pot_bonus_pts: number | null
          pot_rake_pts: number | null
          potential_payout_pts: number
          settled_at: string | null
          stake_pts: number
          status: string
          team: string
          user_id: string
        }
        Insert: {
          actual_payout_pts?: number | null
          factor_payout_pts?: number | null
          id?: string
          is_player?: boolean
          locked_multiplier: number
          market_id: string
          match_id: string
          placed_at?: string
          pot_bonus_pts?: number | null
          pot_rake_pts?: number | null
          potential_payout_pts: number
          settled_at?: string | null
          stake_pts: number
          status?: string
          team: string
          user_id: string
        }
        Update: {
          actual_payout_pts?: number | null
          factor_payout_pts?: number | null
          id?: string
          is_player?: boolean
          locked_multiplier?: number
          market_id?: string
          match_id?: string
          placed_at?: string
          pot_bonus_pts?: number | null
          pot_rake_pts?: number | null
          potential_payout_pts?: number
          settled_at?: string | null
          stake_pts?: number
          status?: string
          team?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "match_bet_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_bets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_invitations: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invited_user_id: string
          match_id: string
          responded_at: string | null
          slot_index: number
          status: string
          team: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invited_user_id: string
          match_id: string
          responded_at?: string | null
          slot_index?: number
          status?: string
          team: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string
          match_id?: string
          responded_at?: string | null
          slot_index?: number
          status?: string
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_invitations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          id: string
          joined_at: string
          match_id: string
          status: Database["public"]["Enums"]["match_player_status"]
          team: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          match_id: string
          status?: Database["public"]["Enums"]["match_player_status"]
          team?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          match_id?: string
          status?: Database["public"]["Enums"]["match_player_status"]
          team?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_stakes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          payout_multiplier: number
          points_staked: number
          potential_winnings: number
          settled_at: string | null
          status: Database["public"]["Enums"]["stake_status"]
          team: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          payout_multiplier: number
          points_staked: number
          potential_winnings: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["stake_status"]
          team: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          payout_multiplier?: number
          points_staked?: number
          potential_winnings?: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["stake_status"]
          team?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_stakes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_time_history: {
        Row: {
          actual_mins: number
          config_hash: string
          created_at: string
          id: string
          match_id: string | null
          tournament_id: string | null
        }
        Insert: {
          actual_mins: number
          config_hash: string
          created_at?: string
          id?: string
          match_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          actual_mins?: number
          config_hash?: string
          created_at?: string
          id?: string
          match_id?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_time_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          club: string
          court: string | null
          created_at: string
          deadline_at: string | null
          format: Database["public"]["Enums"]["match_format"]
          id: string
          level_max: number
          level_min: number
          match_date: string
          match_time: string
          max_players: number
          notes: string | null
          organizer_id: string
          price_per_player: number | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["match_visibility"]
        }
        Insert: {
          club: string
          court?: string | null
          created_at?: string
          deadline_at?: string | null
          format?: Database["public"]["Enums"]["match_format"]
          id?: string
          level_max?: number
          level_min?: number
          match_date: string
          match_time: string
          max_players?: number
          notes?: string | null
          organizer_id: string
          price_per_player?: number | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["match_visibility"]
        }
        Update: {
          club?: string
          court?: string | null
          created_at?: string
          deadline_at?: string | null
          format?: Database["public"]["Enums"]["match_format"]
          id?: string
          level_max?: number
          level_min?: number
          match_date?: string
          match_time?: string
          max_players?: number
          notes?: string | null
          organizer_id?: string
          price_per_player?: number | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["match_visibility"]
        }
        Relationships: []
      }
      membership_tiers: {
        Row: {
          active: boolean
          advance_booking_days: number
          benefits: Json | null
          billing_period: string
          club_id: string
          coaching_discount: number
          court_discount: number
          created_at: string
          id: string
          max_members: number | null
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          tier_tag: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          advance_booking_days?: number
          benefits?: Json | null
          billing_period?: string
          club_id: string
          coaching_discount?: number
          court_discount?: number
          created_at?: string
          id?: string
          max_members?: number | null
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          tier_tag?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          advance_booking_days?: number
          benefits?: Json | null
          billing_period?: string
          club_id?: string
          coaching_discount?: number
          court_discount?: number
          created_at?: string
          id?: string
          max_members?: number | null
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          tier_tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_tiers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_text: string
          message_type: Database["public"]["Enums"]["message_type"]
          sender_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_text: string
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_text?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          match_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          link?: string | null
          match_id?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          match_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_gbp: number
          created_at: string
          id: string
          package_id: string
          points_granted: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_gbp: number
          created_at?: string
          id?: string
          package_id: string
          points_granted: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_gbp?: number
          created_at?: string
          id?: string
          package_id?: string
          points_granted?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "point_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      point_packages: {
        Row: {
          bonus_points: number
          created_at: string
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          points: number
          price_gbp: number
          sort_order: number
          stripe_price_id: string | null
          total_points: number | null
          updated_at: string
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          points: number
          price_gbp: number
          sort_order?: number
          stripe_price_id?: string | null
          total_points?: number | null
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          points?: number
          price_gbp?: number
          sort_order?: number
          stripe_price_id?: string | null
          total_points?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      points_purchases: {
        Row: {
          bonus_points: number | null
          created_at: string
          id: string
          package_name: string
          payment_status: string
          points_amount: number
          purchase_price: number
          user_id: string
        }
        Insert: {
          bonus_points?: number | null
          created_at?: string
          id?: string
          package_name: string
          payment_status?: string
          points_amount: number
          purchase_price: number
          user_id: string
        }
        Update: {
          bonus_points?: number | null
          created_at?: string
          id?: string
          package_name?: string
          payment_status?: string
          points_amount?: number
          purchase_price?: number
          user_id?: string
        }
        Relationships: []
      }
      points_transactions: {
        Row: {
          admin_user_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          reason: string | null
          related_match_id: string | null
          related_stake_id: string | null
          transaction_type: Database["public"]["Enums"]["points_transaction_type"]
          user_id: string
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          reason?: string | null
          related_match_id?: string | null
          related_stake_id?: string | null
          transaction_type: Database["public"]["Enums"]["points_transaction_type"]
          user_id: string
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          reason?: string | null
          related_match_id?: string | null
          related_stake_id?: string | null
          transaction_type?: Database["public"]["Enums"]["points_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_transactions_related_match_id_fkey"
            columns: ["related_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_transactions_related_stake_id_fkey"
            columns: ["related_stake_id"]
            isOneToOne: false
            referencedRelation: "match_stakes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          cash_price_cents: number
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          point_price: number
          shopify_product_id: string | null
          shopify_variant_id: string | null
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cash_price_cents?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          point_price?: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cash_price_cents?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          point_price?: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          app_role: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          dominant_hand: string | null
          id: string
          initial_level_date: string | null
          initial_level_source: string | null
          last_active_at: string | null
          lifetime_earned: number
          lifetime_spent: number
          location: string | null
          losses: number
          matches_attended: number
          matches_cancelled: number
          onboarding_completed: boolean
          override_reason: string | null
          padel_level: number | null
          padel_park_points: number
          pending_points: number
          phone: string | null
          preferred_club: string | null
          preferred_side: string | null
          rating_matches_counted: number
          recommended_level: number | null
          referral_code: string | null
          reliability_score: number
          total_matches: number
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
          verified_level: number | null
          wins: number
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          app_role?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          dominant_hand?: string | null
          id?: string
          initial_level_date?: string | null
          initial_level_source?: string | null
          last_active_at?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          location?: string | null
          losses?: number
          matches_attended?: number
          matches_cancelled?: number
          onboarding_completed?: boolean
          override_reason?: string | null
          padel_level?: number | null
          padel_park_points?: number
          pending_points?: number
          phone?: string | null
          preferred_club?: string | null
          preferred_side?: string | null
          rating_matches_counted?: number
          recommended_level?: number | null
          referral_code?: string | null
          reliability_score?: number
          total_matches?: number
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
          verified_level?: number | null
          wins?: number
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          app_role?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          dominant_hand?: string | null
          id?: string
          initial_level_date?: string | null
          initial_level_source?: string | null
          last_active_at?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          location?: string | null
          losses?: number
          matches_attended?: number
          matches_cancelled?: number
          onboarding_completed?: boolean
          override_reason?: string | null
          padel_level?: number | null
          padel_park_points?: number
          pending_points?: number
          phone?: string | null
          preferred_club?: string | null
          preferred_side?: string | null
          rating_matches_counted?: number
          recommended_level?: number | null
          referral_code?: string | null
          reliability_score?: number
          total_matches?: number
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_level?: number | null
          wins?: number
        }
        Relationships: []
      }
      quiz_responses: {
        Row: {
          created_at: string
          id: string
          question_id: string
          selected_answer: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          selected_answer: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          selected_answer?: string
          user_id?: string
        }
        Relationships: []
      }
      rating_history: {
        Row: {
          actual_result: number
          created_at: string
          expected_result: number
          id: string
          k_factor: number
          level_change: number
          match_id: string | null
          new_level: number
          old_level: number
          opponent_avg_level: number | null
          provisional: boolean | null
          reliability_after: number
          reliability_before: number
          repeat_match_multiplier: number | null
          team_avg_level: number | null
          user_id: string
        }
        Insert: {
          actual_result: number
          created_at?: string
          expected_result: number
          id?: string
          k_factor: number
          level_change: number
          match_id?: string | null
          new_level: number
          old_level: number
          opponent_avg_level?: number | null
          provisional?: boolean | null
          reliability_after: number
          reliability_before: number
          repeat_match_multiplier?: number | null
          team_avg_level?: number | null
          user_id: string
        }
        Update: {
          actual_result?: number
          created_at?: string
          expected_result?: number
          id?: string
          k_factor?: number
          level_change?: number
          match_id?: string | null
          new_level?: number
          old_level?: number
          opponent_avg_level?: number | null
          provisional?: boolean | null
          reliability_after?: number
          reliability_before?: number
          repeat_match_multiplier?: number | null
          team_avg_level?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      redemption_orders: {
        Row: {
          cash_paid_cents: number
          created_at: string
          id: string
          points_used: number
          product_id: string
          shipping_address: Json | null
          shopify_order_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_paid_cents?: number
          created_at?: string
          id?: string
          points_used?: number
          product_id: string
          shipping_address?: Json | null
          shopify_order_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_paid_cents?: number
          created_at?: string
          id?: string
          points_used?: number
          product_id?: string
          shipping_address?: Json | null
          shopify_order_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemption_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          invited_user_id: string | null
          inviter_user_id: string
          referral_code: string
          referral_status: string
          reward_granted_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_user_id?: string | null
          inviter_user_id: string
          referral_code: string
          referral_status?: string
          reward_granted_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_user_id?: string | null
          inviter_user_id?: string
          referral_code?: string
          referral_status?: string
          reward_granted_at?: string | null
        }
        Relationships: []
      }
      reward_codes: {
        Row: {
          admin_note: string | null
          code_status: string
          expiration_date: string | null
          id: string
          imported_at: string
          linked_store_id: string | null
          priority_order: number | null
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          reward_id: string
          source_reference: string | null
          unique_code: string
        }
        Insert: {
          admin_note?: string | null
          code_status?: string
          expiration_date?: string | null
          id?: string
          imported_at?: string
          linked_store_id?: string | null
          priority_order?: number | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          reward_id: string
          source_reference?: string | null
          unique_code: string
        }
        Update: {
          admin_note?: string | null
          code_status?: string
          expiration_date?: string | null
          id?: string
          imported_at?: string
          linked_store_id?: string | null
          priority_order?: number | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          reward_id?: string
          source_reference?: string | null
          unique_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_codes_linked_store_id_fkey"
            columns: ["linked_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_codes_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          delivered_at: string | null
          delivery_message: string | null
          id: string
          linked_store_id: string | null
          points_spent: number
          redeemed_at: string
          redemption_status: string
          reward_code_id: string | null
          reward_id: string
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          delivery_message?: string | null
          id?: string
          linked_store_id?: string | null
          points_spent: number
          redeemed_at?: string
          redemption_status?: string
          reward_code_id?: string | null
          reward_id: string
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          delivery_message?: string | null
          id?: string
          linked_store_id?: string | null
          points_spent?: number
          redeemed_at?: string
          redemption_status?: string
          reward_code_id?: string | null
          reward_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_linked_store_id_fkey"
            columns: ["linked_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_code_id_fkey"
            columns: ["reward_code_id"]
            isOneToOne: false
            referencedRelation: "reward_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_stock_audit: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by_admin_id: string
          id: string
          new_external_quantity: number | null
          previous_external_quantity: number | null
          reward_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by_admin_id: string
          id?: string
          new_external_quantity?: number | null
          previous_external_quantity?: number | null
          reward_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by_admin_id?: string
          id?: string
          new_external_quantity?: number | null
          previous_external_quantity?: number | null
          reward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_stock_audit_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          admin_notes: string | null
          category: string
          code_required: boolean
          created_at: string
          current_stock: number | null
          external_quantity: number | null
          external_store_name: string | null
          id: string
          linked_store_id: string | null
          low_stock_threshold: number | null
          max_redemptions_per_user: number | null
          points_cost: number
          redemption_instructions: string | null
          reward_description: string | null
          reward_image: string | null
          reward_name: string
          sort_order: number | null
          source_type: string
          status: string
          stock_limit: number | null
          stock_mode: string
          stock_status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          admin_notes?: string | null
          category?: string
          code_required?: boolean
          created_at?: string
          current_stock?: number | null
          external_quantity?: number | null
          external_store_name?: string | null
          id?: string
          linked_store_id?: string | null
          low_stock_threshold?: number | null
          max_redemptions_per_user?: number | null
          points_cost: number
          redemption_instructions?: string | null
          reward_description?: string | null
          reward_image?: string | null
          reward_name: string
          sort_order?: number | null
          source_type?: string
          status?: string
          stock_limit?: number | null
          stock_mode?: string
          stock_status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          code_required?: boolean
          created_at?: string
          current_stock?: number | null
          external_quantity?: number | null
          external_store_name?: string | null
          id?: string
          linked_store_id?: string | null
          low_stock_threshold?: number | null
          max_redemptions_per_user?: number | null
          points_cost?: number
          redemption_instructions?: string | null
          reward_description?: string | null
          reward_image?: string | null
          reward_name?: string
          sort_order?: number | null
          source_type?: string
          status?: string
          stock_limit?: number | null
          stock_mode?: string
          stock_status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rewards_linked_store_id_fkey"
            columns: ["linked_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      score_reviews: {
        Row: {
          action: string
          created_at: string
          id: string
          review_note: string | null
          reviewed_by: string
          submission_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_by: string
          submission_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_by?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "score_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      score_submissions: {
        Row: {
          comment: string | null
          id: string
          match_id: string
          result_type: string
          status: string
          submitted_at: string
          submitted_by: string
          team_a_set_1: number | null
          team_a_set_2: number | null
          team_a_set_3: number | null
          team_b_set_1: number | null
          team_b_set_2: number | null
          team_b_set_3: number | null
        }
        Insert: {
          comment?: string | null
          id?: string
          match_id: string
          result_type?: string
          status?: string
          submitted_at?: string
          submitted_by: string
          team_a_set_1?: number | null
          team_a_set_2?: number | null
          team_a_set_3?: number | null
          team_b_set_1?: number | null
          team_b_set_2?: number | null
          team_b_set_3?: number | null
        }
        Update: {
          comment?: string | null
          id?: string
          match_id?: string
          result_type?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          team_a_set_1?: number | null
          team_a_set_2?: number | null
          team_a_set_3?: number | null
          team_b_set_1?: number | null
          team_b_set_2?: number | null
          team_b_set_3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "score_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          club_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          role: string | null
          shift_end: string
          shift_start: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          role?: string | null
          shift_end: string
          shift_start: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          role?: string | null
          shift_end?: string
          shift_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stores: {
        Row: {
          admin_notes: string | null
          contact_email: string | null
          created_at: string
          id: string
          redemption_instructions: string | null
          store_description: string | null
          store_logo: string | null
          store_name: string
          store_status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          redemption_instructions?: string | null
          store_description?: string | null
          store_logo?: string | null
          store_name: string
          store_status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          redemption_instructions?: string | null
          store_description?: string | null
          store_logo?: string | null
          store_name?: string
          store_status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      tournament_approval_requests: {
        Row: {
          created_at: string
          id: string
          player_rating: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_rating?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_rating?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_approval_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bet_allocations: {
        Row: {
          balance_pts: number | null
          created_at: string
          id: string
          spent_pts: number
          team_id: string
          total_pts: number
          tournament_id: string
          user_id: string
          won_pts: number
        }
        Insert: {
          balance_pts?: number | null
          created_at?: string
          id?: string
          spent_pts?: number
          team_id: string
          total_pts?: number
          tournament_id: string
          user_id: string
          won_pts?: number
        }
        Update: {
          balance_pts?: number | null
          created_at?: string
          id?: string
          spent_pts?: number
          team_id?: string
          total_pts?: number
          tournament_id?: string
          user_id?: string
          won_pts?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bet_allocations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bet_allocations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bet_config: {
        Row: {
          allocation_pts: number
          close_threshold: number
          created_at: string
          house_boost_pts: number
          house_reserve_pts: number
          id: string
          max_payout_pts: number
          max_stake_per_stage: number
          odds_locked: boolean
          organizer_prize_pts: number
          pot_share_pct: number
          risk_threshold: number
          tier_config: Json
          tournament_id: string
          updated_at: string
        }
        Insert: {
          allocation_pts?: number
          close_threshold?: number
          created_at?: string
          house_boost_pts?: number
          house_reserve_pts?: number
          id?: string
          max_payout_pts?: number
          max_stake_per_stage?: number
          odds_locked?: boolean
          organizer_prize_pts?: number
          pot_share_pct?: number
          risk_threshold?: number
          tier_config?: Json
          tournament_id: string
          updated_at?: string
        }
        Update: {
          allocation_pts?: number
          close_threshold?: number
          created_at?: string
          house_boost_pts?: number
          house_reserve_pts?: number
          id?: string
          max_payout_pts?: number
          max_stake_per_stage?: number
          odds_locked?: boolean
          organizer_prize_pts?: number
          pot_share_pct?: number
          risk_threshold?: number
          tier_config?: Json
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bet_config_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bet_odds: {
        Row: {
          computed_at: string
          estimated: boolean
          house_probability: number
          id: string
          is_capped: boolean
          is_offered: boolean
          k_factor: number
          line_status: string
          odds_multiplier: number
          raw_true_probability: number | null
          reliability_factor: number | null
          stage: string
          team_id: string
          tier_label: string
          tournament_id: string
          true_probability: number
          worst_case_payout_pts: number
        }
        Insert: {
          computed_at?: string
          estimated?: boolean
          house_probability: number
          id?: string
          is_capped?: boolean
          is_offered?: boolean
          k_factor: number
          line_status?: string
          odds_multiplier: number
          raw_true_probability?: number | null
          reliability_factor?: number | null
          stage: string
          team_id: string
          tier_label: string
          tournament_id: string
          true_probability: number
          worst_case_payout_pts?: number
        }
        Update: {
          computed_at?: string
          estimated?: boolean
          house_probability?: number
          id?: string
          is_capped?: boolean
          is_offered?: boolean
          k_factor?: number
          line_status?: string
          odds_multiplier?: number
          raw_true_probability?: number | null
          reliability_factor?: number | null
          stage?: string
          team_id?: string
          tier_label?: string
          tournament_id?: string
          true_probability?: number
          worst_case_payout_pts?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bet_odds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bet_odds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bet_windows: {
        Row: {
          closes_at: string | null
          created_at: string
          house_pnl_pts: number | null
          id: string
          opens_at: string | null
          stage: string
          status: string
          total_actual_payout_pts: number
          total_potential_payout_pts: number
          total_staked_pts: number
          tournament_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          house_pnl_pts?: number | null
          id?: string
          opens_at?: string | null
          stage: string
          status?: string
          total_actual_payout_pts?: number
          total_potential_payout_pts?: number
          total_staked_pts?: number
          tournament_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          house_pnl_pts?: number | null
          id?: string
          opens_at?: string | null
          stage?: string
          status?: string
          total_actual_payout_pts?: number
          total_potential_payout_pts?: number
          total_staked_pts?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bet_windows_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bets: {
        Row: {
          actual_payout_pts: number | null
          auto_collected: boolean
          collected_at: string | null
          id: string
          odds_at_placement: number
          odds_multiplier: number
          placed_at: string
          pool_bonus_pts: number | null
          potential_payout_pts: number
          settled_at: string | null
          source_bet_id: string | null
          stage: string
          stake_pts: number
          status: string
          team_id: string
          tournament_id: string
          user_id: string
          window_id: string | null
        }
        Insert: {
          actual_payout_pts?: number | null
          auto_collected?: boolean
          collected_at?: string | null
          id?: string
          odds_at_placement?: number
          odds_multiplier: number
          placed_at?: string
          pool_bonus_pts?: number | null
          potential_payout_pts: number
          settled_at?: string | null
          source_bet_id?: string | null
          stage: string
          stake_pts: number
          status?: string
          team_id: string
          tournament_id: string
          user_id: string
          window_id?: string | null
        }
        Update: {
          actual_payout_pts?: number | null
          auto_collected?: boolean
          collected_at?: string | null
          id?: string
          odds_at_placement?: number
          odds_multiplier?: number
          placed_at?: string
          pool_bonus_pts?: number | null
          potential_payout_pts?: number
          settled_at?: string | null
          source_bet_id?: string | null
          stage?: string
          stake_pts?: number
          status?: string
          team_id?: string
          tournament_id?: string
          user_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bets_source_bet_id_fkey"
            columns: ["source_bet_id"]
            isOneToOne: false
            referencedRelation: "tournament_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bets_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "tournament_bet_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          max_rating: number
          min_rating: number
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          max_rating: number
          min_rating: number
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          max_rating?: number
          min_rating?: number
          sort_order?: number
        }
        Relationships: []
      }
      tournament_invitations: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invited_user_id: string
          responded_at: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invited_user_id: string
          responded_at?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string
          responded_at?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_invitations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          actual_mins: number | null
          completed_at: string | null
          court_label: string | null
          court_number: number | null
          created_at: string
          estimated_mins: number | null
          id: string
          match_config: Json | null
          match_number: number
          phase_id: string | null
          result: Json | null
          round_number: number
          round_type: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          team_a_id: string | null
          team_b_id: string | null
          tournament_id: string
        }
        Insert: {
          actual_mins?: number | null
          completed_at?: string | null
          court_label?: string | null
          court_number?: number | null
          created_at?: string
          estimated_mins?: number | null
          id?: string
          match_config?: Json | null
          match_number?: number
          phase_id?: string | null
          result?: Json | null
          round_number?: number
          round_type?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id: string
        }
        Update: {
          actual_mins?: number | null
          completed_at?: string | null
          court_label?: string | null
          court_number?: number | null
          created_at?: string
          estimated_mins?: number | null
          id?: string
          match_config?: Json | null
          match_number?: number
          phase_id?: string | null
          result?: Json | null
          round_number?: number
          round_type?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "tournament_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_phases: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string
          phase_type: string
          position_x: number
          position_y: number
          sort_order: number
          tournament_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          label?: string
          phase_type?: string
          position_x?: number
          position_y?: number
          sort_order?: number
          tournament_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string
          phase_type?: string
          position_x?: number
          position_y?: number
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_phases_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          id: string
          joined_at: string
          partner_status: string
          partner_user_id: string | null
          role: string
          side_preference: string | null
          slot_index: number | null
          status: Database["public"]["Enums"]["tournament_player_status"]
          team_id: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          partner_status?: string
          partner_user_id?: string | null
          role?: string
          side_preference?: string | null
          slot_index?: number | null
          status?: Database["public"]["Enums"]["tournament_player_status"]
          team_id?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          partner_status?: string
          partner_user_id?: string | null
          role?: string
          side_preference?: string | null
          slot_index?: number | null
          status?: Database["public"]["Enums"]["tournament_player_status"]
          team_id?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_progression_rules: {
        Row: {
          created_at: string
          from_phase_id: string
          from_rank: string
          id: string
          to_phase_id: string
          to_slot: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          from_phase_id: string
          from_rank?: string
          id?: string
          to_phase_id: string
          to_slot?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          from_phase_id?: string
          from_rank?: string
          id?: string
          to_phase_id?: string
          to_slot?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_progression_rules_from_phase_id_fkey"
            columns: ["from_phase_id"]
            isOneToOne: false
            referencedRelation: "tournament_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_progression_rules_to_phase_id_fkey"
            columns: ["to_phase_id"]
            isOneToOne: false
            referencedRelation: "tournament_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_progression_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          player1_id: string
          player1_side: string | null
          player2_id: string | null
          player2_side: string | null
          seed: number | null
          team_name: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          player1_id: string
          player1_side?: string | null
          player2_id?: string | null
          player2_side?: string | null
          seed?: number | null
          team_name?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          player1_id?: string
          player1_side?: string | null
          player2_id?: string | null
          player2_side?: string | null
          seed?: number | null
          team_name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          admin_is_playing: boolean
          bracket_config: Json | null
          canvas_state: Json | null
          club: string | null
          completed_at: string | null
          court_count: number
          court_labels: Json | null
          created_at: string
          created_by: string
          format_type: Database["public"]["Enums"]["tournament_format"]
          id: string
          match_config: Json | null
          name: string
          player_count: number
          rating_exempt: boolean
          require_admin_approval: boolean
          scheduled_date: string | null
          scheduled_time: string | null
          skill_category_id: string | null
          skill_level_max: number | null
          skill_level_min: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          suggestion_used: string | null
          total_time_mins: number | null
          tournament_type: string
          updated_at: string
          visibility: Database["public"]["Enums"]["tournament_visibility"]
        }
        Insert: {
          admin_is_playing?: boolean
          bracket_config?: Json | null
          canvas_state?: Json | null
          club?: string | null
          completed_at?: string | null
          court_count?: number
          court_labels?: Json | null
          created_at?: string
          created_by: string
          format_type?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          match_config?: Json | null
          name: string
          player_count?: number
          rating_exempt?: boolean
          require_admin_approval?: boolean
          scheduled_date?: string | null
          scheduled_time?: string | null
          skill_category_id?: string | null
          skill_level_max?: number | null
          skill_level_min?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          suggestion_used?: string | null
          total_time_mins?: number | null
          tournament_type?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tournament_visibility"]
        }
        Update: {
          admin_is_playing?: boolean
          bracket_config?: Json | null
          canvas_state?: Json | null
          club?: string | null
          completed_at?: string | null
          court_count?: number
          court_labels?: Json | null
          created_at?: string
          created_by?: string
          format_type?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          match_config?: Json | null
          name?: string
          player_count?: number
          rating_exempt?: boolean
          require_admin_approval?: boolean
          scheduled_date?: string | null
          scheduled_time?: string | null
          skill_category_id?: string | null
          skill_level_max?: number | null
          skill_level_min?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          suggestion_used?: string | null
          total_time_mins?: number | null
          tournament_type?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tournament_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_skill_category_id_fkey"
            columns: ["skill_category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      are_contacts: {
        Args: { _user_a: string; _user_b: string }
        Returns: boolean
      }
      create_notification_for_user: {
        Args: {
          _body: string
          _link?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
      credit_points: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      debit_points_safe: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      get_my_managed_club_ids: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_market_totals: {
        Args: {
          p_close_threshold: number
          p_house_reserve: number
          p_market_id: string
          p_payout: number
          p_risk_threshold: number
          p_staked: number
          p_team: string
        }
        Returns: string
      }
      increment_match_pot: {
        Args: { p_market_id: string; p_stake: number; p_team: string }
        Returns: undefined
      }
      increment_points: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_club_admin: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_status:
        | "active"
        | "inactive"
        | "suspended"
        | "blocked"
        | "pending_verification"
      app_role: "admin" | "moderator" | "user"
      club_status: "active" | "inactive"
      conversation_type: "direct" | "match"
      court_type: "indoor" | "outdoor" | "mixed"
      match_format: "social" | "competitive" | "training" | "americana"
      match_player_status: "confirmed" | "waitlist" | "cancelled"
      match_status:
        | "open"
        | "almost_full"
        | "full"
        | "cancelled"
        | "completed"
        | "awaiting_score"
        | "score_submitted"
        | "pending_review"
        | "review_requested"
        | "confirmed"
        | "draw"
        | "closed_as_draw"
        | "auto_closed"
      match_visibility: "public" | "private"
      message_type: "user_message" | "system_message"
      points_transaction_type:
        | "earned"
        | "staked"
        | "won"
        | "lost"
        | "refunded"
        | "manual_adjustment"
        | "admin_correction"
        | "purchase"
      stake_status: "active" | "won" | "lost" | "settled" | "cancelled"
      tournament_format: "groups" | "americano" | "king_of_court"
      tournament_player_status: "confirmed" | "cancelled"
      tournament_status: "draft" | "active" | "completed" | "cancelled"
      tournament_visibility: "public" | "private"
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
      account_status: [
        "active",
        "inactive",
        "suspended",
        "blocked",
        "pending_verification",
      ],
      app_role: ["admin", "moderator", "user"],
      club_status: ["active", "inactive"],
      conversation_type: ["direct", "match"],
      court_type: ["indoor", "outdoor", "mixed"],
      match_format: ["social", "competitive", "training", "americana"],
      match_player_status: ["confirmed", "waitlist", "cancelled"],
      match_status: [
        "open",
        "almost_full",
        "full",
        "cancelled",
        "completed",
        "awaiting_score",
        "score_submitted",
        "pending_review",
        "review_requested",
        "confirmed",
        "draw",
        "closed_as_draw",
        "auto_closed",
      ],
      match_visibility: ["public", "private"],
      message_type: ["user_message", "system_message"],
      points_transaction_type: [
        "earned",
        "staked",
        "won",
        "lost",
        "refunded",
        "manual_adjustment",
        "admin_correction",
        "purchase",
      ],
      stake_status: ["active", "won", "lost", "settled", "cancelled"],
      tournament_format: ["groups", "americano", "king_of_court"],
      tournament_player_status: ["confirmed", "cancelled"],
      tournament_status: ["draft", "active", "completed", "cancelled"],
      tournament_visibility: ["public", "private"],
    },
  },
} as const
