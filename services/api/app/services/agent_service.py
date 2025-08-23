from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


class AgentService:
    """Service for managing AI agents from YAML configuration"""

    def __init__(self):
        self.config_path = Path(__file__).parent.parent / "config" / "agents.yaml"
        self._config = None
        self._load_config()

    def _load_config(self):
        """Load agents configuration from YAML file"""
        try:
            if self.config_path.exists():
                with open(self.config_path, 'r', encoding='utf-8') as file:
                    self._config = yaml.safe_load(file)
            else:
                # Fallback to default configuration if file doesn't exist
                self._config = self._get_default_config()
        except Exception as e:
            print(f"Error loading agents config: {e}")
            self._config = self._get_default_config()

    def _get_default_config(self) -> Dict[str, Any]:
        """Get default agent configuration"""
        return {
            "agents": [
                {
                    "id": "assistant",
                    "name": "General Assistant",
                    "description": "A helpful general-purpose AI assistant",
                    "system_prompt": "You are a helpful AI assistant created by Zahara.ai.",
                    "model": "gpt-3.5-turbo",
                    "provider": "openai",
                    "default": True,
                    "capabilities": ["general_assistance"],
                    "settings": {"temperature": 0.7, "max_tokens": 1000}
                }
            ],
            "vector_collections": {
                "default_collection": "zahara_default",
                "embedding_model": "text-embedding-ada-002",
                "vector_size": 1536,
                "similarity_threshold": 0.7
            }
        }

    def list_agents(self) -> List[Dict[str, Any]]:
        """List all available agents from configuration"""
        return self._config.get("agents", [])

    def get_agent_by_id(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific agent by ID"""
        for agent in self._config.get("agents", []):
            if agent.get("id") == agent_id:
                return agent
        return None

    def get_default_agent(self) -> Optional[Dict[str, Any]]:
        """Get the default agent"""
        for agent in self._config.get("agents", []):
            if agent.get("default", False):
                return agent
        # If no default is set, return the first agent
        agents = self._config.get("agents", [])
        return agents[0] if agents else None

    def get_agents_by_capability(self, capability: str) -> List[Dict[str, Any]]:
        """Get agents that have a specific capability"""
        matching_agents = []
        for agent in self._config.get("agents", []):
            if capability in agent.get("capabilities", []):
                matching_agents.append(agent)
        return matching_agents

    def get_vector_config(self) -> Dict[str, Any]:
        """Get vector collection configuration"""
        return self._config.get("vector_collections", {})

    def get_model_mappings(self) -> Dict[str, List[str]]:
        """Get model mappings by provider"""
        return self._config.get("model_mappings", {})

    def validate_agent_config(self, agent_config: Dict[str, Any]) -> tuple[bool, str]:
        """Validate an agent configuration"""
        required_fields = ["id", "name", "description", "system_prompt", "model", "provider"]

        for field in required_fields:
            if field not in agent_config:
                return False, f"Missing required field: {field}"

        # Validate provider and model
        provider = agent_config["provider"]
        model = agent_config["model"]
        model_mappings = self.get_model_mappings()

        if provider in model_mappings:
            if model not in model_mappings[provider]:
                return False, f"Model '{model}' not supported for provider '{provider}'"

        return True, "Valid"

    def reload_config(self):
        """Reload configuration from file"""
        self._load_config()

    def add_custom_agent(self, agent_config: Dict[str, Any]) -> tuple[bool, str]:
        """Add a custom agent to the configuration (in-memory only)"""
        is_valid, message = self.validate_agent_config(agent_config)
        if not is_valid:
            return False, message

        # Check if agent ID already exists
        if self.get_agent_by_id(agent_config["id"]):
            return False, f"Agent with ID '{agent_config['id']}' already exists"

        # Add to in-memory config
        if "agents" not in self._config:
            self._config["agents"] = []

        self._config["agents"].append(agent_config)
        return True, "Agent added successfully"
