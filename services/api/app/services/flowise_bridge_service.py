"""
Service for bridging Flowise EvaluationRunTracer data with Agent Clinic traces
Connects LangChain Run objects to our trace system
"""

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.trace import Trace

from .trace_service import TraceService


class FlowiseBridgeService:
    """Service for converting Flowise execution data to Agent Clinic traces"""

    def __init__(self, db: Session = None):
        self.db = db
        self.trace_service = TraceService(db)

    def process_langchain_run(
        self, run_data: Dict[str, Any], evaluation_run_id: str
    ) -> str:
        """
        Process a LangChain Run object from Flowise EvaluationRunTracer
        Convert it to Agent Clinic trace format with real token/cost data
        """
        try:
            # Extract basic information from LangChain Run
            run_id = run_data.get("id", str(uuid.uuid4()))
            run_type = run_data.get("run_type", "unknown")
            start_time = self._parse_timestamp(run_data.get("start_time"))
            end_time = self._parse_timestamp(run_data.get("end_time"))

            # Generate trace ID
            trace_id = f"flowise_{evaluation_run_id}_{run_id}"

            # Extract model information using same logic as EvaluationRunTracer
            model = self._extract_model_name_from_run(run_data)
            provider = self._extract_provider_from_run(run_data)

            # Extract token usage using EvaluationRunTracer logic
            tokens, cost, prompt_tokens, completion_tokens = (
                self._extract_token_usage_from_run(run_data, model)
            )

            # Calculate duration in milliseconds
            duration = 0
            if start_time and end_time:
                duration = (end_time - start_time).total_seconds() * 1000

            # Determine operation name
            operation = self._determine_operation_from_run(run_data, run_type)

            # Determine status
            status = self._determine_status_from_run(run_data)

            # Create trace with real LLM data
            self.trace_service.create_trace(
                trace_id=trace_id,
                operation=operation,
                model=model,
                status=status,
                workflow_id=evaluation_run_id,
                metadata={
                    "source": "flowise_evaluation_run_tracer",
                    "langchain_run_type": run_type,
                    "original_run_id": run_id,
                    "flowise_evaluation_run_id": evaluation_run_id,
                    "provider": provider,
                    "token_breakdown": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": tokens,
                    },
                },
            )

            # Create main span for the LLM operation with real usage data
            if start_time and end_time:
                span_id = f"span_{trace_id}_main"
                self.trace_service.add_span(
                    trace_id=trace_id,
                    span_id=span_id,
                    operation=operation,
                    model=model,
                    provider=provider,
                    start_time=start_time,
                    end_time=end_time,
                    status=status,
                    tokens=tokens,
                    cost=cost,
                    metadata={
                        "langchain_run_type": run_type,
                        "span_type": "flowise_llm_run",
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "serialized_data": run_data.get("serialized", {}),
                        "outputs": run_data.get("outputs", {}),
                    },
                )

            # Process child runs recursively
            if "child_runs" in run_data:
                for child_run in run_data["child_runs"]:
                    self._process_child_run(child_run, trace_id, evaluation_run_id)

            # Add events for errors with detailed information
            if status == "ERROR" and "error" in run_data:
                self.trace_service.add_event(
                    trace_id=trace_id,
                    level="error",
                    message=f"LangChain run failed: {str(run_data['error'])}",
                    metadata={
                        "error_details": run_data.get("error"),
                        "run_type": run_type,
                        "model": model,
                        "provider": provider,
                    },
                )

            # Create Flowise execution record with enhanced data
            self.trace_service.create_flowise_execution(
                workflow_id=evaluation_run_id,
                trace_id=trace_id,
                flowise_data={
                    "run_id": run_id,
                    "run_type": run_type,
                    "model": model,
                    "provider": provider,
                    "tokens": tokens,
                    "cost": cost,
                    "duration_ms": duration,
                    "original_run_data": run_data,
                },
                status=status,
            )

            return trace_id

        except Exception as e:
            raise Exception(f"Failed to process LangChain run: {str(e)}")

    def process_evaluation_metrics(
        self, evaluation_run_id: str, metrics: List[str]
    ) -> None:
        """
        Process evaluation metrics from Flowise EvaluationRunner.addMetrics
        Add them as events to the trace
        """
        try:
            # Find traces for this evaluation run
            traces = (
                self.db.query(Trace)
                .filter(Trace.workflow_id == evaluation_run_id)
                .all()
            )

            for trace in traces:
                for metric_json in metrics:
                    try:
                        metric_data = json.loads(metric_json)

                        # Add as trace event
                        self.trace_service.add_event(
                            trace_id=trace.trace_id,
                            level="info",
                            message=f"Evaluation metric: {metric_json}",
                            metadata={
                                "metric_data": metric_data,
                                "source": "flowise_evaluation",
                            },
                        )

                        # Update trace totals if metric contains token/cost info
                        if "totalTokens" in metric_data:
                            trace.total_tokens += metric_data.get("totalTokens", 0)

                        if (
                            "completionTokens" in metric_data
                            and "promptTokens" in metric_data
                        ):
                            total_tokens = metric_data.get(
                                "completionTokens", 0
                            ) + metric_data.get("promptTokens", 0)
                            trace.total_tokens += total_tokens

                        # Calculate cost if model pricing is available
                        if "model" in metric_data:
                            cost = self._calculate_cost(metric_data)
                            if cost > 0:
                                trace.total_cost += cost

                    except json.JSONDecodeError:
                        # Skip invalid JSON metrics
                        continue

            self.db.commit()

        except Exception as e:
            self.db.rollback()
            raise Exception(f"Failed to process evaluation metrics: {str(e)}")

    def _process_child_run(
        self, child_run: Dict[str, Any], parent_trace_id: str, evaluation_run_id: str
    ) -> None:
        """Process a child LangChain run as a span"""
        try:
            run_id = child_run.get("id", str(uuid.uuid4()))
            run_type = child_run.get("run_type", "unknown")
            start_time = self._parse_timestamp(child_run.get("start_time"))
            end_time = self._parse_timestamp(child_run.get("end_time"))

            if not start_time or not end_time:
                return

            # Extract information
            model = self._extract_model_name(child_run)
            provider = self._extract_provider(child_run)
            tokens, cost = self._extract_token_usage(child_run)
            operation = self._determine_operation(child_run, run_type)
            status = self._determine_status(child_run)

            # Create span
            span_id = f"span_{parent_trace_id}_{run_id}"
            self.trace_service.add_span(
                trace_id=parent_trace_id,
                span_id=span_id,
                operation=operation,
                model=model,
                provider=provider,
                start_time=start_time,
                end_time=end_time,
                status=status,
                tokens=tokens,
                cost=cost,
                metadata={
                    "langchain_run_data": child_run,
                    "span_type": "langchain_child_run",
                    "parent_run_id": parent_trace_id,
                },
            )

        except Exception as e:
            # Log error but don't fail the main trace
            print(f"Warning: Failed to process child run: {str(e)}")

    def _extract_model_name_from_run(self, run_data: Dict[str, Any]) -> str:
        """Extract model name from LangChain run data using EvaluationRunTracer logic"""
        serialized = run_data.get("serialized", {})
        extra = run_data.get("extra", {})

        # Exact same logic as EvaluationRunTracer.extractModelName
        model = (
            serialized.get("kwargs", {}).get("model")
            or serialized.get("kwargs", {}).get("model_name")
            or extra.get("metadata", {}).get("ls_model_name")
            or extra.get("metadata", {}).get("fw_model_name")
        )

        return str(model) if model else "unknown"

    def _extract_provider_from_run(self, run_data: Dict[str, Any]) -> str:
        """Extract provider from LangChain run data using EvaluationRunTracer logic"""
        run_name = run_data.get("name", "")

        # Use same mapping as EvaluationRunTracer
        if run_name == "BedrockChat":
            return "awsChatBedrock"
        elif "OpenAI" in run_name:
            return "openai"
        elif "Anthropic" in run_name:
            return "anthropic"
        elif run_name:
            return run_name.lower()
        else:
            return "unknown"

    def _extract_token_usage_from_run(
        self, run_data: Dict[str, Any], model: str
    ) -> tuple[int, float, int, int]:
        """
        Extract token usage from LangChain run data using EvaluationRunTracer logic
        Returns: (total_tokens, cost, prompt_tokens, completion_tokens)
        """
        total_tokens = 0
        prompt_tokens = 0
        completion_tokens = 0
        cost = 0.0

        outputs = run_data.get("outputs", {})

        # Method 1: Check llmOutput.tokenUsage (same as EvaluationRunTracer)
        if outputs.get("llmOutput", {}).get("tokenUsage"):
            token_usage = outputs["llmOutput"]["tokenUsage"]
            prompt_tokens = token_usage.get("promptTokens", 0)
            completion_tokens = token_usage.get("completionTokens", 0)
            total_tokens = token_usage.get("totalTokens", 0)

        # Method 2: Check generations[0][0].message.usage_metadata (same as EvaluationRunTracer)
        elif (
            outputs.get("generations", [])
            and len(outputs["generations"]) > 0
            and len(outputs["generations"][0]) > 0
            and outputs["generations"][0][0]
            .get("message", {})
            .get("usage_metadata", {})
            .get("total_tokens")
        ):
            usage_metadata = outputs["generations"][0][0]["message"]["usage_metadata"]
            prompt_tokens = usage_metadata.get("input_tokens", 0)
            completion_tokens = usage_metadata.get("output_tokens", 0)
            total_tokens = usage_metadata.get("total_tokens", 0)

        # Method 3: Fallback token counting (simplified version of EvaluationRunTracer logic)
        else:
            # This would require tiktoken implementation, for now use estimated values
            # Based on typical prompt/completion ratios
            if "inputs" in run_data and "outputs" in run_data:
                # Rough estimation based on content length
                prompt_tokens = self._estimate_prompt_tokens(run_data.get("inputs", {}))
                completion_tokens = self._estimate_completion_tokens(
                    run_data.get("outputs", {})
                )
                total_tokens = prompt_tokens + completion_tokens

        # Calculate cost using the same model pricing as EvaluationRunTracer would
        if total_tokens > 0:
            cost = self._calculate_cost_for_model(model, total_tokens)

        return total_tokens, cost, prompt_tokens, completion_tokens

    def _estimate_prompt_tokens(self, inputs: Dict[str, Any]) -> int:
        """Estimate prompt tokens from inputs (simplified)"""
        token_count = 0

        # Check messages format
        if "messages" in inputs and isinstance(inputs["messages"], list):
            for message_list in inputs["messages"]:
                if isinstance(message_list, list):
                    for message in message_list:
                        content = self._extract_message_content(message)
                        if content:
                            # Rough estimate: 1 token per 4 characters
                            token_count += len(content) // 4

        # Check prompts format
        if "prompts" in inputs and isinstance(inputs["prompts"], list):
            for prompt in inputs["prompts"]:
                if isinstance(prompt, str):
                    token_count += len(prompt) // 4

        return token_count

    def _estimate_completion_tokens(self, outputs: Dict[str, Any]) -> int:
        """Estimate completion tokens from outputs (simplified)"""
        token_count = 0

        if "generations" in outputs and isinstance(outputs["generations"], list):
            for generation_list in outputs["generations"]:
                if isinstance(generation_list, list):
                    for generation in generation_list:
                        content = None
                        if "text" in generation:
                            content = generation["text"]
                        elif (
                            "message" in generation
                            and "content" in generation["message"]
                        ):
                            content = generation["message"]["content"]

                        if content:
                            # Rough estimate: 1 token per 4 characters
                            token_count += len(content) // 4

        return token_count

    def _extract_message_content(self, message: Dict[str, Any]) -> str:
        """Extract content from message object (same logic as EvaluationRunTracer)"""
        return (
            message.get("content")
            or message.get("SystemMessage", {}).get("content")
            or message.get("HumanMessage", {}).get("content")
            or message.get("AIMessage", {}).get("content")
            or ""
        )

    def _calculate_cost_for_model(self, model: str, tokens: int) -> float:
        """Calculate cost based on model and token count"""
        # Simplified cost calculation - in production, use real pricing
        cost_per_token = {
            "gpt-4": 0.00003,
            "gpt-3.5-turbo": 0.000002,
            "claude-3-sonnet": 0.000015,
            "claude-3": 0.000015,
        }

        model_lower = model.lower()
        for model_key, price in cost_per_token.items():
            if model_key in model_lower:
                return tokens * price

        # Default cost if model not found
        return tokens * 0.00001

    def _calculate_cost(self, metric_data: Dict[str, Any]) -> float:
        """Calculate cost from metric data"""
        if "totalTokens" in metric_data and "model" in metric_data:
            return self._calculate_cost_for_model(
                metric_data["model"], metric_data["totalTokens"]
            )
        return 0.0

    def _determine_operation_from_run(
        self, run_data: Dict[str, Any], run_type: str
    ) -> str:
        """Determine operation name from LangChain run data"""
        name = run_data.get("name", "")

        if name:
            # Convert LangChain class names to readable operations
            if "Chat" in name or run_type == "llm":
                return "flowise_chat_completion"
            elif "Retriev" in name:
                return "flowise_document_retrieval"
            elif "Embed" in name:
                return "flowise_text_embedding"
            elif "Chain" in name:
                return "flowise_chain_execution"
            elif "Agent" in name:
                return "flowise_agent_execution"
            else:
                return f"flowise_{name.lower().replace(' ', '_')}"

        return f"flowise_{run_type}_operation"

    def _determine_status_from_run(self, run_data: Dict[str, Any]) -> str:
        """Determine status from LangChain run data"""
        # Check for errors in the run
        if "error" in run_data and run_data["error"]:
            error_msg = str(run_data["error"]).lower()
            if "rate limit" in error_msg or "too many requests" in error_msg:
                return "RATE-LIMIT"
            else:
                return "ERROR"

        # Check if run completed successfully
        if run_data.get("end_time") and not run_data.get("error"):
            return "OK"

        # If no end_time, might still be running or failed
        if not run_data.get("end_time"):
            return "ERROR"  # Assume failed if no end time

        return "OK"

    def _parse_timestamp(self, timestamp) -> Optional[datetime]:
        """Parse timestamp from various formats"""
        if not timestamp:
            return None

        if isinstance(timestamp, datetime):
            return timestamp

        if isinstance(timestamp, (int, float)):
            return datetime.fromtimestamp(timestamp / 1000)  # Assume milliseconds

        if isinstance(timestamp, str):
            try:
                return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return None

        return None
