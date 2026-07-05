"""
Demo agent runner. B calls this script to kick the loan scenario.
Usage: python protocol/agents/runner.py start
B can also shell out: subprocess.run(["python", "protocol/agents/runner.py", "start"])
"""
import sys
import os
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from protocol.agents.intake_agent import run_intake
from protocol.agents.risk_agent import run_risk
from protocol.agents.compliance_agent import run_compliance
from protocol.agents.decision_agent import run_decision


def run_scenario():
    """
    Orchestrates the loan pipeline in sequence.
    Each agent runs in its own thread; they synchronize via the relay inbox.
    """
    print("[runner] Starting loan scenario...")
    threads = [
        threading.Thread(target=run_intake, name="intake"),
        threading.Thread(target=run_risk, name="risk"),
        threading.Thread(target=run_compliance, name="compliance"),
        threading.Thread(target=run_decision, name="decision"),
    ]
    for t in threads:
        t.daemon = True
        t.start()

    for t in threads:
        t.join(timeout=30)

    print("[runner] Scenario complete.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "start":
        run_scenario()
    else:
        print("Usage: python protocol/agents/runner.py start")
        sys.exit(1)
