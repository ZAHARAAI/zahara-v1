#!/usr/bin/env python3
"""
Load demo data into the Agent Clinic database for testing
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.trace import Trace, Span, TraceEvent


async def create_demo_traces() -> List[dict]:
    """Create realistic demo trace data"""
    
    demo_scenarios = [
        {
            "operation": "customer_query_resolution",
            "model": "gpt-4",
            "duration": 2.3,
            "tokens": 1247,
            "cost": 0.087,
            "status": "OK",
            "spans_count": 3
        },
        {
            "operation": "code_review_assistant", 
            "model": "claude-3-sonnet",
            "duration": 5.7,
            "tokens": 3891,
            "cost": 0.234,
            "status": "OK",
            "spans_count": 5
        },
        {
            "operation": "document_summarization",
            "model": "gpt-3.5-turbo",
            "duration": 1.2,
            "tokens": 2156,
            "cost": 0.032,
            "status": "OK",
            "spans_count": 2
        },
        {
            "operation": "rate_limited_request",
            "model": "gpt-4",
            "duration": 0.1,
            "tokens": 0,
            "cost": 0.0,
            "status": "RATE_LIMIT",
            "spans_count": 1
        },
        {
            "operation": "failed_authentication",
            "model": "gpt-4",
            "duration": 0.05,
            "tokens": 0,
            "cost": 0.0,
            "status": "ERROR",
            "spans_count": 1
        },
        {
            "operation": "large_document_processing",
            "model": "gpt-4-turbo",
            "duration": 12.4,
            "tokens": 8247,
            "cost": 0.412,
            "status": "OK",
            "spans_count": 7
        },
        {
            "operation": "multi_model_workflow",
            "model": "gpt-4",
            "duration": 4.1,
            "tokens": 2847,
            "cost": 0.156,
            "status": "OK",
            "spans_count": 4
        }
    ]
    
    traces = []
    base_time = datetime.utcnow() - timedelta(hours=2)
    
    for i, scenario in enumerate(demo_scenarios * 5):  # Create 35 traces total
        trace_id = uuid.uuid4()
        timestamp = base_time + timedelta(minutes=i * 3)
        
        trace_data = {
            "trace_id": trace_id,
            "timestamp": timestamp,
            "total_duration": scenario["duration"],
            "total_tokens": scenario["tokens"],
            "total_cost": Decimal(str(scenario["cost"])),
            "status": scenario["status"],
            "model": scenario["model"],
            "user_id": f"user_{(i % 5) + 1}",
            "workflow_id": f"workflow_{scenario['operation']}"
        }
        
        traces.append(trace_data)
    
    return traces


async def create_demo_spans(trace_id: uuid.UUID, scenario: dict, base_time: datetime) -> List[dict]:
    """Create demo spans for a trace"""
    spans = []
    
    span_templates = [
        {"operation": "input_validation", "duration_ratio": 0.1, "tokens_ratio": 0.05},
        {"operation": "llm_call", "duration_ratio": 0.7, "tokens_ratio": 0.8},
        {"operation": "response_formatting", "duration_ratio": 0.15, "tokens_ratio": 0.1},
        {"operation": "output_validation", "duration_ratio": 0.05, "tokens_ratio": 0.05},
        {"operation": "logging", "duration_ratio": 0.02, "tokens_ratio": 0.0},
        {"operation": "metrics_collection", "duration_ratio": 0.03, "tokens_ratio": 0.0},
        {"operation": "cache_update", "duration_ratio": 0.05, "tokens_ratio": 0.0}
    ]
    
    current_time = base_time
    spans_to_create = min(scenario["spans_count"], len(span_templates))
    
    for i in range(spans_to_create):
        template = span_templates[i]
        span_duration = scenario["duration"] * template["duration_ratio"]
        span_tokens = int(scenario["tokens"] * template["tokens_ratio"])
        span_cost = float(scenario["cost"]) * template["tokens_ratio"]
        
        start_time = current_time
        end_time = start_time + timedelta(seconds=span_duration)
        
        # Determine span status based on trace status
        if scenario["status"] == "ERROR" and i == 1:  # Make LLM call fail
            span_status = "ERROR"
        elif scenario["status"] == "RATE_LIMIT" and i == 1:
            span_status = "RATE_LIMIT"
        else:
            span_status = "OK"
        
        span_data = {
            "span_id": uuid.uuid4(),
            "trace_id": trace_id,
            "start_time": start_time,
            "end_time": end_time,
            "duration": span_duration,
            "status": span_status,
            "model": scenario["model"] if template["operation"] == "llm_call" else None,
            "tokens": span_tokens if span_tokens > 0 else None,
            "cost": Decimal(str(span_cost)) if span_cost > 0 else None,
            "operation": template["operation"],
            "provider": "openai" if "gpt" in scenario["model"] else "anthropic",
            "span_metadata": {
                "request_id": str(uuid.uuid4()),
                "model_version": scenario["model"],
                "temperature": 0.7 if template["operation"] == "llm_call" else None
            }
        }
        
        spans.append(span_data)
        current_time = end_time
    
    return spans


async def create_demo_events(trace_id: uuid.UUID, spans: List[dict]) -> List[dict]:
    """Create demo events for traces and spans"""
    events = []
    
    # Trace-level events
    events.append({
        "event_id": uuid.uuid4(),
        "trace_id": trace_id,
        "span_id": None,
        "timestamp": spans[0]["start_time"] if spans else datetime.utcnow(),
        "level": "INFO",
        "message": "Trace started",
        "event_metadata": {"trace_id": str(trace_id)}
    })
    
    # Span-level events
    for span in spans:
        if span["status"] == "ERROR":
            events.append({
                "event_id": uuid.uuid4(),
                "trace_id": trace_id,
                "span_id": span["span_id"],
                "timestamp": span["end_time"],
                "level": "ERROR",
                "message": f"Error in {span['operation']}: Authentication failed",
                "event_metadata": {
                    "error_code": "AUTH_FAILED",
                    "operation": span["operation"]
                }
            })
        elif span["status"] == "RATE_LIMIT":
            events.append({
                "event_id": uuid.uuid4(),
                "trace_id": trace_id,
                "span_id": span["span_id"],
                "timestamp": span["end_time"],
                "level": "WARN",
                "message": f"Rate limit hit in {span['operation']}",
                "event_metadata": {
                    "retry_after": 60,
                    "operation": span["operation"]
                }
            })
    
    # Trace completion event
    events.append({
        "event_id": uuid.uuid4(),
        "trace_id": trace_id,
        "span_id": None,
        "timestamp": spans[-1]["end_time"] if spans else datetime.utcnow(),
        "level": "INFO",
        "message": "Trace completed",
        "event_metadata": {"total_spans": len(spans)}
    })
    
    return events


async def load_demo_data():
    """Load all demo data into the database"""
    
    # Create async engine
    engine = create_async_engine(
        settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
        echo=False
    )
    
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        try:
            print("Creating demo traces...")
            demo_traces = await create_demo_traces()
            
            # Create demo scenarios for spans
            demo_scenarios = [
                {
                    "operation": "customer_query_resolution",
                    "model": "gpt-4",
                    "duration": 2.3,
                    "tokens": 1247,
                    "cost": 0.087,
                    "status": "OK",
                    "spans_count": 3
                },
                {
                    "operation": "code_review_assistant", 
                    "model": "claude-3-sonnet",
                    "duration": 5.7,
                    "tokens": 3891,
                    "cost": 0.234,
                    "status": "OK",
                    "spans_count": 5
                },
                {
                    "operation": "document_summarization",
                    "model": "gpt-3.5-turbo",
                    "duration": 1.2,
                    "tokens": 2156,
                    "cost": 0.032,
                    "status": "OK",
                    "spans_count": 2
                },
                {
                    "operation": "rate_limited_request",
                    "model": "gpt-4",
                    "duration": 0.1,
                    "tokens": 0,
                    "cost": 0.0,
                    "status": "RATE_LIMIT",
                    "spans_count": 1
                },
                {
                    "operation": "failed_authentication",
                    "model": "gpt-4",
                    "duration": 0.05,
                    "tokens": 0,
                    "cost": 0.0,
                    "status": "ERROR",
                    "spans_count": 1
                },
                {
                    "operation": "large_document_processing",
                    "model": "gpt-4-turbo",
                    "duration": 12.4,
                    "tokens": 8247,
                    "cost": 0.412,
                    "status": "OK",
                    "spans_count": 7
                },
                {
                    "operation": "multi_model_workflow",
                    "model": "gpt-4",
                    "duration": 4.1,
                    "tokens": 2847,
                    "cost": 0.156,
                    "status": "OK",
                    "spans_count": 4
                }
            ]
            
            for i, trace_data in enumerate(demo_traces):
                # Create trace
                trace = Trace(**trace_data)
                session.add(trace)
                
                # Create spans for this trace
                scenario = demo_scenarios[i % len(demo_scenarios)]
                spans_data = await create_demo_spans(
                    trace_data["trace_id"], 
                    scenario, 
                    trace_data["timestamp"]
                )
                
                for span_data in spans_data:
                    span = Span(**span_data)
                    session.add(span)
                
                # Create events for this trace
                events_data = await create_demo_events(trace_data["trace_id"], spans_data)
                for event_data in events_data:
                    event = TraceEvent(**event_data)
                    session.add(event)
                
                print(f"Created trace {i+1}/{len(demo_traces)}: {trace_data['trace_id']}")
            
            await session.commit()
            print(f"✅ Successfully loaded {len(demo_traces)} demo traces with spans and events!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error loading demo data: {e}")
            raise
        finally:
            await session.close()
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(load_demo_data())
