import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramMessage {
  message_id: number;
  text?: string;
  date: number;
}

interface Trade {
  symbol: string;
  action: string;
  price: number;
  quantity?: number;
  profit_loss?: number;
  timestamp: string;
  telegram_message_id: number;
  raw_message: string;
}

// Parse trading messages from Telegram
function parseTradingMessage(message: TelegramMessage): Trade | null {
  if (!message.text) return null;
  
  const text = message.text.toUpperCase();
  
  // Common patterns for trading messages
  // Examples:
  // "BUY BTCUSDT @ 43500"
  // "LONG ETH 2500 QTY: 0.5"
  // "SELL AAPL 150.50 PROFIT: +250"
  // "SHORT BTC 43000"
  // "CLOSE BTCUSDT +500 USDT"
  
  let symbol = '';
  let action = '';
  let price = 0;
  let quantity: number | undefined;
  let profit_loss: number | undefined;
  
  // Extract action
  if (text.includes('BUY')) action = 'BUY';
  else if (text.includes('SELL')) action = 'SELL';
  else if (text.includes('LONG')) action = 'LONG';
  else if (text.includes('SHORT')) action = 'SHORT';
  else if (text.includes('CLOSE')) action = 'CLOSE';
  else return null;
  
  // Extract symbol (common crypto pairs and stocks)
  const symbolRegex = /([A-Z]{2,10}(USDT|USD|BTC|ETH)?|\$[A-Z]+)/g;
  const symbols = text.match(symbolRegex);
  if (symbols && symbols.length > 0) {
    symbol = symbols[0].replace('$', '');
  } else {
    return null;
  }
  
  // Extract price
  const priceRegex = /[@]?\s*([0-9]+\.?[0-9]*)/g;
  const prices = text.match(priceRegex);
  if (prices && prices.length > 0) {
    price = parseFloat(prices[0].replace('@', '').trim());
  } else {
    return null;
  }
  
  // Extract quantity
  const qtyRegex = /QTY:?\s*([0-9]+\.?[0-9]*)/i;
  const qtyMatch = text.match(qtyRegex);
  if (qtyMatch) {
    quantity = parseFloat(qtyMatch[1]);
  }
  
  // Extract profit/loss
  const profitRegex = /(PROFIT|P\/L|PNL):?\s*([+-]?[0-9]+\.?[0-9]*)/i;
  const profitMatch = text.match(profitRegex);
  if (profitMatch) {
    profit_loss = parseFloat(profitMatch[2]);
  }
  
  return {
    symbol,
    action,
    price,
    quantity,
    profit_loss,
    timestamp: new Date(message.date * 1000).toISOString(),
    telegram_message_id: message.message_id,
    raw_message: message.text
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!botToken || !chatId) {
      throw new Error('Missing Telegram credentials');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching messages from Telegram...');

    // Get the latest message ID we've processed
    const { data: latestTrade } = await supabase
      .from('trades')
      .select('telegram_message_id')
      .order('telegram_message_id', { ascending: false })
      .limit(1)
      .single();

    const offset = latestTrade?.telegram_message_id 
      ? latestTrade.telegram_message_id + 1 
      : undefined;

    // Fetch updates from Telegram
    const telegramUrl = `https://api.telegram.org/bot${botToken}/getUpdates?chat_id=${chatId}&limit=100${offset ? `&offset=${offset}` : ''}`;
    
    const response = await fetch(telegramUrl);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    console.log(`Received ${data.result?.length || 0} updates from Telegram`);

    const trades: Trade[] = [];

    // Parse messages for trading data
    for (const update of data.result || []) {
      if (update.message) {
        const trade = parseTradingMessage(update.message);
        if (trade) {
          trades.push(trade);
        }
      }
    }

    console.log(`Parsed ${trades.length} trades from messages`);

    // Insert trades into database
    if (trades.length > 0) {
      const { error: insertError } = await supabase
        .from('trades')
        .insert(trades);

      if (insertError) {
        console.error('Error inserting trades:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        trades_found: trades.length,
        message: `Successfully processed ${trades.length} trades`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
