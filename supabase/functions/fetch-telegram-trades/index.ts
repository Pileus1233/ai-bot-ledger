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

// Parse trading messages from Telegram (Swedish Pileus Trading Bot format)
function parseTradingMessage(message: TelegramMessage): Trade | null {
  if (!message.text) return null;
  
  const text = message.text;
  
  // Check if this is a position close message (contains P/L)
  const isCloseMessage = text.includes('POSITION STÄNGD') || text.includes('POSITION CLOSED');
  
  if (!isCloseMessage) {
    // Skip opening trade messages and status updates - we only care about closed positions with P/L
    return null;
  }
  
  let symbol = '';
  let action = '';
  let price = 0;
  let quantity: number | undefined;
  let profit_loss: number | undefined;
  
  // Extract symbol (format: "💰 Symbol: BTC-USDT")
  const symbolMatch = text.match(/Symbol:\s*([A-Z0-9]+-[A-Z]+)/i);
  if (symbolMatch) {
    symbol = symbolMatch[1];
  } else {
    return null;
  }
  
  // Determine action from message type
  if (text.includes('VINST') || text.includes('PROFIT')) {
    action = 'CLOSE_WIN';
  } else if (text.includes('FÖRLUST') || text.includes('LOSS')) {
    action = 'CLOSE_LOSS';
  } else {
    action = 'CLOSE';
  }
  
  // Extract exit price (format: "📈 Utgångspris: $0.673000" or "📉 Utgångspris: $0.673000")
  const exitPriceMatch = text.match(/Utgångspris:\s*\$([0-9]+\.?[0-9]*)/i);
  if (exitPriceMatch) {
    price = parseFloat(exitPriceMatch[1]);
  } else {
    return null;
  }
  
  // Extract entry price for quantity calculation (format: "📉 Ingångspris: $0.800000")
  const entryPriceMatch = text.match(/Ingångspris:\s*\$([0-9]+\.?[0-9]*)/i);
  
  // Extract P/L (format: "📈 PnL: $0.1270" or "📉 PnL: $-0.0117")
  const pnlMatch = text.match(/PnL:\s*\$([+-]?[0-9]+\.?[0-9]*)/i);
  if (pnlMatch) {
    profit_loss = parseFloat(pnlMatch[1]);
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
    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Initialize Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!botToken || !chatId) {
      throw new Error('Missing Telegram credentials');
    }

    console.log('Fetching messages from Telegram...');

    // First, assign any orphaned trades (without user_id) to current user
    const { data: orphanedTrades, error: orphanError } = await supabase
      .from('trades')
      .select('id')
      .is('user_id', null);

    if (orphanedTrades && orphanedTrades.length > 0) {
      console.log(`Found ${orphanedTrades.length} orphaned trades, assigning to user ${user.id}`);
      const { error: updateError } = await supabase
        .from('trades')
        .update({ user_id: user.id })
        .is('user_id', null);
      
      if (updateError) {
        console.error('Error updating orphaned trades:', updateError);
      } else {
        console.log('Successfully assigned orphaned trades to current user');
      }
    }

    // Delete any existing webhook first (required to use getUpdates)
    const deleteWebhookUrl = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    await fetch(deleteWebhookUrl);
    console.log('Webhook deleted (if it existed)');

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

    // Insert trades into database with user_id
    if (trades.length > 0) {
      const tradesWithUser = trades.map(trade => ({
        ...trade,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('trades')
        .insert(tradesWithUser);

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
