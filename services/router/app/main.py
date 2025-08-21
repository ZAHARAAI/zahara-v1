import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI app
app = FastAPI(
    title="Zahara Router Service",
    version="1.0.0",
    description="Router service for LLM request routing and load balancing",
    debug=True
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Zahara Router Service",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "service": "router"}

@app.post("/v1/chat/completions")
async def chat_completions():
    """OpenAI-compatible chat completions endpoint - returns 501 when no provider key"""
    raise HTTPException(
        status_code=501,
        detail="Not implemented: No provider API keys configured"
    )

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=7000, reload=True)

