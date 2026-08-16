"""Fetch the transcript of one record.

Transcripts need the ``transcriptions.read`` scope, which is granted separately from
``meetings.read`` — a credential can hold one without the other. An unavailable transcript is a
successful response with ``available: false``, not an error, so check the flag before reading
``utterances``.
"""

import sys

from salesbud import SalesbudClient, SalesbudError

if len(sys.argv) < 2:
    print("Usage: python examples/04_get_transcript.py <mtg_... | call_...>", file=sys.stderr)
    raise SystemExit(1)

resource_id = sys.argv[1]

# The id prefix decides the collection; an id does not resolve across the two.
collection = "calls" if resource_id.startswith("call_") else "meetings"
client = SalesbudClient.from_env()

try:
    data = client.transcript(collection, resource_id)["data"]
except SalesbudError as error:
    if error.code == "INSUFFICIENT_SCOPE":
        print("This credential lacks the transcriptions.read scope.", file=sys.stderr)
        raise SystemExit(1)
    if error.code == "RESOURCE_NOT_FOUND":
        print(f"No {collection[:-1]} with id {resource_id} in your company.", file=sys.stderr)
        raise SystemExit(1)
    raise

if not data["available"]:
    print(f"No transcript yet. Status: {data['status']}")
    raise SystemExit(0)

print(f"Transcript ({data['variant']}), {len(data['utterances'])} utterances\n")
for utterance in data["utterances"][:20]:
    seconds, ms = divmod(utterance["start_ms"], 1000)
    minutes, seconds = divmod(seconds, 60)
    print(f"  [{minutes:02}:{seconds:02}] {utterance['speaker']}: {utterance['text']}")
