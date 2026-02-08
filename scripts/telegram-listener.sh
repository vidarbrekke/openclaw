#!/bin/bash
# Simple Telegram listener - polls and prints messages immediately

BOT_TOKEN="8429388150:AAF_1qFrhi2icr-OSbSRVro2caw0oe5fVLs"
OFFSET=0

echo "🔍 Listening for Telegram messages..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    RESPONSE=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getUpdates?offset=$OFFSET&limit=10")
    
    # Check if there are any results
    COUNT=$(echo "$RESPONSE" | grep -o '"update_id"' | wc -l)
    
    if [ "$COUNT" -gt 0 ]; then
        echo "📨 Received $COUNT message(s):"
        echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
        
        # Update offset to mark these as read
        MAX_ID=$(echo "$RESPONSE" | grep -o '"update_id":[0-9]*' | grep -o '[0-9]*' | sort -n | tail -1)
        OFFSET=$((MAX_ID + 1))
        echo ""
        echo "---"
    fi
    
    sleep 2
done
