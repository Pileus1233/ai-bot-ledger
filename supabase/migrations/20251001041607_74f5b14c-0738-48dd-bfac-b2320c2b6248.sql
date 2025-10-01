-- Create trades table to store trading performance data
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'LONG', 'SHORT', 'CLOSE')),
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8),
  profit_loss DECIMAL(20, 8),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  telegram_message_id BIGINT,
  raw_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (since this is a personal dashboard)
CREATE POLICY "Allow public read access to trades"
ON public.trades
FOR SELECT
USING (true);

-- Create policy to allow insert (for the edge function)
CREATE POLICY "Allow insert trades"
ON public.trades
FOR INSERT
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_trades_timestamp ON public.trades(timestamp DESC);
CREATE INDEX idx_trades_symbol ON public.trades(symbol);

-- Enable realtime for the trades table
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;