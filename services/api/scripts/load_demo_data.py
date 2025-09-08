#!/usr/bin/env python3
"""
Demo Data Loader for Zahara.ai Agent Clinic
Loads realistic sample trace data matching client specifications
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any
import random
import json

from sqlalchemy.orm import Session
from app.database import get_db
from app.models.trace import Trace, Span, TraceEvent
from app.services.trace_service import TraceService


# Demo scenarios matching exact client specifications
DEMO_SCENARIOS = [
    {
        "operation": "customer_query_resolution",
        "model": "gpt-4",
        "duration": 2300,  # 2.3s
        "tokens": 1247,
        "cost": 0.087,
        "status": "OK",
        "spans": [
            {"name": "query_analysis", "duration": 800, "tokens": 456, "cost": 0.032},
            {"name": "knowledge_retrieval", "duration": 900, "tokens": 234, "cost": 0.016},
            {"name": "response_generation", "duration": 600, "tokens": 557, "cost": 0.039}
        ]
    },
    {
        "operation": "code_review_analysis", 
        "model": "claude-3-sonnet",
        "duration": 5700,  # 5.7s
        "tokens": 3891,
        "cost": 0.234,
        "status": "OK",
        "spans": [
            {"name": "code_parsing", "duration": 1200, "tokens": 892, "cost": 0.053},
            {"name": "security_scan", "duration": 1500, "tokens": 1023, "cost": 0.061},
            {"name": "style_check", "duration": 800, "tokens": 445, "cost": 0.027},
            {"name": "optimization_suggestions", "duration": 1400, "tokens": 876, "cost": 0.052},
            {"name": "report_generation", "duration": 800, "tokens": 655, "cost": 0.041}
        ]
    },
    {
        "operation": "document_summarization",
        "model": "gpt-3.5-turbo", 
        "duration": 1200,  # 1.2s
        "tokens": 2156,
        "cost": 0.032,
        "status": "OK",
        "spans": [
            {"name": "content_extraction", "duration": 500, "tokens": 1024, "cost": 0.015},
            {"name": "summary_generation", "duration": 700, "tokens": 1132, "cost": 0.017}
        ]
    },
    {
        "operation": "high_priority_query",
        "model": "gpt-4",
        "duration": 100,  # 0.1s - Rate limited
        "tokens": 0,
        "cost": 0.000,
        "status": "RATE-LIMIT",
        "spans": [
            {"name": "request_throttled", "duration": 100, "tokens": 0, "cost": 0.000}
        ]
    },
    {
        "operation": "protected_endpoint_access",
        "model": "N/A",
        "duration": 50,  # 0.05s - Auth failed
        "tokens": 0,
        "cost": 0.000,
        "status": "ERROR",
        "spans": [
            {"name": "auth_validation_failed", "duration": 50, "tokens": 0, "cost": 0.000}
        ]
    },
    {
        "operation": "legal_document_analysis",
        "model": "gpt-4-turbo",
        "duration": 12400,  # 12.4s
        "tokens": 8247,
        "cost": 0.412,
        "status": "OK",
        "spans": [
            {"name": "document_segmentation", "duration": 2000, "tokens": 1200, "cost": 0.060},
            {"name": "entity_extraction", "duration": 1800, "tokens": 1100, "cost": 0.055},
            {"name": "clause_analysis", "duration": 2200, "tokens": 1450, "cost": 0.073},
            {"name": "risk_assessment", "duration": 2100, "tokens": 1380, "cost": 0.069},
            {"name": "compliance_check", "duration": 1900, "tokens": 1267, "cost": 0.063},
            {"name": "summary_creation", "duration": 1400, "tokens": 950, "cost": 0.048},
            {"name": "report_formatting", "duration": 1000, "tokens": 900, "cost": 0.044}
        ]
    },
    {
        "operation": "content_creation_pipeline",
        "model": "gpt-4+claude-3",
        "duration": 4100,  # 4.1s - Multi-model
        "tokens": 2847,
        "cost": 0.156,
        "status": "OK",
        "spans": [
            {"name": "outline_generation", "duration": 1200, "tokens": 678, "cost": 0.034},
            {"name": "content_writing", "duration": 1500, "tokens": 1023, "cost": 0.051},
            {"name": "fact_checking", "duration": 800, "tokens": 567, "cost": 0.028},
            {"name": "final_polish", "duration": 600, "tokens": 579, "cost": 0.043}
        ]
    }
]

PROVIDERS = ["openai", "anthropic", "groq", "together", "replicate"]
USER_IDS = ["user_001", "user_002", "user_003", "user_004", "user_005"]
WORKFLOW_IDS = ["workflow_customer_support", "workflow_code_review", "workflow_content", "workflow_analysis"]


def generate_trace_data(scenario: Dict[str, Any], base_time: datetime) -> Dict[str, Any]:
    """Generate realistic trace data based on scenario"""
    
    trace_id = str(uuid.uuid4())
    
    # Add some realistic variation (±20%)
    duration_variance = random.uniform(0.8, 1.2)
    token_variance = random.uniform(0.9, 1.1)
    
    actual_duration = scenario["duration"] * duration_variance
    actual_tokens = int(scenario["tokens"] * token_variance)
    actual_cost = scenario["cost"] * token_variance
    
    # Generate spans
    spans = []
    current_time = base_time
    
    for i, span_config in enumerate(scenario["spans"]):
        span_duration = span_config["duration"] * duration_variance
        span_tokens = int(span_config["tokens"] * token_variance)
        span_cost = span_config["cost"] * token_variance
        
        span = {
            "span_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "name": span_config["name"],
            "start_time": current_time,
            "end_time": current_time + timedelta(milliseconds=span_duration),
            "duration": span_duration,
            "status": scenario["status"],
            "model": scenario["model"],
            "tokens": span_tokens,
            "cost": span_cost,
            "operation": span_config["name"],
            "provider": random.choice(PROVIDERS),
            "span_metadata": {
                "span_index": i,
                "parent_operation": scenario["operation"]
            }
        }
        spans.append(span)
        current_time += timedelta(milliseconds=span_duration)
    
    # Generate events
    events = []
    if scenario["status"] == "ERROR":
        events.append({
            "event_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "span_id": spans[-1]["span_id"] if spans else None,
            "timestamp": spans[-1]["end_time"] if spans else base_time,
            "level": "error",
            "message": f"Operation failed: {scenario['operation']}",
            "event_metadata": {"error_type": "processing_error"}
        })
    elif scenario["status"] == "RATE-LIMIT":
        events.append({
            "event_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "span_id": spans[0]["span_id"] if spans else None,
            "timestamp": base_time,
            "level": "warning", 
            "message": "Request rate limited",
            "event_metadata": {"rate_limit_type": "api_throttle"}
        })
    else:
        # Add some info events for successful traces
        events.append({
            "event_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "span_id": spans[0]["span_id"] if spans else None,
            "timestamp": base_time,
            "level": "info",
            "message": f"Started {scenario['operation']}",
            "event_metadata": {"operation_type": scenario["operation"]}
        })
    
    trace_data = {
        "trace_id": trace_id,
        "timestamp": base_time,
        "total_duration": actual_duration,
        "total_tokens": actual_tokens,
        "total_cost": actual_cost,
        "status": scenario["status"],
        "model": scenario["model"],
        "operation": scenario["operation"],
        "user_id": random.choice(USER_IDS),
        "workflow_id": random.choice(WORKFLOW_IDS),
        "request_id": f"req_{uuid.uuid4().hex[:8]}",
        "client_ip": f"192.168.1.{random.randint(1, 254)}",
        "user_agent": "Agent-Clinic-Demo/1.0",
        "trace_metadata": {
            "demo_scenario": True,
            "scenario_type": scenario["operation"],
            "generated_at": base_time.isoformat()
        },
        "spans": spans,
        "events": events
    }
    
    return trace_data


def load_demo_data():
    """Load demo data into the database"""
    print("🔄 Loading demo data for Zahara.ai Agent Clinic...")
    
    try:
        # Get database session
        db = next(get_db())
        trace_service = TraceService(db)
        
        # Clear existing demo data
        print("🧹 Clearing existing demo data...")
        db.query(TraceEvent).delete()
        db.query(Span).delete() 
        db.query(Trace).delete()
        db.commit()
        
        # Generate traces for the last 7 days
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=7)
        
        traces_created = 0
        
        # Create multiple instances of each scenario over time
        for day in range(7):
            day_start = start_time + timedelta(days=day)
            
            # Create 10-20 traces per day
            daily_traces = random.randint(10, 20)
            
            for _ in range(daily_traces):
                # Pick a random scenario
                scenario = random.choice(DEMO_SCENARIOS)
                
                # Random time during the day
                random_hour = random.randint(0, 23)
                random_minute = random.randint(0, 59)
                random_second = random.randint(0, 59)
                
                trace_time = day_start.replace(
                    hour=random_hour,
                    minute=random_minute, 
                    second=random_second
                )
                
                # Generate trace data
                trace_data = generate_trace_data(scenario, trace_time)
                
                # Create trace
                trace = Trace(
                    trace_id=trace_data["trace_id"],
                    timestamp=trace_data["timestamp"],
                    total_duration=trace_data["total_duration"],
                    total_tokens=trace_data["total_tokens"],
                    total_cost=trace_data["total_cost"],
                    status=trace_data["status"],
                    model=trace_data["model"],
                    operation=trace_data["operation"],
                    user_id=trace_data["user_id"],
                    workflow_id=trace_data["workflow_id"],
                    request_id=trace_data["request_id"],
                    client_ip=trace_data["client_ip"],
                    user_agent=trace_data["user_agent"],
                    trace_metadata=trace_data["trace_metadata"]
                )
                db.add(trace)
                
                # Create spans
                for span_data in trace_data["spans"]:
                    span = Span(
                        span_id=span_data["span_id"],
                        trace_id=span_data["trace_id"],
                        start_time=span_data["start_time"],
                        end_time=span_data["end_time"],
                        duration=span_data["duration"],
                        status=span_data["status"],
                        model=span_data["model"],
                        tokens=span_data["tokens"],
                        cost=span_data["cost"],
                        operation=span_data["operation"],
                        provider=span_data["provider"],
                        span_metadata=span_data["span_metadata"]
                    )
                    db.add(span)
                
                # Create events
                for event_data in trace_data["events"]:
                    event = TraceEvent(
                        event_id=event_data["event_id"],
                        trace_id=event_data["trace_id"],
                        span_id=event_data.get("span_id"),
                        timestamp=event_data["timestamp"],
                        level=event_data["level"],
                        message=event_data["message"],
                        event_metadata=event_data["event_metadata"]
                    )
                    db.add(event)
                
                traces_created += 1
                
                # Commit every 10 traces
                if traces_created % 10 == 0:
                    db.commit()
                    print(f"📊 Created {traces_created} demo traces...")
        
        # Final commit
        db.commit()
        
        print(f"✅ Successfully loaded {traces_created} demo traces!")
        print("🎯 Demo data includes:")
        print("   • Customer Support AI scenarios")
        print("   • Code Review Analysis traces")
        print("   • Document Summarization examples")
        print("   • Rate Limited requests")
        print("   • Authentication failures")
        print("   • Legal Document Analysis")
        print("   • Multi-Model workflows")
        print("")
        print("🚀 Agent Clinic is ready with realistic demo data!")
        
    except Exception as e:
        print(f"❌ Error loading demo data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    load_demo_data()
