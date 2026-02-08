#!/usr/bin/env node
/**
 * Telegram Bot Poller
 * Polls getUpdates and outputs new messages
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '3000', 10);

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN env var required');
  process.exit(1);
}

let lastUpdateId = 0;

async function pollForMessages() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&limit=10`;
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();
    
    if (!data.ok) {
      console.error('API Error:', data.error_code, data.description);
      return;
    }
    
    if (data.result && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        
        if (update.message) {
          const msg = update.message;
          const from = msg.from?.first_name || 'Unknown';
          const username = msg.from?.username || '';
          const text = msg.text || '[no text]';
          const chatId = msg.chat?.id;
          
          console.log(`[TELEGRAM_MSG] ${new Date().toISOString()}`);
          console.log(`  From: ${from} (${username || 'no username'})`);
          console.log(`  Chat: ${chatId}`);
          console.log(`  Text: ${text}`);
          console.log(`  UpdateID: ${update.update_id}`);
          console.log('---');
        }
      }
    }
  } catch (err) {
    console.error('Poll error:', err.message);
  }
}

// Initial poll
pollForMessages();

// Loop
setInterval(pollForMessages, POLL_INTERVAL);

console.log(`Telegram poller started (interval: ${POLL_INTERVAL}ms)`);
