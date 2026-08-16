"""List completed calls — the records captured from a VoIP integration.

Calls are a separate collection with their own ``call_`` ids, not a filter on meetings, and the
two axes are independent: a call can be video and a meeting can be audio. Deciding by ``type``
gets those wrong; ``object`` is what says which resource you are holding.
"""

import sys
from collections import Counter

from salesbud import SalesbudClient

client = SalesbudClient.from_env()

since = sys.argv[1] if len(sys.argv) > 1 else "2026-01-01T00:00:00Z"
print(f"Calls since {since}\n")

by_media: Counter[str] = Counter()

for call in client.calls(meeting_after=since, limit=100):
    by_media[call["type"]] += 1

    # A VoIP record usually identifies the other party by number rather than email.
    participant = call["participants"][0] if call["participants"] else {}
    who = participant.get("phone") or participant.get("email") or "unknown"
    print(f"  {call['id']}  {call['meeting_at'][:10]}  {call['type']:<5}  {who}")

print(f"\n{by_media['audio']} audio, {by_media['video']} video.")
