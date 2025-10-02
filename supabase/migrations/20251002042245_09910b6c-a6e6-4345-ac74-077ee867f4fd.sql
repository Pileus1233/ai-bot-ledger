-- Add user_id column to trades table to associate trades with users
ALTER TABLE public.trades ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_trades_user_id ON public.trades(user_id);

-- Drop the insecure public policies
DROP POLICY IF EXISTS "Allow public read access to trades" ON public.trades;
DROP POLICY IF EXISTS "Allow insert trades" ON public.trades;

-- Create secure user-specific policies
CREATE POLICY "Users can view their own trades"
ON public.trades
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trades"
ON public.trades
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can insert any trades"
ON public.trades
FOR INSERT
TO service_role
WITH CHECK (true);