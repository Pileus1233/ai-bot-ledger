-- Add unique constraint to telegram_message_id to prevent duplicate trades
-- First remove any existing duplicates
WITH duplicates AS (
  SELECT telegram_message_id, MIN(id) as keep_id
  FROM public.trades 
  WHERE telegram_message_id IS NOT NULL
  GROUP BY telegram_message_id
  HAVING COUNT(*) > 1
)
DELETE FROM public.trades 
WHERE telegram_message_id IN (SELECT telegram_message_id FROM duplicates)
AND id NOT IN (SELECT keep_id FROM duplicates);

-- Add unique constraint on telegram_message_id (only for non-null values)
CREATE UNIQUE INDEX idx_trades_telegram_message_id_unique 
ON public.trades(telegram_message_id) 
WHERE telegram_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_trades_telegram_message_id_unique IS 
'Ensures each Telegram message can only create one trade record';