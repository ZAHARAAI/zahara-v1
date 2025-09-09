#!/usr/bin/env python3
"""
Simple demo data loader using synchronous database connection
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from app.config import settings
from app.models.trace import Span, Trace, TraceEvent
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def create_simple_demo_data():
    """Create simple demo data"""

    # Create synchronous engine
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        print("Creating demo traces...")

        # Create a few demo traces
        base_time = datetime.utcnow() - timedelta(hours=1)

        traces_data = [
            {
                "operation": "customer_query_resolution",
                "model": "gpt-4",
                "duration": 2.3,
                "tokens": 1247,
                "cost": 0.087,
                "status": "OK",
            },
            {
                "operation": "code_review_assistant",
                "model": "claude-3-sonnet",
                "duration": 5.7,
                "tokens": 3891,
                "cost": 0.234,
                "status": "OK",
            },
            {
                "operation": "document_summarization",
                "model": "gpt-3.5-turbo",
                "duration": 1.2,
                "tokens": 2156,
                "cost": 0.032,
                "status": "OK",
            },
            {
                "operation": "rate_limited_request",
                "model": "gpt-4",
                "duration": 0.1,
                "tokens": 0,
                "cost": 0.0,
                "status": "RATE_LIMIT",
            },
            {
                "operation": "failed_authentication",
                "model": "gpt-4",
                "duration": 0.05,
                "tokens": 0,
                "cost": 0.0,
                "status": "ERROR",
            },
        ]

        for i, trace_info in enumerate(traces_data * 7):  # Create 35 traces
            trace_id = uuid.uuid4()
            timestamp = base_time + timedelta(minutes=i * 2)

            # Create trace
            trace = Trace(
                trace_id=trace_id,
                timestamp=timestamp,
                total_duration=trace_info["duration"],
                total_tokens=trace_info["tokens"],
                total_cost=Decimal(str(trace_info["cost"])),
                status=trace_info["status"],
                model=trace_info["model"],
                operation=trace_info["operation"],
                user_id=f"user_{(i % 5) + 1}",
                workflow_id=f"workflow_{trace_info['operation']}",
            )
            session.add(trace)

            # Create a few spans for each trace
            span_start = timestamp
            for j in range(3):  # 3 spans per trace
                span_id = uuid.uuid4()
                span_duration = trace_info["duration"] / 3
                span_end = span_start + timedelta(seconds=span_duration)

                span = Span(
                    span_id=span_id,
                    trace_id=trace_id,
                    start_time=span_start,
                    end_time=span_end,
                    duration=span_duration,
                    status=trace_info["status"],
                    model=trace_info["model"],  # Always include model
                    tokens=int(trace_info["tokens"] / 3)
                    if trace_info["tokens"] > 0
                    else 0,
                    cost=Decimal(str(trace_info["cost"] / 3))
                    if trace_info["cost"] > 0
                    else Decimal("0.0"),
                    operation=["input_validation", "llm_call", "output_formatting"][j],
                    provider="openai" if "gpt" in trace_info["model"] else "anthropic",
                    span_metadata={"request_id": str(uuid.uuid4()), "span_index": j},
                )
                session.add(span)

                # Create an event for each span
                event = TraceEvent(
                    event_id=uuid.uuid4(),
                    trace_id=trace_id,
                    span_id=span_id,
                    timestamp=span_end,
                    level="INFO" if trace_info["status"] == "OK" else "ERROR",
                    message=f"Completed {span.operation}",
                    event_metadata={
                        "operation": span.operation,
                        "status": trace_info["status"],
                    },
                )
                session.add(event)

                span_start = span_end

            print(f"Created trace {i + 1}: {trace_id}")

        session.commit()
        print("✅ Successfully loaded demo data!")

    except Exception as e:
        session.rollback()
        print(f"❌ Error loading demo data: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    create_simple_demo_data()
