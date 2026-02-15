#!/bin/bash
echo "📊 SWATCH AUTOMATION PROGRESS"
echo "============================="
echo ""

if pgrep -f "run-swatch-automation.sh.*prod" > /dev/null; then
  echo "🔄 Production automation: RUNNING"
  echo ""
  echo "Recent activity:"
  tail -20 /tmp/production-run.log | grep -E "📥|✅|❌|📊"
  echo ""
  echo "Full log: /tmp/production-run.log"
else
  echo "✅ Production automation: COMPLETE"
  echo ""
  tail -5 /tmp/production-run.log
fi

echo ""
echo "---"
echo ""
echo "To monitor live: tail -f /tmp/production-run.log"
