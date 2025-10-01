import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramMessage {
  message_id: number;
  text?: string;
  date: number;
}

interface TelegramResponse {
  ok: boolean;
  result: TelegramMessage[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!botToken || !chatId) {
      throw new Error('Telegram credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent messages from Telegram
    const telegramUrl = `https://api.telegram.org/bot${botToken}/getUpdates?chat_id=${chatId}&limit=100`;
    const telegramResponse = await fetch(telegramUrl);
    const data: TelegramResponse = await telegramResponse.json();

    console.log('Fetched messages:', data.result?.length || 0);

    if (!data.ok || !data.result) {
      throw new Error('Failed to fetch Telegram messages');
    }

    const trades = [];
    
    // Parse messages for trading data
    for (const update of data.result) {
      const message = update.message_id;
      const text = update.text || '';
      const timestamp = new Date(update.date * 1000);

      // Parse trading signals (examples of patterns to match)
      // Adjust these patterns based on your actual message format
      const buyPattern = /(?:BUY|LONG)\s+(\w+)(?:\s+@\s*)?(\d+\.?\d*)/i;
      const sellPattern = /(?:SELL|SHORT)\s+(\w+)(?:\s+@\s*)?(\d+\.?\d*)/i;
      const closePattern = /CLOSE\s+(\w+)(?:\s+@\s*)?(\d+\.?\d*)(?:\s+(?:P\/L|PL|Profit):\s*([+-]?\d+\.?\d*))?/i;

      let match;
      
      if ((match = text.match(buyPattern))) {
        trades.push({
          symbol: match[1],
          action: 'BUY',
          price: parseFloat(match[2]),
          telegram_message_id: message,
          raw_message: text,
          timestamp,
        });
      } else if ((match = text.match(sellPattern))) {
        trades.push({
          symbol: match[1],
          action: 'SELL',
          price: parseFloat(match[2]),
          telegram_message_id: message,
          raw_message: text,
          timestamp,
        });
      } else if ((match = text.match(closePattern))) {
        trades.push({
          symbol: match[1],
          action: 'CLOSE',
          price: parseFloat(match[2]),
          profit_loss: match[3] ? parseFloat(match[3]) : null,
          telegram_message_id: message,
          raw_message: text,
          timestamp,
        });
      }
    }

    console.log('Parsed trades:', trades.length);

    // Insert new trades (avoiding duplicates)
    if (trades.length > 0) {
      for (const trade of trades) {
        const { data: existing } = await supabase
          .from('trades')
          .select('id')
          .eq('telegram_message_id', trade.telegram_message_id)
          .single();

        if (!existing) {
          await supabase.from('trades').insert(trade);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, tradesFound: trades.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});