import time
import chromadb
from chromadb.utils import embedding_functions
from src.backend.config import VDB_PATH, EMBEDDING_MODEL_NAME, COLLECTION_NAME

class SearchService:
    def __init__(self):
        self.cilent = chromadb.PersistentClient(path=VDB_PATH)
        self.ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL_NAME)
        self.collection = self.cilent.get_collection(
            name = COLLECTION_NAME,
            embedding_function= self.ef
        )

    def search(self, query:str, top_k=5):
        start_time = time.time()
        res = self.collection.query(
            query_texts= query,
            n_results= top_k
        )
        end_time = time.time()
        processed_time_ms = round((end_time - start_time) * 1000, 2)

        formatted_res = []
        if res["documents"] and len(res["documents"][0]) > 0:
            for i in range(len(res["documents"][0])):
                formatted_res.append({
                        "title": res["metadatas"][0][i]["title"],
                        "url" : res["metadatas"][0][i]["url"],
                        "content" : res["documents"][0][i],
                        "distance_score": res["distances"][0][i]
                    })
        return {
            "query" :query,
            "processing time" : processed_time_ms,
            "total result" : len(formatted_res),
            "data" : formatted_res
        }