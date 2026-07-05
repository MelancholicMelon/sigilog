"""
risk-agent: waits for LOAN_APPLICATION, verifies+opens it, sends RISK_ASSESSMENT (PLAINTEXT).
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from protocol.identity.registry import load_identity
from protocol.sdk.sdk import receive, verify_and_open, send

POLL_INTERVAL = 0.5
MAX_WAIT = 20


def run_risk():
    identity = load_identity("risk-agent")
    print("[risk-agent] waiting for LOAN_APPLICATION...")

    waited = 0
    while waited < MAX_WAIT:
        envelopes = receive(identity)
        for env in envelopes:
            if env["header"]["message_type"] == "LOAN_APPLICATION":
                result = verify_and_open(env, identity)
                if not result["ok"]:
                    print(f"[risk-agent] REJECTED LOAN_APPLICATION: {result['error_code']}")
                    return

                app = result["content"]
                print(f"[risk-agent] verified LOAN_APPLICATION for {app['name']}")

                # Scripted risk logic
                risk = "HIGH" if app["income"] < app["amount"] * 2 else "LOW"
                score = 0.87 if risk == "HIGH" else 0.23

                parent_hash = env["envelope_hash"]
                out = send(
                    sender_identity=identity,
                    recipient_ids=["compliance-agent"],
                    message_type="RISK_ASSESSMENT",
                    content={"risk": risk, "score": score},
                    parent_hashes=[parent_hash],
                    seal=False,
                )
                print(f"[risk-agent] sent RISK_ASSESSMENT risk={risk}")
                return

        time.sleep(POLL_INTERVAL)
        waited += POLL_INTERVAL

    print("[risk-agent] timed out waiting for LOAN_APPLICATION")
