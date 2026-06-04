from fastapi import FastAPI, Query
from src.backend.search_service import SearchService
from src.backend.config import DEFAULT_TOP_K

app = FastAPI(
    title="WikiSearch API",
    description="API for searching-PRJ SEG",
    version="1.0.0"
)
search_service = SearchService()

@app.get("/")
def read_root():
    return {"Status":"Backend is stably running!"}
@app.get("/search")
def search_wiki(
    q: str = Query(..., description="Retrieval finding sentence"),
    k: int = Query(DEFAULT_TOP_K, description="The total of returning result:")
):
    return search_service.search(query=q, top_k=k)