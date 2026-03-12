#!/bin/bash

# Test Day 2 deliverables: Idempotency-Key + GET /runs/{id}/events

set -e

API_BASE="http://localhost:8000"

echo "=== Day 2: Idempotency-Key + Events Endpoint Test ==="
echo

# 1. Register and login
echo "1. Register test user..."
USER_EMAIL="day2test-$(date +%s)@test.zahara.ai"
curl -s -X POST "$API_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"day2user\",
    \"email\": \"$USER_EMAIL\",
    \"password\": \"password123!\"
  }" > /tmp/day2_signup.json

TOKEN=$(jq -r '.access_token' /tmp/day2_signup.json)
echo "Token obtained: ${TOKEN:0:20}..."

# 2. Create an agent
echo
echo "2. Creating agent..."
curl -s -X POST "$API_BASE/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Agent\",
    \"description\": \"Test agent for Day 2\",
    \"spec\": {}
  }" > /tmp/agent.json

AGENT_ID=$(jq -r '.agent.id' /tmp/agent.json)
echo "Agent created: $AGENT_ID"

# 3. Start a run with Idempotency-Key
echo
echo "3. Starting run with Idempotency-Key..."
IDEMPOTENCY_KEY="test-key-$(date +%s%N)"
curl -s -X POST "$API_BASE/agents/$AGENT_ID/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"input\": \"Hello, agent!\",
    \"source\": \"test\"
  }" > /tmp/run1.json

RUN_ID=$(jq -r '.run_id' /tmp/run1.json)
REQUEST_ID=$(jq -r '.request_id' /tmp/run1.json)
echo "Run 1 created: $RUN_ID with request_id: $REQUEST_ID"

# 4. Retry with same Idempotency-Key (should return same run)
echo
echo "4. Retrying with same Idempotency-Key (should return existing run)..."
curl -s -X POST "$API_BASE/agents/$AGENT_ID/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"input\": \"Hello again!\",
    \"source\": \"test\"
  }" > /tmp/run2.json

RUN_ID_2=$(jq -r '.run_id' /tmp/run2.json)
REQUEST_ID_2=$(jq -r '.request_id' /tmp/run2.json)
echo "Run 2 returned: $RUN_ID_2 with request_id: $REQUEST_ID_2"

if [ "$RUN_ID" = "$RUN_ID_2" ] && [ "$REQUEST_ID" = "$REQUEST_ID_2" ]; then
  echo "✓ PASS: Idempotency-Key working - same run returned"
else
  echo "✗ FAIL: Expected same run but got different one"
fi

# 5. Test GET /runs/{id}/events endpoint
echo
echo "5. Testing GET /runs/{run_id}/events endpoint..."
curl -s -X GET "$API_BASE/runs/$RUN_ID/events" \
  -H "Authorization: Bearer $TOKEN" \
  > /tmp/events.json

EVENTS_COUNT=$(jq '.events | length' /tmp/events.json)
echo "Events retrieved: $EVENTS_COUNT"
echo "First event type: $(jq -r '.events[0].type' /tmp/events.json)"

if [ "$EVENTS_COUNT" -gt 0 ]; then
  echo "✓ PASS: GET /runs/{id}/events working"
else
  echo "✗ FAIL: No events returned"
fi

echo
echo "=== Day 2 tests completed ==="
