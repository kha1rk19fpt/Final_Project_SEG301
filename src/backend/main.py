from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from src.backend.search_service import SearchService
from src.backend.config import DEFAULT_TOP_K
 
app = FastAPI(
    title="WikiSearch API",
    description="API for searching — PRJ SEG",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 
search_service = SearchService()
 
 
@app.get("/")
def read_root():
    return {"status": "Backend is running!", "version": "1.1.0"}
 
 
@app.get("/search")
def search_wiki(
    q: str = Query(..., description="Type a natural query'"),
    k: int = Query(DEFAULT_TOP_K, ge=1, le=20, description="Default: 5 documents"),
):
    return search_service.search(query=q, top_k=k)
 
 
@app.get("/health")
def health_check():
    index_size = len(search_service._full_text_index)
    try:
        collection_count = search_service.collection.count()
    except Exception as e:
        return {"status": "error", "detail": str(e)}
 
    return {
        "status": "ok",
        "collection_count": collection_count,
        "full_text_index_size": index_size,
    }