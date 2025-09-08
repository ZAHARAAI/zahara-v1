import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.api_key_auth import api_key_auth
from ..services.trace_service import TraceService

router = APIRouter(prefix="/traces", tags=["traces"])


# Request/Response models
class TraceFilters(BaseModel):
    status: Optional[List[str]] = None
    models: Optional[List[str]] = None
    operations: Optional[List[str]] = None
    search: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ExportOptions(BaseModel):
    includeSpans: Optional[bool] = True
    includeEvents: Optional[bool] = True
    includeMetadata: Optional[bool] = False


class ExportRequest(BaseModel):
    format: str = "csv"
    filters: Optional[TraceFilters] = None
    trace_ids: Optional[List[str]] = None
    options: Optional[ExportOptions] = None


class TraceResponse(BaseModel):
    trace_id: str
    timestamp: datetime
    total_duration: float
    total_tokens: int
    total_cost: float
    status: str
    model: str
    operation: str
    user_id: Optional[str] = None
    workflow_id: Optional[str] = None


class TracePagination(BaseModel):
    page: int
    limit: int
    total: int
    hasNext: bool
    hasPrev: bool


class TraceListResponse(BaseModel):
    traces: List[dict]
    pagination: TracePagination
    filters: dict


@router.get("/", response_model=TraceListResponse)
async def get_traces(
    page: int = Query(1, ge=1, description="Page number for pagination"),
    page_size: int = Query(25, ge=1, le=100, description="Number of traces per page"),
    limit: int = Query(
        25, ge=1, le=100, description="Alias for page_size (backward compatibility)"
    ),
    status: Optional[str] = Query(
        None, description="Comma-separated list of statuses (OK/ERROR/RATE-LIMIT)"
    ),
    model: Optional[str] = Query(
        None, description="Comma-separated list of models to filter by"
    ),
    models: Optional[str] = Query(
        None, description="Alias for model (backward compatibility)"
    ),
    operations: Optional[str] = Query(
        None, description="Comma-separated list of operations"
    ),
    search: Optional[str] = Query(None, description="Search term across trace data"),
    start_date: Optional[datetime] = Query(
        None, description="Start date filter (ISO format)"
    ),
    end_date: Optional[datetime] = Query(
        None, description="End date filter (ISO format)"
    ),
    sort_by: str = Query(
        "timestamp",
        description="Field to sort by (timestamp/duration/tokens/cost/status)",
    ),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth),
):
    """Get traces with filtering, sorting, and pagination"""
    try:
        trace_service = TraceService(db)

        # Parse comma-separated lists
        status_list = status.split(",") if status else None
        # Use model parameter first, fallback to models for backward compatibility
        model_param = model or models
        models_list = model_param.split(",") if model_param else None
        operations_list = operations.split(",") if operations else None

        # Use page_size parameter first, fallback to limit for backward compatibility
        effective_limit = page_size if page_size != 25 else limit

        result = trace_service.get_traces(
            page=page,
            limit=effective_limit,
            status=status_list,
            models=models_list,
            operations=operations_list,
            search=search,
            start_date=start_date,
            end_date=end_date,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        return TraceListResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get traces: {str(e)}")


@router.get("/{trace_id}")
async def get_trace(
    trace_id: str, db: Session = Depends(get_db), api_key: str = Depends(api_key_auth)
):
    """Get a single trace with all related data"""
    try:
        trace_service = TraceService(db)
        trace = trace_service.get_trace(trace_id)

        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Convert to dict and include related data
        trace_dict = trace.to_dict()

        # Add aggregate metrics
        if trace.spans:
            total_spans = len(trace.spans)
            success_spans = len([s for s in trace.spans if s.status == "OK"])
            success_rate = (success_spans / total_spans * 100) if total_spans > 0 else 0

            avg_duration = (
                sum(s.duration for s in trace.spans) / total_spans
                if total_spans > 0
                else 0
            )
            durations = sorted([s.duration for s in trace.spans])
            p50_duration = durations[len(durations) // 2] if durations else 0
            p95_duration = durations[int(len(durations) * 0.95)] if durations else 0

            trace_dict["aggregate_metrics"] = {
                "total_spans": total_spans,
                "success_rate": round(success_rate, 1),
                "avg_duration": round(avg_duration, 2),
                "p50_duration": round(p50_duration, 2),
                "p95_duration": round(p95_duration, 2),
                "total_tokens": trace.total_tokens,
                "total_cost": trace.total_cost,
                "error_count": len([s for s in trace.spans if s.status == "ERROR"]),
                "rate_limit_count": len(
                    [s for s in trace.spans if s.status == "RATE-LIMIT"]
                ),
            }

        return {"success": True, "data": trace_dict}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get trace: {str(e)}")


@router.get("/{trace_id}/spans")
async def get_trace_spans(
    trace_id: str, db: Session = Depends(get_db), api_key: str = Depends(api_key_auth)
):
    """Get all spans for a specific trace"""
    try:
        trace_service = TraceService(db)

        # Check if trace exists
        trace = trace_service.get_trace(trace_id)
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        spans = trace_service.get_trace_spans(trace_id)

        return {"success": True, "data": [span.to_dict() for span in spans]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get trace spans: {str(e)}"
        )


@router.post("/export")
async def export_traces_post(
    request: ExportRequest,
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth),
):
    """Export traces as CSV (POST with request body)"""
    return await _export_traces_impl(request, db)


@router.get("/export")
async def export_traces_get(
    format: str = Query("csv", description="Export format"),
    status: Optional[str] = Query(None, description="Comma-separated status filters"),
    models: Optional[str] = Query(None, description="Comma-separated model filters"),
    operations: Optional[str] = Query(
        None, description="Comma-separated operation filters"
    ),
    search: Optional[str] = Query(None, description="Search term"),
    include_spans: bool = Query(True, description="Include span details"),
    include_events: bool = Query(True, description="Include events"),
    include_metadata: bool = Query(False, description="Include metadata"),
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth),
):
    """Export traces as CSV (GET with query parameters)"""
    # Convert query parameters to ExportRequest format
    filters = {}
    if status:
        filters["status"] = [s.strip() for s in status.split(",")]
    if models:
        filters["models"] = [m.strip() for m in models.split(",")]
    if operations:
        filters["operations"] = [o.strip() for o in operations.split(",")]
    if search:
        filters["search"] = search

    options = {
        "includeSpans": include_spans,
        "includeEvents": include_events,
        "includeMetadata": include_metadata,
    }

    request = ExportRequest(
        format=format, filters=filters if filters else None, options=options
    )

    return await _export_traces_impl(request, db)


async def _export_traces_impl(request: ExportRequest, db: Session):
    """Export traces as CSV"""
    try:
        if request.format.lower() != "csv":
            raise HTTPException(status_code=400, detail="Only CSV format is supported")

        trace_service = TraceService(db)

        # Prepare filters
        filters = {}
        if request.filters:
            if request.filters.status:
                filters["status"] = request.filters.status
            if request.filters.models:
                filters["models"] = request.filters.models
            if request.filters.operations:
                filters["operations"] = request.filters.operations
            if request.filters.search:
                filters["search"] = request.filters.search
            if request.filters.start_date:
                filters["start_date"] = request.filters.start_date
            if request.filters.end_date:
                filters["end_date"] = request.filters.end_date

        # Prepare export options
        export_options = {}
        if request.options:
            export_options["include_spans"] = request.options.includeSpans
            export_options["include_events"] = request.options.includeEvents
            export_options["include_metadata"] = request.options.includeMetadata

        # Generate CSV
        csv_content = trace_service.export_traces_csv(
            trace_ids=request.trace_ids, **filters, **export_options
        )

        # Create filename
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"zahara_traces_{timestamp}.csv"

        # Return as streaming response
        def iter_csv():
            yield csv_content

        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to export traces: {str(e)}"
        )


@router.get("/metrics/aggregate")
async def get_aggregate_metrics(
    hours: int = Query(24, description="Time range in hours"),
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth),
):
    """Get aggregate metrics for the dashboard"""
    try:
        trace_service = TraceService(db)
        metrics = trace_service.get_dashboard_metrics(hours=hours)

        return {"success": True, "data": metrics}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")


# Internal endpoints for creating traces (used by middleware)
@router.post("/internal/create")
async def create_trace_internal(trace_data: dict, db: Session = Depends(get_db)):
    """Internal endpoint for creating traces (called by middleware)"""
    try:
        trace_service = TraceService(db)

        trace = trace_service.create_trace(
            trace_id=trace_data.get("trace_id"),
            operation=trace_data.get("operation"),
            model=trace_data.get("model"),
            status=trace_data.get("status", "OK"),
            user_id=trace_data.get("user_id"),
            workflow_id=trace_data.get("workflow_id"),
            request_id=trace_data.get("request_id"),
            client_ip=trace_data.get("client_ip"),
            user_agent=trace_data.get("user_agent"),
            metadata=trace_data.get("metadata"),
        )

        return {"success": True, "data": trace.to_dict()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create trace: {str(e)}")


@router.post("/internal/{trace_id}/spans")
async def add_span_internal(
    trace_id: str, span_data: dict, db: Session = Depends(get_db)
):
    """Internal endpoint for adding spans to traces"""
    try:
        trace_service = TraceService(db)

        span = trace_service.add_span(
            trace_id=trace_id,
            span_id=span_data.get("span_id"),
            operation=span_data.get("operation"),
            model=span_data.get("model"),
            provider=span_data.get("provider"),
            start_time=datetime.fromisoformat(span_data.get("start_time")),
            end_time=datetime.fromisoformat(span_data.get("end_time")),
            status=span_data.get("status", "OK"),
            tokens=span_data.get("tokens", 0),
            cost=span_data.get("cost", 0.0),
            metadata=span_data.get("metadata"),
        )

        return {"success": True, "data": span.to_dict()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add span: {str(e)}")


@router.post("/internal/{trace_id}/events")
async def add_event_internal(
    trace_id: str, event_data: dict, db: Session = Depends(get_db)
):
    """Internal endpoint for adding events to traces"""
    try:
        trace_service = TraceService(db)

        event = trace_service.add_event(
            trace_id=trace_id,
            level=event_data.get("level"),
            message=event_data.get("message"),
            span_id=event_data.get("span_id"),
            metadata=event_data.get("metadata"),
        )

        return {"success": True, "data": event.to_dict()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add event: {str(e)}")
