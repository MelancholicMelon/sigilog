"""
Run once at startup to generate all 4 agent identities.
Usage: python protocol/setup_identities.py
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from protocol.identity.registry import generate_identity

AGENTS = [
    ("intake-agent",     {"role": "Loan intake",       "org": "Demo Bank"}),
    ("risk-agent",       {"role": "Risk assessment",   "org": "Demo Bank"}),
    ("compliance-agent", {"role": "Compliance check",  "org": "Demo Bank"}),
    ("decision-agent",   {"role": "Loan decision",     "org": "Demo Bank"}),
]

if __name__ == "__main__":
    print("Generating agent identities...")
    for agent_id, metadata in AGENTS:
        identity = generate_identity(agent_id, metadata)
        print(f"  [{agent_id}] public_key={identity['public_key'][:20]}...")
    print(f"\nRegistry written to runtime/registry.json")
    print(f"Private keys written to runtime/keys/")
