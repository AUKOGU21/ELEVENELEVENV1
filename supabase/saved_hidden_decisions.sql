-- Run this in the Supabase SQL editor to enable save and hide functionality

CREATE TABLE IF NOT EXISTS saved_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  decision_id uuid REFERENCES decisions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, decision_id)
);

CREATE TABLE IF NOT EXISTS hidden_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  decision_id uuid REFERENCES decisions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, decision_id)
);

ALTER TABLE saved_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved decisions"
  ON saved_decisions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own hidden decisions"
  ON hidden_decisions FOR ALL USING (auth.uid() = user_id);
