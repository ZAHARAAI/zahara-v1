from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, asc, func, text
from sqlalchemy.exc import SQLAlchemyError

from ..models.trace import Trace, Span, TraceEvent, FlowiseExecution
from ..database import get_db


class TraceService:
    """Service for handling trace operations"""
    
    def __init__(self, db: Session = None):
        self.db = db
    
    def create_trace(
        self,
        trace_id: str,
        operation: str,
        model: str,
        status: str = 'OK',
        user_id: str = None,
        workflow_id: str = None,
        request_id: str = None,
        client_ip: str = None,
        user_agent: str = None,
        metadata: Dict[str, Any] = None
    ) -> Trace:
        """Create a new trace"""
        try:
            trace = Trace(
                trace_id=trace_id,
                operation=operation,
                model=model,
                status=status,
                user_id=user_id,
                workflow_id=workflow_id,
                request_id=request_id,
                client_ip=client_ip,
                user_agent=user_agent,
                metadata=metadata,
                timestamp=datetime.utcnow()
            )
            
            self.db.add(trace)
            self.db.commit()
            self.db.refresh(trace)
            return trace
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise Exception(f"Failed to create trace: {str(e)}")
    
    def add_span(
        self,
        trace_id: str,
        span_id: str,
        operation: str,
        model: str,
        provider: str,
        start_time: datetime,
        end_time: datetime,
        status: str = 'OK',
        tokens: int = 0,
        cost: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> Span:
        """Add a span to an existing trace"""
        try:
            duration = (end_time - start_time).total_seconds() * 1000  # Convert to milliseconds
            
            span = Span(
                span_id=span_id,
                trace_id=trace_id,
                operation=operation,
                model=model,
                provider=provider,
                start_time=start_time,
                end_time=end_time,
                duration=duration,
                status=status,
                tokens=tokens,
                cost=cost,
                metadata=metadata
            )
            
            self.db.add(span)
            
            # Update trace totals
            trace = self.db.query(Trace).filter(Trace.trace_id == trace_id).first()
            if trace:
                trace.total_duration += duration
                trace.total_tokens += tokens
                trace.total_cost += cost
                
                # Update trace status if span failed
                if status != 'OK' and trace.status == 'OK':
                    trace.status = status
            
            self.db.commit()
            self.db.refresh(span)
            return span
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise Exception(f"Failed to add span: {str(e)}")
    
    def add_event(
        self,
        trace_id: str,
        level: str,
        message: str,
        span_id: str = None,
        metadata: Dict[str, Any] = None
    ) -> TraceEvent:
        """Add an event to a trace"""
        try:
            event = TraceEvent(
                trace_id=trace_id,
                span_id=span_id,
                level=level,
                message=message,
                metadata=metadata,
                timestamp=datetime.utcnow()
            )
            
            self.db.add(event)
            self.db.commit()
            self.db.refresh(event)
            return event
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise Exception(f"Failed to add event: {str(e)}")
    
    def get_traces(
        self,
        page: int = 1,
        limit: int = 25,
        status: List[str] = None,
        models: List[str] = None,
        operations: List[str] = None,
        search: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        sort_by: str = 'timestamp',
        sort_order: str = 'desc'
    ) -> Dict[str, Any]:
        """Get traces with filtering and pagination"""
        try:
            query = self.db.query(Trace)
            
            # Apply filters
            if status:
                query = query.filter(Trace.status.in_(status))
            
            if models:
                query = query.filter(Trace.model.in_(models))
            
            if operations:
                query = query.filter(Trace.operation.in_(operations))
            
            if search:
                search_filter = or_(
                    Trace.trace_id.ilike(f'%{search}%'),
                    Trace.operation.ilike(f'%{search}%'),
                    Trace.model.ilike(f'%{search}%')
                )
                query = query.filter(search_filter)
            
            if start_date:
                query = query.filter(Trace.timestamp >= start_date)
            
            if end_date:
                query = query.filter(Trace.timestamp <= end_date)
            
            # Apply sorting
            if sort_order.lower() == 'desc':
                query = query.order_by(desc(getattr(Trace, sort_by)))
            else:
                query = query.order_by(asc(getattr(Trace, sort_by)))
            
            # Get total count
            total = query.count()
            
            # Apply pagination
            offset = (page - 1) * limit
            traces = query.offset(offset).limit(limit).all()
            
            return {
                'traces': [trace.to_dict() for trace in traces],
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'total': total,
                    'hasNext': offset + limit < total,
                    'hasPrev': page > 1
                },
                'filters': {
                    'status': status,
                    'models': models,
                    'operations': operations,
                    'search': search,
                    'dateRange': {
                        'start': start_date.isoformat() if start_date else None,
                        'end': end_date.isoformat() if end_date else None
                    }
                }
            }
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to get traces: {str(e)}")
    
    def get_trace(self, trace_id: str) -> Optional[Trace]:
        """Get a single trace with all related data"""
        try:
            trace = self.db.query(Trace).filter(Trace.trace_id == trace_id).first()
            return trace
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to get trace: {str(e)}")
    
    def get_trace_spans(self, trace_id: str) -> List[Span]:
        """Get all spans for a trace"""
        try:
            spans = self.db.query(Span).filter(
                Span.trace_id == trace_id
            ).order_by(Span.start_time).all()
            
            return spans
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to get trace spans: {str(e)}")
    
    def get_dashboard_metrics(self, hours: int = 24) -> Dict[str, Any]:
        """Get aggregate metrics for dashboard"""
        try:
            # Calculate time range
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours)
            
            # Base query for the time range
            base_query = self.db.query(Trace).filter(
                Trace.timestamp >= start_time,
                Trace.timestamp <= end_time
            )
            
            # Total traces
            total_traces = base_query.count()
            
            # Success rate
            success_count = base_query.filter(Trace.status == 'OK').count()
            success_rate = (success_count / total_traces * 100) if total_traces > 0 else 0
            
            # Error rate
            error_count = base_query.filter(Trace.status == 'ERROR').count()
            error_rate = (error_count / total_traces * 100) if total_traces > 0 else 0
            
            # Rate limit rate
            rate_limit_count = base_query.filter(Trace.status == 'RATE-LIMIT').count()
            rate_limit_rate = (rate_limit_count / total_traces * 100) if total_traces > 0 else 0
            
            # Aggregate metrics
            metrics = self.db.query(
                func.avg(Trace.total_duration).label('avg_latency'),
                func.percentile_cont(0.5).within_group(Trace.total_duration).label('p50_latency'),
                func.percentile_cont(0.95).within_group(Trace.total_duration).label('p95_latency'),
                func.sum(Trace.total_tokens).label('total_tokens'),
                func.sum(Trace.total_cost).label('total_cost')
            ).filter(
                Trace.timestamp >= start_time,
                Trace.timestamp <= end_time
            ).first()
            
            # Top models
            top_models = self.db.query(
                Trace.model,
                func.count(Trace.trace_id).label('count'),
                func.avg(Trace.total_cost).label('avg_cost')
            ).filter(
                Trace.timestamp >= start_time,
                Trace.timestamp <= end_time
            ).group_by(Trace.model).order_by(desc('count')).limit(5).all()
            
            return {
                'total_traces_24h': total_traces,
                'avg_latency': float(metrics.avg_latency / 1000) if metrics.avg_latency else 0,  # Convert to seconds
                'p50_latency': float(metrics.p50_latency / 1000) if metrics.p50_latency else 0,
                'p95_latency': float(metrics.p95_latency / 1000) if metrics.p95_latency else 0,
                'success_rate': round(success_rate, 1),
                'error_rate': round(error_rate, 1),
                'rate_limit_rate': round(rate_limit_rate, 1),
                'total_tokens_24h': int(metrics.total_tokens) if metrics.total_tokens else 0,
                'total_cost_24h': float(metrics.total_cost) if metrics.total_cost else 0,
                'top_models': [
                    {
                        'model': model.model,
                        'count': model.count,
                        'avg_cost': float(model.avg_cost) if model.avg_cost else 0
                    }
                    for model in top_models
                ]
            }
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to get dashboard metrics: {str(e)}")
    
    def export_traces_csv(
        self,
        trace_ids: List[str] = None,
        include_spans: bool = True,
        include_events: bool = True,
        include_metadata: bool = False,
        **filters
    ) -> str:
        """Export traces to CSV format"""
        try:
            if trace_ids:
                query = self.db.query(Trace).filter(Trace.trace_id.in_(trace_ids))
            else:
                # Apply same filters as get_traces
                query = self.db.query(Trace)
                
                if filters.get('status'):
                    query = query.filter(Trace.status.in_(filters['status']))
                
                if filters.get('models'):
                    query = query.filter(Trace.model.in_(filters['models']))
                
                if filters.get('operations'):
                    query = query.filter(Trace.operation.in_(filters['operations']))
                
                if filters.get('search'):
                    search_term = f"%{filters['search']}%"
                    query = query.filter(
                        or_(
                            Trace.trace_id.ilike(search_term),
                            Trace.operation.ilike(search_term),
                            Trace.model.ilike(search_term)
                        )
                    )
                
                if filters.get('start_date'):
                    query = query.filter(Trace.timestamp >= filters['start_date'])
                
                if filters.get('end_date'):
                    query = query.filter(Trace.timestamp <= filters['end_date'])
            
            traces = query.order_by(desc(Trace.timestamp)).all()
            
            # Generate CSV
            import csv
            import io
            import json
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Prepare headers based on options
            headers = [
                'trace_id', 'timestamp', 'duration_ms', 'tokens', 'cost', 
                'status', 'model', 'operation', 'user_id', 'workflow_id'
            ]
            
            if include_metadata:
                headers.extend(['request_id', 'client_ip', 'user_agent', 'trace_metadata'])
            
            if include_spans:
                headers.extend([
                    'span_id', 'span_name', 'span_start_time', 'span_end_time', 
                    'span_duration_ms', 'span_status', 'span_tokens', 'span_cost'
                ])
                if include_metadata:
                    headers.append('span_metadata')
            
            if include_events:
                headers.extend([
                    'event_id', 'event_name', 'event_timestamp', 'event_level', 'event_message'
                ])
                if include_metadata:
                    headers.append('event_metadata')
            
            writer.writerow(headers)
            
            # Write data
            for trace in traces:
                base_data = [
                    trace.trace_id,
                    trace.timestamp.isoformat() if trace.timestamp else '',
                    trace.total_duration,
                    trace.total_tokens,
                    trace.total_cost,
                    trace.status,
                    trace.model,
                    trace.operation,
                    trace.user_id or '',
                    trace.workflow_id or ''
                ]
                
                if include_metadata:
                    base_data.extend([
                        trace.request_id or '',
                        trace.client_ip or '',
                        trace.user_agent or '',
                        json.dumps(trace.trace_metadata) if trace.trace_metadata else ''
                    ])
                
                if not include_spans and not include_events:
                    # Simple trace-only export
                    writer.writerow(base_data)
                else:
                    # Complex export with spans and/or events
                    spans = trace.spans if include_spans else []
                    events = trace.events if include_events else []
                    
                    if not spans and not events:
                        # Trace has no spans/events, still write base data
                        row_data = base_data[:]
                        if include_spans:
                            span_columns = 8 + (1 if include_metadata else 0)
                            row_data.extend([''] * span_columns)
                        if include_events:
                            event_columns = 5 + (1 if include_metadata else 0)
                            row_data.extend([''] * event_columns)
                        writer.writerow(row_data)
                    else:
                        # Write one row per span/event combination
                        max_items = max(len(spans), len(events))
                        for i in range(max_items):
                            row_data = base_data[:]
                            
                            # Add span data if available
                            if include_spans:
                                if i < len(spans):
                                    span = spans[i]
                                    row_data.extend([
                                        span.span_id,
                                        span.name,
                                        span.start_time.isoformat() if span.start_time else '',
                                        span.end_time.isoformat() if span.end_time else '',
                                        span.duration,
                                        span.status,
                                        span.tokens,
                                        span.cost
                                    ])
                                    if include_metadata:
                                        row_data.append(json.dumps(span.span_metadata) if span.span_metadata else '')
                                else:
                                    span_columns = 8 + (1 if include_metadata else 0)
                                    row_data.extend([''] * span_columns)
                            
                            # Add event data if available
                            if include_events:
                                if i < len(events):
                                    event = events[i]
                                    row_data.extend([
                                        event.event_id,
                                        event.name,
                                        event.timestamp.isoformat() if event.timestamp else '',
                                        event.level,
                                        event.message or ''
                                    ])
                                    if include_metadata:
                                        row_data.append(json.dumps(event.event_metadata) if event.event_metadata else '')
                                else:
                                    event_columns = 5 + (1 if include_metadata else 0)
                                    row_data.extend([''] * event_columns)
                            
                            writer.writerow(row_data)
            
            return output.getvalue()
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to export traces: {str(e)}")
    
    def create_flowise_execution(
        self,
        workflow_id: str,
        trace_id: str,
        flowise_data: Dict[str, Any],
        status: str = 'OK'
    ) -> FlowiseExecution:
        """Create a Flowise execution record"""
        try:
            execution = FlowiseExecution(
                workflow_id=workflow_id,
                trace_id=trace_id,
                flowise_data=flowise_data,
                status=status,
                timestamp=datetime.utcnow()
            )
            
            self.db.add(execution)
            self.db.commit()
            self.db.refresh(execution)
            return execution
            
        except SQLAlchemyError as e:
            self.db.rollback()
            raise Exception(f"Failed to create Flowise execution: {str(e)}")
    
    def get_flowise_executions(self, limit: int = 100) -> List[FlowiseExecution]:
        """Get recent Flowise executions"""
        try:
            executions = self.db.query(FlowiseExecution).order_by(
                desc(FlowiseExecution.timestamp)
            ).limit(limit).all()
            
            return executions
            
        except SQLAlchemyError as e:
            raise Exception(f"Failed to get Flowise executions: {str(e)}")
