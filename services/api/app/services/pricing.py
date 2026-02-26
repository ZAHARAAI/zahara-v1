"""
Static model pricing table and helper utilities.

Job6 expects a *central* price table per model for cost estimation.

Conventions:
- All prices are USD per 1K tokens.
- prompt_per_1k: cost for input tokens
- completion_per_1k: cost for output tokens
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


@dataclass(frozen=True)
class ModelPricing:
    """USD per 1K tokens."""

    prompt_per_1k: float
    completion_per_1k: float


def _per_1m_to_per_1k(price_per_1m: float) -> float:
    """Convert USD per 1M tokens -> USD per 1K tokens."""
    return float(price_per_1m) / 1000.0


# Central pricing table (USD per 1K tokens)
#
# Sources:
# - OpenAI model pricing pages / pricing docs
# - Claude pricing docs (platform.claude.com)
# - Groq pricing docs
# - Google AI / Vertex AI pricing docs
#
# IMPORTANT:
# If you add new models to the UI/specs, add them here too.
MODEL_PRICING_USD_PER_1K: Dict[str, ModelPricing] = {
    # -------------------------
    # OpenAI
    # -------------------------
    # gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output
    "gpt-4o-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.15),
        completion_per_1k=_per_1m_to_per_1k(0.60),
    ),
    # gpt-4o: $2.50 / 1M input, $10.00 / 1M output
    "gpt-4o": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(2.50),
        completion_per_1k=_per_1m_to_per_1k(10.00),
    ),
    # gpt-4.1: $2.00 / 1M input, $8.00 / 1M output
    "gpt-4.1": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(2.00),
        completion_per_1k=_per_1m_to_per_1k(8.00),
    ),
    # gpt-4.1-mini: $0.40 / 1M input, $1.60 / 1M output
    "gpt-4.1-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.40),
        completion_per_1k=_per_1m_to_per_1k(1.60),
    ),
    # gpt-4.1-nano: $0.10 / 1M input, $0.40 / 1M output
    "gpt-4.1-nano": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.10),
        completion_per_1k=_per_1m_to_per_1k(0.40),
    ),
    # gpt-4-turbo: $5.00 / 1M input, $15.00 / 1M output
    "gpt-4-turbo": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(5.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    # gpt-4: $15.00 / 1M input, $30.00 / 1M output
    "gpt-4": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(15.00),
        completion_per_1k=_per_1m_to_per_1k(30.00),
    ),
    # gpt-3.5-turbo: $0.25 / 1M input, $0.75 / 1M output
    "gpt-3.5-turbo": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.25),
        completion_per_1k=_per_1m_to_per_1k(0.75),
    ),
    # o1: $15.00 / 1M input, $60.00 / 1M output
    "o1": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(15.00),
        completion_per_1k=_per_1m_to_per_1k(60.00),
    ),
    # o1-mini: $3.00 / 1M input, $12.00 / 1M output
    "o1-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(3.00),
        completion_per_1k=_per_1m_to_per_1k(12.00),
    ),
    # o3-mini: $1.10 / 1M input, $4.40 / 1M output
    "o3-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(1.10),
        completion_per_1k=_per_1m_to_per_1k(4.40),
    ),
    # -------------------------
    # Anthropic
    # -------------------------
    # claude-3-5-sonnet (latest): $3.00 / MTok input, $15.00 / MTok output
    "claude-3-5-sonnet-20241022": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(3.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    "claude-3-5-sonnet-20240620": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(3.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    # claude-3-5-haiku: $0.80 / MTok input, $4.00 / MTok output
    "claude-3-5-haiku-20241022": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.80),
        completion_per_1k=_per_1m_to_per_1k(4.00),
    ),
    # claude-3-opus: $15.00 / MTok input, $75.00 / MTok output
    "claude-3-opus-20240229": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(15.00),
        completion_per_1k=_per_1m_to_per_1k(75.00),
    ),
    # claude-3-sonnet: $3.00 / MTok input, $15.00 / MTok output
    "claude-3-sonnet-20240229": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(3.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    # claude-3-haiku: $0.25 / MTok input, $1.25 / MTok output
    "claude-3-haiku-20240307": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.25),
        completion_per_1k=_per_1m_to_per_1k(1.25),
    ),
    # -------------------------
    # Google Gemini
    # -------------------------
    # gemini-1.5-pro: $1.25 / 1M input (≤128k), $5.00 / 1M output
    "gemini-1.5-pro": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(1.25),
        completion_per_1k=_per_1m_to_per_1k(5.00),
    ),
    "gemini-1.5-pro-latest": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(1.25),
        completion_per_1k=_per_1m_to_per_1k(5.00),
    ),
    # gemini-1.5-flash: $0.075 / 1M input (≤128k), $0.30 / 1M output
    "gemini-1.5-flash": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.075),
        completion_per_1k=_per_1m_to_per_1k(0.30),
    ),
    "gemini-1.5-flash-latest": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.075),
        completion_per_1k=_per_1m_to_per_1k(0.30),
    ),
    # gemini-2.0-flash: $0.10 / 1M input, $0.40 / 1M output
    "gemini-2.0-flash": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.10),
        completion_per_1k=_per_1m_to_per_1k(0.40),
    ),
    "gemini-2.0-flash-exp": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.10),
        completion_per_1k=_per_1m_to_per_1k(0.40),
    ),
    # -------------------------
    # Groq (inference-as-a-service; prices as of early 2026)
    # -------------------------
    # llama-3.3-70b-versatile: $0.59 / 1M input, $0.79 / 1M output
    "llama-3.3-70b-versatile": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.59),
        completion_per_1k=_per_1m_to_per_1k(0.79),
    ),
    # llama-3.1-8b-instant: $0.05 / 1M input, $0.08 / 1M output
    "llama-3.1-8b-instant": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.05),
        completion_per_1k=_per_1m_to_per_1k(0.08),
    ),
    # llama-3.1-70b-versatile: $0.59 / 1M input, $0.79 / 1M output
    "llama-3.1-70b-versatile": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.59),
        completion_per_1k=_per_1m_to_per_1k(0.79),
    ),
    # mixtral-8x7b: $0.24 / 1M input, $0.24 / 1M output
    "mixtral-8x7b-32768": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.24),
        completion_per_1k=_per_1m_to_per_1k(0.24),
    ),
    # -------------------------
    # Local / self-hosted models (treat as $0)
    # -------------------------
    "tinyllama": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "phi3:mini": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "llama2": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "llama3": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "mistral": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
}


def estimate_cost_usd(model: Optional[str], usage: Dict[str, Any]) -> Optional[float]:
    """
    Estimate cost in USD from a model name + OpenAI-style usage dict.

    Expected usage keys (OpenAI-compatible):
      - prompt_tokens
      - completion_tokens
      - total_tokens
    """
    if not model or not usage:
        return None

    pricing = MODEL_PRICING_USD_PER_1K.get(model.strip())
    if pricing is None:
        return None

    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")

    # Prefer split tokens if present.
    if isinstance(prompt_tokens, (int, float)) and isinstance(
        completion_tokens, (int, float)
    ):
        return (float(prompt_tokens) / 1000.0) * pricing.prompt_per_1k + (
            float(completion_tokens) / 1000.0
        ) * pricing.completion_per_1k

    # Fallback to total if split isn't available.
    if isinstance(total_tokens, (int, float)):
        blended = (pricing.prompt_per_1k + pricing.completion_per_1k) / 2.0
        return (float(total_tokens) / 1000.0) * blended

    return None


DEFAULT_FALLBACK_MODEL = "gpt-4o-mini"


def estimate_cost_usd_with_fallback(
    model: Optional[str],
    usage: Dict[str, Any],
    *,
    fallback_model: str = DEFAULT_FALLBACK_MODEL,
) -> Tuple[Optional[float], bool]:
    """
    Estimate cost and indicate whether the estimate is approximate.

    - If model exists in the pricing table -> (cost, False)
    - If unknown model but tokens exist -> estimate using fallback_model pricing -> (cost, True)
    - If insufficient data -> (None, True)
    """
    cost = estimate_cost_usd(model, usage)
    if cost is not None:
        return cost, False

    # Unknown model: best-effort fallback using a known pricing entry.
    if not usage:
        return None, True

    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")

    # If we don't have any token info, we can't even approximate.
    if not any(
        isinstance(x, (int, float))
        for x in (prompt_tokens, completion_tokens, total_tokens)
    ):
        return None, True

    # Use fallback model pricing.
    approx = estimate_cost_usd(fallback_model, usage)
    return approx, True
