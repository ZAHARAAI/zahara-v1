#!/usr/bin/env python3
import time
import requests

api_base = "http://localhost:8000"

# Register
user_email = f"test-{int(time.time())}@test.zahara.ai"
res = requests.post(
    f"{api_base}/auth/signup",
    json={"username": f"user{int(time.time())}", "email": user_email, "password": "pass123!"},
    timeout=5,
)
print(f"Signup: {res.status_code}")

# Login
res = requests.post(
    f"{api_base}/auth/login",
    json={"email": user_email, "password": "pass123!"},
    timeout=5,
)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Create agent
res = requests.post(
    f"{api_base}/agents",
    headers=headers,
    json={"name": "test", "spec": {}},
    timeout=5,
)
print(f"Create agent: {res.status_code}")
agent_id = res.json()["agent"]["id"]

# Start run
res = requests.post(
    f"{api_base}/agents/{agent_id}/run",
    headers=headers,
    json={"input": "test", "source": "test"},
    timeout=5,
)
print(f"Start run: {res.status_code}")
if res.status_code != 200:
    print(f"Error response: {res.text[:1000]}")
else:
    print(f"Run ID: {res.json()['run_id']}")
