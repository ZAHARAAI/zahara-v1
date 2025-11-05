from typing import Any, Dict, List, Optional

import httpx
import openai

from ..config import settings


class LLMService:
    def __init__(self):
        self.local_llm_url = settings.local_llm_url
        self.openai_api_key = settings.openai_api_key
        self.openrouter_api_key = settings.openrouter_api_key
        self.default_model = settings.default_model

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        provider: str = "local",
    ) -> Dict[str, Any]:
        """Generate chat completion using specified provider"""
        model = model or self.default_model

        try:
            if provider == "local":
                return await self._local_chat_completion(messages, model)
            elif provider == "openai":
                return await self._openai_chat_completion(messages, model)
            elif provider == "openrouter":
                return await self._openrouter_chat_completion(messages, model)
            else:
                return {"error": f"Unknown provider: {provider}"}
        except Exception as e:
            return {"error": str(e)}

    async def _local_chat_completion(self, messages: List[Dict[str, str]], model: str):
        """Use local Ollama for chat completion"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.local_llm_url}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
                timeout=60.0,
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "provider": "local",
                    "model": model,
                    "message": result.get("message", {}).get("content", ""),
                    "usage": result.get("usage", {}),
                }
            else:
                return {"error": f"Local LLM error: {response.status_code}"}

    async def _openai_chat_completion(self, messages: List[Dict[str, str]], model: str):
        """Use OpenAI API for chat completion"""
        if not self.openai_api_key or self.openai_api_key in [
            "",
            "your_openai_key_here",
        ]:
            return {"error": "OpenAI API key not configured"}

        client = openai.AsyncOpenAI(api_key=self.openai_api_key)

        response = await client.chat.completions.create(model=model, messages=messages)

        return {
            "provider": "openai",
            "model": model,
            "message": response.choices[0].message.content,
            "usage": response.usage.dict() if response.usage else {},
        }

    async def _openrouter_chat_completion(
        self, messages: List[Dict[str, str]], model: str
    ):
        """Use OpenRouter API for chat completion"""
        if not self.openrouter_api_key or self.openrouter_api_key in [
            "",
            "your_openrouter_key_here",
        ]:
            return {"error": "OpenRouter API key not configured"}

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "messages": messages},
                timeout=60.0,
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "provider": "openrouter",
                    "model": model,
                    "message": result["choices"][0]["message"]["content"],
                    "usage": result.get("usage", {}),
                }
            else:
                return {"error": f"OpenRouter error: {response.status_code}"}

    async def generate_text(
        self, prompt: str, model: Optional[str] = None, provider: str = "local"
    ) -> Dict[str, Any]:
        """Generate text completion"""
        messages = [{"role": "user", "content": prompt}]
        return await self.chat_completion(messages, model, provider)

    async def get_available_models(self, provider: str = "local") -> Dict[str, Any]:
        """Get list of available models"""
        try:
            if provider == "local":
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"{self.local_llm_url}/api/tags")
                    if response.status_code == 200:
                        models = response.json().get("models", [])
                        return {
                            "provider": "local",
                            "models": [model["name"] for model in models],
                        }
            elif provider == "openai":
                if not self.openai_api_key or self.openai_api_key in [
                    "",
                    "your_openai_key_here",
                ]:
                    return {"error": "OpenAI API key not configured"}

                client = openai.AsyncOpenAI(api_key=self.openai_api_key)
                models = await client.models.list()
                return {
                    "provider": "openai",
                    "models": [model.id for model in models.data],
                }

            return {"error": f"Provider {provider} not supported for model listing"}
        except Exception as e:
            return {"error": str(e)}

    async def health_check(self) -> Dict[str, Any]:
        """Check if LLM service is healthy"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.local_llm_url}/api/tags", timeout=10.0
                )
                if response.status_code == 200:
                    return {"status": "healthy", "provider": "local"}
                else:
                    return {
                        "status": "unhealthy",
                        "error": f"Status code: {response.status_code}",
                    }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}
