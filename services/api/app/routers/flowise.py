from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.api_key_auth import api_key_auth
from ..services.trace_service import TraceService
from ..services.flowise_bridge_service import FlowiseBridgeService
from ..models.trace import FlowiseExecution

router = APIRouter(prefix="/flowise", tags=["flowise"])

class FlowiseExecutionResponse(BaseModel):
    execution_id: str
    workflow_id: str
    trace_id: str
    timestamp: str
    status: str
    flowise_data: dict

@router.get("/executions", response_model=List[FlowiseExecutionResponse])
async def get_flowise_executions(
    limit: int = 100,
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth)
):
    """Get recent Flowise workflow executions"""
    try:
        trace_service = TraceService(db)
        executions = trace_service.get_flowise_executions(limit=limit)
        
        return [
            FlowiseExecutionResponse(
                execution_id=exec.execution_id,
                workflow_id=exec.workflow_id,
                trace_id=exec.trace_id,
                timestamp=exec.timestamp.isoformat(),
                status=exec.status,
                flowise_data=exec.flowise_data or {}
            )
            for exec in executions
        ]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get Flowise executions: {str(e)}")

@router.post("/executions")
async def create_flowise_execution(
    execution_data: dict,
    db: Session = Depends(get_db)
):
    """Create a new Flowise execution record (internal use)"""
    try:
        trace_service = TraceService(db)
        
        execution = trace_service.create_flowise_execution(
            workflow_id=execution_data.get('workflow_id'),
            trace_id=execution_data.get('trace_id'),
            flowise_data=execution_data.get('flowise_data', {}),
            status=execution_data.get('status', 'OK')
        )
        
        return {
            "success": True,
            "data": execution.to_dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create Flowise execution: {str(e)}")

@router.get("/workflows/{workflow_id}/executions")
async def get_workflow_executions(
    workflow_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    api_key: str = Depends(api_key_auth)
):
    """Get executions for a specific workflow"""
    try:
        executions = db.query(FlowiseExecution).filter(
            FlowiseExecution.workflow_id == workflow_id
        ).order_by(FlowiseExecution.timestamp.desc()).limit(limit).all()
        
        return {
            "success": True,
            "data": [exec.to_dict() for exec in executions]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get workflow executions: {str(e)}")

# Webhook endpoints for receiving Flowise data
@router.post("/webhook/run")
async def receive_langchain_run(
    run_data: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint to receive LangChain Run data from Flowise EvaluationRunTracer
    Processes the run asynchronously to create Agent Clinic traces
    """
    try:
        evaluation_run_id = run_data.get('evaluation_run_id', 'unknown')
        
        # Process the run in the background to avoid blocking Flowise
        background_tasks.add_task(
            process_flowise_run_background,
            run_data,
            evaluation_run_id,
            db
        )
        
        return {
            "success": True,
            "message": "LangChain run received and queued for processing",
            "evaluation_run_id": evaluation_run_id
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to process LangChain run: {str(e)}"
        }

@router.post("/webhook/metrics")
async def receive_evaluation_metrics(
    metrics_data: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint to receive evaluation metrics from Flowise EvaluationRunner
    """
    try:
        evaluation_run_id = metrics_data.get('evaluation_run_id', 'unknown')
        metrics = metrics_data.get('metrics', [])
        
        # Process the metrics in the background
        background_tasks.add_task(
            process_flowise_metrics_background,
            evaluation_run_id,
            metrics,
            db
        )
        
        return {
            "success": True,
            "message": "Evaluation metrics received and queued for processing",
            "evaluation_run_id": evaluation_run_id,
            "metrics_count": len(metrics)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to process evaluation metrics: {str(e)}"
        }

# Background task functions
async def process_flowise_run_background(
    run_data: Dict[str, Any],
    evaluation_run_id: str,
    db: Session
):
    """Process Flowise LangChain run in the background"""
    try:
        bridge_service = FlowiseBridgeService(db)
        trace_id = bridge_service.process_langchain_run(run_data, evaluation_run_id)
        print(f"Successfully processed Flowise run {run_data.get('id')} -> trace {trace_id}")
        
    except Exception as e:
        print(f"Error processing Flowise run: {str(e)}")

async def process_flowise_metrics_background(
    evaluation_run_id: str,
    metrics: List[str],
    db: Session
):
    """Process Flowise evaluation metrics in the background"""
    try:
        bridge_service = FlowiseBridgeService(db)
        bridge_service.process_evaluation_metrics(evaluation_run_id, metrics)
        print(f"Successfully processed {len(metrics)} metrics for evaluation {evaluation_run_id}")
        
    except Exception as e:
        print(f"Error processing Flowise metrics: {str(e)}")
