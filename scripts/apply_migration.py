"""
apply_migration_rest.py - Applies the statusz_embeddings SQL migration via Supabase Management API.
Uses the PAT (sbp_...) key which is the correct auth for the Management API.
"""
import urllib.request
import urllib.error
import json

PROJECT_ID = "bpjzgapmoyhtgryglcke"
PAT = "sbp_de091ef05f9b0b7cfd1c525566c0d0ea363e2806"

SQL = open("supabase/migrations/20260218181540_statusz_embeddings.sql").read()

body = json.dumps({"query": SQL}).encode("utf-8")
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query",
    data=body,
    headers={
        "Authorization": f"Bearer {PAT}",
        "Content-Type": "application/json",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(f"Status: {resp.status}")
        print(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
