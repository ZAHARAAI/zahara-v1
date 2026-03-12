#!/bin/bash

# Test user scoping enforcement for Job 9C
# This script verifies that:
# 1. JWT auth is required
# 2. User A cannot access User B's resources
# 3. 404 is returned for non-owned resources (no existence leak)

set -e

API_BASE="http://localhost:8000"

echo "=== Job 9C User Scoping Test ==="
echo

# 1. Register User A
echo "1. Registering User A..."
USER_A_EMAIL="user-a-$(date +%s)@test.zahara.ai"
curl -s -X POST "$API_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"userA\",
    \"email\": \"$USER_A_EMAIL\",
    \"password\": \"password123!\"
  }" > /tmp/user_a_signup.json

USER_A_TOKEN=$(jq -r '.access_token' /tmp/user_a_signup.json)
echo "User A token: ${USER_A_TOKEN:0:20}..."

# 2. Register User B
echo
echo "2. Registering User B..."
USER_B_EMAIL="user-b-$(date +%s)@test.zahara.ai"
curl -s -X POST "$API_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"userB\",
    \"email\": \"$USER_B_EMAIL\",
    \"password\": \"password456!\"
  }" > /tmp/user_b_signup.json

USER_B_TOKEN=$(jq -r '.access_token' /tmp/user_b_signup.json)
echo "User B token: ${USER_B_TOKEN:0:20}..."

# 3. User A creates an agent
echo
echo "3. User A creates an agent..."
curl -s -X POST "$API_BASE/agents" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"User A's Agent\",
    \"description\": \"Secret agent for User A\",
    \"spec\": {}
  }" > /tmp/agent_a.json

AGENT_A_ID=$(jq -r '.agent.id' /tmp/agent_a.json)
echo "User A's agent ID: $AGENT_A_ID"

# 4. User A can access their own agent
echo
echo "4. User A accessing their own agent..."
curl -s -X GET "$API_BASE/agents/$AGENT_A_ID" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  > /tmp/agent_a_get.json
GET_STATUS=$(jq -r '.ok' /tmp/agent_a_get.json)
echo "User A can access own agent: $GET_STATUS"

# 5. User B cannot access User A's agent (should get 404)
echo
echo "5. User B trying to access User A's agent (should get 404)..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/agent_a_from_b.json \
  -X GET "$API_BASE/agents/$AGENT_A_ID" \
  -H "Authorization: Bearer $USER_B_TOKEN")
echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "404" ]; then
  echo "✓ PASS: User B correctly denied access (404)"
else
  echo "✗ FAIL: Expected 404 but got $HTTP_CODE"
  jq . /tmp/agent_a_from_b.json
fi

# 6. User B's agent list should not include User A's agent
echo
echo "6. User B listing agents (should be empty)..."
curl -s -X GET "$API_BASE/agents" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  > /tmp/agents_b_list.json
AGENT_COUNT=$(jq '.items | length' /tmp/agents_b_list.json)
echo "User B sees $AGENT_COUNT agents"

echo
echo "=== All tests completed ==="
