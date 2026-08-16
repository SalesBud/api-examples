"""Minimal Salesbud API client.

It exists to encode the three things that are easy to get wrong, so you do not have to:

1. Token renewal. Client credentials has no refresh token, so renewal is asking for a new token.
   Renewing on a timer alone is not enough: a credential can be revoked before the clock runs
   out, so a 401 also triggers one retry with a fresh token.
2. Pagination. A page can come back short, or empty, while ``has_more`` is still true. The
   generator below follows ``next_cursor`` and never looks at ``len(data)``.
3. Retries. 429 waits out ``Retry-After``; 503 backs off exponentially with jitter; every other
   4xx fails immediately, because retrying an invalid request just fails again.
"""

from __future__ import annotations

import os
import random
import threading
import time
from typing import Any, Iterator

import requests

DEFAULT_BASE_URL = "https://api.salesbud.com.br"

# Renew this many seconds before the token actually expires, to cover clock skew and latency.
RENEW_MARGIN_SECONDS = 60

MAX_RETRIES = 4


class SalesbudError(Exception):
    def __init__(self, status: int, body: dict[str, Any], request_id: str | None = None):
        error = body.get("error")
        if isinstance(error, dict):
            #: Branch on this. ``detail`` is human text and may be reworded between releases.
            self.code = error.get("code", "UNKNOWN")
            detail = error.get("detail", "Request failed")
            self.request_id = error.get("request_id", request_id)
        else:
            # The token endpoint answers in the OAuth 2.0 error shape, not the API envelope.
            self.code = error or "UNKNOWN"
            detail = body.get("error_description", "Request failed")
            self.request_id = request_id

        self.status = status
        super().__init__(detail)


class SalesbudClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        base_url: str = DEFAULT_BASE_URL,
        session: requests.Session | None = None,
    ):
        if not client_id or not client_secret:
            raise ValueError("client_id and client_secret are required")

        self._client_id = client_id
        self._client_secret = client_secret
        self._base_url = base_url.rstrip("/")
        self._session = session or requests.Session()
        self._token: str | None = None
        self._expires_at = 0.0
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "SalesbudClient":
        return cls(
            client_id=os.environ.get("SALESBUD_CLIENT_ID", ""),
            client_secret=os.environ.get("SALESBUD_CLIENT_SECRET", ""),
            base_url=os.environ.get("SALESBUD_BASE_URL", DEFAULT_BASE_URL),
        )

    def access_token(self, force_refresh: bool = False) -> str:
        """Return a valid token, issuing one only when needed.

        The lock keeps concurrent callers from each burning a slot of the token-issuance limit.
        """
        with self._lock:
            if not force_refresh and self._token and time.time() < self._expires_at:
                return self._token

            response = self._session.post(
                f"{self._base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                },
                timeout=30,
            )
            body = _json(response)
            if not response.ok:
                raise SalesbudError(response.status_code, body, response.headers.get("x-request-id"))

            self._token = body["access_token"]
            self._expires_at = time.time() + body["expires_in"] - RENEW_MARGIN_SECONDS
            return self._token

    def request(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        retry_on_unauthorized = True
        clean = {k: v for k, v in (params or {}).items() if v is not None}

        for attempt in range(MAX_RETRIES + 1):
            response = self._session.get(
                f"{self._base_url}{path}",
                params=clean,
                headers={"Authorization": f"Bearer {self.access_token()}"},
                timeout=60,
            )
            if response.ok:
                return _json(response)

            body = _json(response)
            error = SalesbudError(response.status_code, body, response.headers.get("x-request-id"))

            # The credential may have been revoked, or the token rotated out, before it expired.
            if response.status_code == 401 and retry_on_unauthorized:
                self.access_token(force_refresh=True)
                retry_on_unauthorized = False
                continue

            if response.status_code not in (429, 503) or attempt == MAX_RETRIES:
                raise error

            retry_after = response.headers.get("retry-after")
            delay = (
                float(retry_after)
                if retry_after and retry_after.replace(".", "", 1).isdigit()
                else 2**attempt * 0.5 + random.uniform(0, 0.25)
            )
            time.sleep(delay)

        raise RuntimeError("unreachable")

    def context(self) -> dict[str, Any]:
        """Client, company, scopes and the rate limit actually in effect for this credential."""
        return self.request("/v1/context")

    def list(self, collection: str, **filters: Any) -> Iterator[dict[str, Any]]:
        """Yield every record of a collection, page by page.

        Driven by ``next_cursor``, never by how many records a page returned — a short or empty
        page with ``has_more: true`` is normal, and stopping on it silently truncates the walk.
        Filters must stay identical across the walk: the cursor is signed and binds them.
        """
        cursor = None
        while True:
            page = self.request(f"/v1/{collection}", {**filters, "cursor": cursor})
            yield from page["data"]
            cursor = page["pagination"]["next_cursor"]
            if not cursor:
                return

    def meetings(self, **filters: Any) -> Iterator[dict[str, Any]]:
        return self.list("meetings", **filters)

    def calls(self, **filters: Any) -> Iterator[dict[str, Any]]:
        """Calls are records captured from a VoIP integration, addressed by ``call_`` ids."""
        return self.list("calls", **filters)

    def meeting(self, meeting_id: str) -> dict[str, Any]:
        return self.request(f"/v1/meetings/{meeting_id}")

    def call(self, call_id: str) -> dict[str, Any]:
        return self.request(f"/v1/calls/{call_id}")

    def transcript(self, collection: str, resource_id: str) -> dict[str, Any]:
        """Needs ``transcriptions.read``, which is granted separately from ``meetings.read``."""
        return self.request(f"/v1/{collection}/{resource_id}/transcript")


def _json(response: requests.Response) -> dict[str, Any]:
    try:
        return response.json()
    except ValueError:
        return {}
