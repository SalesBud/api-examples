"""Walk every completed meeting in a period.

The loop never inspects how many records a page returned: a short or empty page with
``has_more: true`` is normal, and stopping on it silently truncates the walk. The client's
generator follows ``next_cursor`` instead.
"""

import sys

from salesbud import SalesbudClient

client = SalesbudClient.from_env()

since = sys.argv[1] if len(sys.argv) > 1 else "2026-01-01T00:00:00Z"
print(f"Meetings since {since}\n")

count = 0
with_transcript = 0

for meeting in client.meetings(meeting_after=since, limit=100):
    count += 1
    if meeting["transcript"]["available"]:
        with_transcript += 1

    minutes = round(meeting["duration_seconds"] / 60)
    print(
        f"  {meeting['id']}  {meeting['meeting_at'][:10]}  "
        f"{minutes:>3}min  {meeting['type']:<5}  {meeting['title']}"
    )

print(f"\n{count} meetings, {with_transcript} with a transcript.")
