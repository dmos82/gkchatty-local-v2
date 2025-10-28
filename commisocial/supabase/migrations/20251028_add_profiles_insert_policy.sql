-- Add missing INSERT policy for profiles table
-- This allows authenticated users to create their own profile during signup

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
