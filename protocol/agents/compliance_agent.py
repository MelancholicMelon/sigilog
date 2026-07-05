"""
compliance-agent: waits for RISK_ASSESSMENT, verifies it, sends COMPLIANCE_CHECK.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from protocol.identity.registry import load_identity
from protocol.sdk.sdk import receive, verify_and_open, send

POLL_INTERVAL = 0.5
MAX_WAIT = 30


def run_compliance():
    identity = load_identity("compliance-agent")
    print("[compliance-agent] waiting for RISK_ASSESSMENT...")

    waited = 0
    while waited < MAX_WAIT:
        envelopes = receive(identity)
        for env in envelopes:
            if env["header"]["message_type"] == "RISK_ASSESSMENT":
                result = verify_and_open(env, identity)
                if not result["ok"]:
                    print(f"[compliance-agent] REJECTED RISK_ASSESSMENT: {result['error_code']}")
                    return

                assessment = result["content"]
                print(f"[compliance-agent] verified RISK_ASSESSMENT risk={assessment['risk']}")

                # Scripted compliance logic
                policy = "PASS_WITH_REVIEW" if assessment["risk"] == "HIGH" else "PASS"

                parent_hash = env["envelope_hash"]
                out = send(
                    sender_identity=identity,
                    recipient_ids=["decision-agent"],
                    message_type="COMPLIANCE_CHECK",
                    content={"policy": policy},
                    parent_hashes=[parent_hash],
                    seal=False,
                )
                print(f"[compliance-agent] sent COMPLIANCE_CHECK policy={policy}")
                return

        time.sleep(POLL_INTERVAL)
        waited += POLL_INTERVAL

    print("[compliance-agent] timed out")
