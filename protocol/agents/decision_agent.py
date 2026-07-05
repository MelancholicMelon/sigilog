"""
decision-agent: waits for COMPLIANCE_CHECK, verifies it, sends DECISION (2 parents).
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from protocol.identity.registry import load_identity
from protocol.sdk.sdk import receive, verify_and_open, send

POLL_INTERVAL = 0.5
MAX_WAIT = 40


def run_decision():
    identity = load_identity("decision-agent")
    print("[decision-agent] waiting for COMPLIANCE_CHECK...")

    # We need to find the assessment hash from the compliance envelope's provenance
    waited = 0
    while waited < MAX_WAIT:
        envelopes = receive(identity)
        for env in envelopes:
            if env["header"]["message_type"] == "COMPLIANCE_CHECK":
                result = verify_and_open(env, identity)
                if not result["ok"]:
                    print(f"[decision-agent] REJECTED COMPLIANCE_CHECK: {result['error_code']}")
                    return

                check = result["content"]
                print(f"[decision-agent] verified COMPLIANCE_CHECK policy={check['policy']}")

                compliance_hash = env["envelope_hash"]
                # The assessment hash is the compliance envelope's parent
                assessment_hash = env["provenance"]["parent_hashes"][0] if env["provenance"]["parent_hashes"] else None

                parent_hashes = [compliance_hash]
                if assessment_hash:
                    parent_hashes.append(assessment_hash)

                decision = "DENY" if check["policy"] == "PASS_WITH_REVIEW" else "APPROVE"
                reason = "HIGH risk" if decision == "DENY" else "Meets policy"

                out = send(
                    sender_identity=identity,
                    recipient_ids=["intake-agent"],
                    message_type="DECISION",
                    content={"decision": decision, "reason": reason},
                    parent_hashes=parent_hashes,
                    seal=False,
                )
                print(f"[decision-agent] sent DECISION: {decision}")
                return

        time.sleep(POLL_INTERVAL)
        waited += POLL_INTERVAL

    print("[decision-agent] timed out")
