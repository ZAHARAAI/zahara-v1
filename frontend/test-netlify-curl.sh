#!/bin/bash

# Your Netlify Personal Access Token
TOKEN="nfp_Bo2YvkXzHwquCKypSu3a3t67noP2YjTNd0a6"

echo "🔍 Testing Netlify Token with curl..."
echo ""

# Test 1: Check token validity
echo "1️⃣ Testing token validity..."
TOKEN_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  https://api.netlify.com/api/v1/user)

if echo "$TOKEN_RESPONSE" | grep -q "email"; then
  echo "✅ Token is VALID!"
  echo "User Info: $(echo $TOKEN_RESPONSE | jq -r '.email // .login // "Unknown"')"
else
  echo "❌ Token is INVALID or EXPIRED"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo ""

# Test 2: List sites
echo "2️⃣ Listing your Netlify sites..."
SITES_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  https://api.netlify.com/api/v1/sites)

if echo "$SITES_RESPONSE" | jq . >/dev/null 2>&1; then
  SITE_COUNT=$(echo $SITES_RESPONSE | jq length)
  echo "✅ Found $SITE_COUNT sites:"

  echo $SITES_RESPONSE | jq -r '.[] | "  - \(.name) (\(.site_id)) - \(.url)"'
else
  echo "❌ Could not retrieve sites"
  echo "Response: $SITES_RESPONSE"
fi

echo ""
echo "3️⃣ To test deployment to a specific site, you need the SITE_ID"
echo "Replace YOUR_SITE_ID below with your actual site ID from above:"
echo ""
echo "curl -H \"Authorization: Bearer $TOKEN\" \\"
echo "  https://api.netlify.com/api/v1/sites/YOUR_SITE_ID"
echo ""
echo "If this returns site info, your token has access to deploy to that site."
