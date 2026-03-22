"""Shared helpers for HTTP integration tests against the live Docker API."""
import time

import requests

API_BASE = "http://localhost:8000"
_MAX_RETRIES = 5
_RETRY_WAIT = 5  # seconds


def api_request(method: str, url: str, **kwargs) -> requests.Response:
    """Make an API request with automatic retry on 429 rate limit."""
    kwargs.setdefault("timeout", 10)

    for attempt in range(_MAX_RETRIES + 1):
        res = requests.request(method, url, **kwargs)
        if res.status_code != 429:
            return res
        if attempt < _MAX_RETRIES:
            wait = float(res.headers.get("Retry-After", _RETRY_WAIT))
            time.sleep(wait)

    return res  # last attempt, even if 429


def api_post(url: str, **kwargs) -> requests.Response:
    return api_request("POST", url, **kwargs)


def api_get(url: str, **kwargs) -> requests.Response:
    return api_request("GET", url, **kwargs)


def api_patch(url: str, **kwargs) -> requests.Response:
    return api_request("PATCH", url, **kwargs)


def api_delete(url: str, **kwargs) -> requests.Response:
    return api_request("DELETE", url, **kwargs)
