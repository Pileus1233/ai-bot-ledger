import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    console.log('Environment check:');
    console.log('Bot token exists:', !!botToken);
    console.log('Chat ID exists:', !!chatId);
    console.log('Chat ID value:', chatId);

    if (!botToken || !chatId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing Telegram credentials',
          bot_token_exists: !!botToken,
          chat_id_exists: !!chatId,
          chat_id_value: chatId
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Test basic bot info
    console.log('Testing bot info...');
    const botInfoUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const botInfoResponse = await fetch(botInfoUrl);
    const botInfo = await botInfoResponse.json();
    
    console.log('Bot info response:', botInfo);

    // Test getting updates (without chat filter first)
    console.log('Testing getUpdates...');
    const updatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=5`;
    const updatesResponse = await fetch(updatesUrl);
    const updatesData = await updatesResponse.json();
    
    console.log('Updates response ok:', updatesData.ok);
    console.log('Updates count:', updatesData.result?.length || 0);

    // Log sample update structure
    if (updatesData.result && updatesData.result.length > 0) {
      const sampleUpdate = updatesData.result[0];
      console.log('Sample update structure:', {
        update_id: sampleUpdate.update_id,
        message_exists: !!sampleUpdate.message,
        chat_id: sampleUpdate.message?.chat?.id,
        chat_type: sampleUpdate.message?.chat?.type,
        has_text: !!sampleUpdate.message?.text,
        text_preview: sampleUpdate.message?.text?.substring(0, 50)
      });
    }

    // Test with chat filter
    console.log('Testing with chat filter...');
    const filteredUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=10`;
    const filteredResponse = await fetch(filteredUrl);
    const filteredData = await filteredResponse.json();
    
    let messagesFromTargetChat = 0;
    let sampleMessagesFromTargetChat = [];
    
    if (filteredData.result) {
      for (const update of filteredData.result) {
        if (update.message && update.message.chat && update.message.chat.id.toString() === chatId) {
          messagesFromTargetChat++;
          if (sampleMessagesFromTargetChat.length < 2) {
            sampleMessagesFromTargetChat.push({
              text_preview: update.message.text?.substring(0, 100),
              date: update.message.date,
              message_id: update.message.message_id
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        bot_info: botInfo,
        total_updates: filteredData.result?.length || 0,
        messages_from_target_chat: messagesFromTargetChat,
        sample_messages: sampleMessagesFromTargetChat,
        chat_id_filter: chatId,
        debug_info: {
          bot_token_length: botToken.length,
          updates_api_ok: updatesData.ok
        }
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