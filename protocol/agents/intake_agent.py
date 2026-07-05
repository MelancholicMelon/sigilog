"""
intake-agent: receives scenario trigger, sends LOAN_APPLICATION (SEALED → risk-agent).
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from protocol.identity.registry import load_identity
from protocol.sdk.sdk import send


def run_intake():
    print("[intake-agent] triggered")
    identity = load_identity("intake-agent")

    content = {"amount": 3000000, "income": 5200000, "name": "Taro Yamada"}
    envelope = send(
        sender_identity=identity,
        recipient_ids=["risk-agent"],
        message_type="LOAN_APPLICATION",
        content=content,
        parent_hashes=[],
        seal=True,
    )
    print(f"[intake-agent] sent LOAN_APPLICATION (SEALED) envelope_hash={envelope['envelope_hash'][:16]}...")
