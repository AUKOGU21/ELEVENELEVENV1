import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: ProfileInsert; Update: Partial<ProfileInsert> }
      decisions: { Row: Decision; Insert: DecisionInsert; Update: Partial<DecisionInsert> }
      responses: { Row: Response; Insert: ResponseInsert; Update: Partial<ResponseInsert> }
      response_votes: { Row: ResponseVote; Insert: ResponseVoteInsert; Update: Partial<ResponseVoteInsert> }
      outcomes: { Row: Outcome; Insert: OutcomeInsert; Update: Partial<OutcomeInsert> }
      notifications: { Row: Notification; Insert: NotificationInsert; Update: Partial<NotificationInsert> }
    }
  }
}

// --- Types ---

export interface Profile {
  id: string
  created_at: string
  updated_at: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  onboarding_completed: boolean

  // Body
  height_range: string | null
  body_type: string | null

  // Sizing
  top_size: string | null
  bottom_size: string | null

  // Fit
  fit_preference: string | null
  silhouette_preference: string[] | null
  fit_details: Record<string, string> | null

  // Style
  style_aesthetics: string[] | null

  // Behavior
  risk_tolerance: string | null
  purchase_frequency: string | null
}

export interface ProfileInsert {
  id: string
  display_name?: string
  avatar_url?: string
  email?: string
  onboarding_completed?: boolean
  height_range?: string
  body_type?: string
  top_size?: string
  bottom_size?: string
  fit_preference?: string
  silhouette_preference?: string[]
  fit_details?: Record<string, string>
  style_aesthetics?: string[]
  risk_tolerance?: string
  purchase_frequency?: string
}

export interface Decision {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  user_id: string
  product_url: string | null
  product_image_url: string | null
  product_name: string | null
  brand_name: string | null
  product_category: string | null
  product_price: number | null
  confidence_score: number
  uncertainty_text: string | null
  wear_context: string | null
  size_considering: string | null
  status: 'open' | 'decided' | 'purchased' | 'outcome_logged'
  is_public: boolean
  response_count: number
  profiles?: Profile
}

export interface DecisionInsert {
  user_id: string
  product_url?: string
  product_image_url?: string
  product_name?: string
  brand_name?: string
  product_category?: string
  product_price?: number
  confidence_score: number
  uncertainty_text?: string
  wear_context?: string
  size_considering?: string
  status?: 'open' | 'decided' | 'purchased' | 'outcome_logged'
  is_public?: boolean
}

export interface Response {
  id: string
  created_at: string
  decision_id: string
  user_id: string
  recommendation: 'buy' | 'do_not_buy' | 'need_more_info'
  reasoning: string
  personal_experience: string | null
  suggested_size: string | null
  match_score: number | null
  match_breakdown: Record<string, number> | null
  helpfulness_votes: number
  profiles?: Profile
}

export interface ResponseInsert {
  decision_id: string
  user_id: string
  recommendation: 'buy' | 'do_not_buy' | 'need_more_info'
  reasoning: string
  personal_experience?: string
  suggested_size?: string
}

export interface ResponseVote {
  id: string
  created_at: string
  response_id: string
  voter_id: string
  vote_type: 'helpful' | 'not_helpful'
}

export interface ResponseVoteInsert {
  response_id: string
  voter_id: string
  vote_type: 'helpful' | 'not_helpful'
}

export interface Outcome {
  id: string
  created_at: string
  decision_id: string
  user_id: string
  did_purchase: boolean
  purchase_size: string | null
  fit_result: 'perfect' | 'slightly_small' | 'too_small' | 'slightly_large' | 'too_large' | null
  kept_or_returned: 'kept' | 'returned' | 'exchanged' | 'planning_to_return' | null
  satisfaction_score: number | null
  outcome_notes: string | null
  peer_input_helped: boolean | null
  confidence_before: number | null
  confidence_after: number | null
}

export interface OutcomeInsert {
  decision_id: string
  user_id: string
  did_purchase: boolean
  purchase_size?: string
  fit_result?: 'perfect' | 'slightly_small' | 'too_small' | 'slightly_large' | 'too_large'
  kept_or_returned?: 'kept' | 'returned' | 'exchanged' | 'planning_to_return'
  satisfaction_score?: number
  outcome_notes?: string
  peer_input_helped?: boolean
  confidence_before?: number
  confidence_after?: number
}

export interface Notification {
  id: string
  created_at: string
  read_at: string | null
  user_id: string
  type: 'new_response' | 'helpful_vote' | 'outcome_reminder' | 'welcome'
  decision_id: string | null
  response_id: string | null
  data: Record<string, unknown> | null
  email_sent: boolean
}

export interface NotificationInsert {
  user_id: string
  type: 'new_response' | 'helpful_vote' | 'outcome_reminder' | 'welcome'
  decision_id?: string
  response_id?: string
  data?: Record<string, unknown>
}
