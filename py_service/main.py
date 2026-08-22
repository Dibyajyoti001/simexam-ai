import os
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import logging

from schemas.types import (
    EvalRequest, EvalResponse,
    IngestRequest, IngestResponse,
    RetrieveRequest, RetrieveResponse,
    AnalyseRequest, AnalyseResponse,
    BehaviouralRequest, BehaviouralResponse
)
from middleware.security import verify_service_key

from agents.evaluator import Evaluator
from agents.rag_agent import retrieve_relevant
from agents.behavioural_agent import score_behaviour
from tools.ast_analyser import ASTAnalyser
from ingest.extractor import extract_text
from ingest.chunker import chunk_text
from ingest.embedder import embed_batch
from tools.embedding_store import EmbeddingStore

app = FastAPI(title="SimExam AI - Eval Service", version="2.0")
logger = logging.getLogger("simexam-python")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "simexam-py-service"}

@app.post("/eval", dependencies=[Depends(verify_service_key)])
async def evaluate(request: EvalRequest) -> EvalResponse:
    try:
        evaluator = Evaluator()
        return await evaluator.evaluate(request)
    except Exception as e:
        logger.error(f"Eval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest", dependencies=[Depends(verify_service_key)])
async def ingest(request: IngestRequest) -> IngestResponse:
    try:
        # Decode base64
        import base64
        content = base64.b64decode(request.content_base64)
        
        text = extract_text(content, request.mime_type)
        if not text:
            return IngestResponse(doc_id=request.doc_id, status="error", chunk_count=0)
            
        chunks = chunk_text(text, request.mime_type)
        if not chunks:
            return IngestResponse(doc_id=request.doc_id, status="ready", chunk_count=0)
            
        embeddings = await embed_batch([c.content for c in chunks])
        
        db_url = os.environ.get("DATABASE_URL")
        if db_url:
            store = EmbeddingStore(db_url)
            await store.insert_chunks(chunks, embeddings, request.doc_id, request.org_id, request.session_id)
            
        return IngestResponse(doc_id=request.doc_id, status="ready", chunk_count=len(chunks))
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/retrieve", dependencies=[Depends(verify_service_key)])
async def retrieve(request: RetrieveRequest) -> RetrieveResponse:
    try:
        db_url = os.environ.get("DATABASE_URL")
        chunks = await retrieve_relevant(request.query, request.org_id, request.session_id, request.k, db_url)
        return RetrieveResponse(chunks=chunks, query=request.query)
    except Exception as e:
        logger.error(f"Retrieve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyse", dependencies=[Depends(verify_service_key)])
async def analyse(request: AnalyseRequest) -> AnalyseResponse:
    try:
        analyser = ASTAnalyser()
        return analyser.analyse(request.code, request.language)
    except Exception as e:
        logger.error(f"Analyse error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/behavioural", dependencies=[Depends(verify_service_key)])
async def behavioural(request: BehaviouralRequest) -> BehaviouralResponse:
    try:
        return score_behaviour(request.events, request.config)
    except Exception as e:
        logger.error(f"Behavioural error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
