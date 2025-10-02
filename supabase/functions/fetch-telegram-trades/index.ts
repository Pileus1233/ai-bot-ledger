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
  
  // Debug: Log all messages to see what patterns we're missing
  if (text.length > 10) {
    console.log('Parsing message:', text.substring(0, 200));
  }
  
  // Check if this is a position close message (contains P/L) - Support more Swedish patterns
  const isCloseMessage = text.includes('POSITION STÄNGD') || 
                        text.includes('POSITION CLOSED') ||
                        text.includes('STÄNGD POSITION') ||
                        text.includes('AVSLUTAD POSITION') ||
                        text.includes('PnL:') ||
                        text.includes('Vinst:') ||
                        text.includes('Förlust:') ||
                        text.includes('vinst') ||
                        text.includes('förlust') ||
                        text.includes('resultat') ||
                        text.includes('profit') ||
                        text.includes('loss') ||
                        text.includes('📈') ||  // Chart up emoji
                        text.includes('📉');   // Chart down emoji
  
  if (!isCloseMessage) {
    // Skip opening trade messages and status updates - we only care about closed positions with P/L
    console.log('Message rejected - not a close message:', text.substring(0, 100));
    return null;
  } else {
    console.log('Message identified as close message:', text.substring(0, 100));
  }
  
  let symbol = '';
  let action = '';
  let price = 0;
  let quantity: number | undefined;
  let profit_loss: number | undefined;
  
  // Extract symbol - Support multiple Swedish and English formats
  const symbolPatterns = [
    /Symbol:\s*([A-Z0-9]+-[A-Z]+)/i,
    /Valuta:\s*([A-Z0-9]+-[A-Z]+)/i,
    /Par:\s*([A-Z0-9]+-[A-Z]+)/i,
    /💰\s*([A-Z0-9]+-[A-Z]+)/i,
    /([A-Z]{3,4}-[A-Z]{3,4})/i  // Direct pattern like BTC-USDT
  ];
  
  for (const pattern of symbolPatterns) {
    const match = text.match(pattern);
    if (match) {
      symbol = match[1];
      break;
    }
  }
  
  if (!symbol) {
    console.log('No symbol found in message:', text.substring(0, 100));
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
  
  // Extract P/L - Support multiple Swedish and English formats
  const pnlPatterns = [
    /PnL:\s*\$([+-]?[0-9]+\.?[0-9]*)/i,
    /Vinst:\s*\$?([+-]?[0-9]+\.?[0-9]*)/i,
    /Förlust:\s*\$?([+-]?[0-9]+\.?[0-9]*)/i,
    /Resultat:\s*\$?([+-]?[0-9]+\.?[0-9]*)/i,
    /📈.*?\$([+-]?[0-9]+\.?[0-9]*)/i,
    /📉.*?\$([+-]?[0-9]+\.?[0-9]*)/i
  ];
  
  for (const pattern of pnlPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = parseFloat(match[1]);
      // If it was a loss pattern and value is positive, make it negative
      if (pattern.source.includes('Förlust') && value > 0) {
        value = -value;
      }
      profit_loss = value;
      break;
    }
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

    // Check if we should fetch historical data (when no trades exist)
    const { count: existingTradesCount } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const shouldFetchHistorical = !existingTradesCount || existingTradesCount === 0;
    
    let allTrades: Trade[] = [];
    
    if (shouldFetchHistorical) {
      console.log('No existing trades found, fetching historical messages...');
      
      // For historical data, we need to fetch in batches without offset
      // This will get the most recent 100 messages
      const telegramUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`;
      const response = await fetch(telegramUrl);
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description}`);
      }
      
      console.log(`Received ${data.result?.length || 0} historical updates from Telegram`);
      
      // Debug: Log first few messages to see what we're getting
      if (data.result && data.result.length > 0) {
        console.log('Sample messages received:');
        for (let i = 0; i < Math.min(3, data.result.length); i++) {
          const update = data.result[i];
          if (update.message) {
            console.log(`Message ${i + 1}:`, {
              chat_id: update.message.chat?.id,
              expected_chat_id: chatId,
              text_preview: update.message.text?.substring(0, 100),
              date: update.message.date
            });
          }
        }
      }
      
      // Parse all messages for trading data
      let messagesChecked = 0;
      let messagesFromCorrectChat = 0;
      for (const update of data.result || []) {
        if (update.message) {
          messagesChecked++;
          if (update.message.chat && update.message.chat.id.toString() === chatId) {
            messagesFromCorrectChat++;
            const trade = parseTradingMessage(update.message);
            if (trade) {
              allTrades.push(trade);
            }
          }
        }
      }
      
      console.log(`Debug: Checked ${messagesChecked} messages, ${messagesFromCorrectChat} from correct chat, ${allTrades.length} trades parsed`);
    } else {
      // Get the latest message ID we've processed
      const { data: latestTrade } = await supabase
        .from('trades')
        .select('telegram_message_id')
        .eq('user_id', user.id)
        .order('telegram_message_id', { ascending: false })
        .limit(1)
        .single();

      const offset = latestTrade?.telegram_message_id 
        ? latestTrade.telegram_message_id + 1 
        : undefined;

      // Fetch only new updates from Telegram
      const telegramUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=100${offset ? `&offset=${offset}` : ''}`;
      
      const response = await fetch(telegramUrl);
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description}`);
      }
      
      console.log(`Received ${data.result?.length || 0} new updates from Telegram`);
      
      // Parse messages for trading data
      for (const update of data.result || []) {
        if (update.message && update.message.chat && update.message.chat.id.toString() === chatId) {
          const trade = parseTradingMessage(update.message);
          if (trade) {
            allTrades.push(trade);
          }
        }
      }
    }

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    console.log(`Parsed ${allTrades.length} trades from messages`);

    // Remove duplicates based on telegram_message_id
    const uniqueTrades = allTrades.filter((trade, index, self) => 
      index === self.findIndex(t => t.telegram_message_id === trade.telegram_message_id)
    );

    console.log(`Found ${uniqueTrades.length} unique trades after deduplication`);

    // Insert trades into database with user_id
    if (uniqueTrades.length > 0) {
      const tradesWithUser = uniqueTrades.map(trade => ({
        ...trade,
        user_id: user.id
      }));

      // Use upsert to avoid duplicate entries
      const { error: insertError } = await supabase
        .from('trades')
        .upsert(tradesWithUser, {
          onConflict: 'telegram_message_id',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error('Error inserting trades:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        trades_found: uniqueTrades.length,
        message: shouldFetchHistorical 
          ? `Successfully imported ${uniqueTrades.length} historical trades`
          : `Successfully processed ${uniqueTrades.length} new trades`
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
