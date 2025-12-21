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
from typing import Any, Dict, Optional


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
#
# IMPORTANT:
# If you add new models to the UI/specs, add them here too.
MODEL_PRICING_USD_PER_1K: Dict[str, ModelPricing] = {
    # -------------------------
    # OpenAI (router default + UI defaults + agents.yaml mappings)
    # -------------------------
    # Router DEFAULT_MODEL in services/router/app/main.py
    # gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output
    "gpt-4o-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.15),
        completion_per_1k=_per_1m_to_per_1k(0.60),
    ),
    # Frontend DEFAULT_GRAPH in web/hooks/useFlowStore.ts
    # gpt-4.1-mini: $0.40 / 1M input, $1.60 / 1M output
    "gpt-4.1-mini": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.40),
        completion_per_1k=_per_1m_to_per_1k(1.60),
    ),
    # agents.yaml: openai mappings
    # gpt-3.5-turbo (commonly priced like gpt-3.5-turbo-0125): $0.25 / 1M input, $0.75 / 1M output
    "gpt-3.5-turbo": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.25),
        completion_per_1k=_per_1m_to_per_1k(0.75),
    ),
    # agents.yaml: gpt-4-turbo: $5.00 / 1M input, $15.00 / 1M output
    "gpt-4-turbo": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(5.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    # agents.yaml: "gpt-4" is an alias; map to the common GPT-4 tier used in OpenAI docs (e.g. gpt-4-0613)
    # $15.00 / 1M input, $30.00 / 1M output
    "gpt-4": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(15.00),
        completion_per_1k=_per_1m_to_per_1k(30.00),
    ),
    # -------------------------
    # Anthropic (agents.yaml mappings)
    # -------------------------
    # agents.yaml: Claude 3 Haiku (claude-3-haiku-20240307)
    # Claude docs list Haiku 3 pricing: $0.25 / MTok input, $1.25 / MTok output
    "claude-3-haiku-20240307": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(0.25),
        completion_per_1k=_per_1m_to_per_1k(1.25),
    ),
    # agents.yaml: Claude 3 Sonnet (claude-3-sonnet-20240229)
    # Widely referenced Sonnet pricing: $3.00 / MTok input, $15.00 / MTok output
    "claude-3-sonnet-20240229": ModelPricing(
        prompt_per_1k=_per_1m_to_per_1k(3.00),
        completion_per_1k=_per_1m_to_per_1k(15.00),
    ),
    # -------------------------
    # Local models referenced by agents.yaml (treat as $0)
    # -------------------------
    "tinyllama": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "phi3:mini": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
    "llama2": ModelPricing(prompt_per_1k=0.0, completion_per_1k=0.0),
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
