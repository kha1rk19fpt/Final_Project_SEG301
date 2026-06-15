import os
import time
import chromadb
from chromadb.utils import embedding_functions
from src.backend.config import VDB_PATH, EMBEDDING_MODEL_NAME, COLLECTION_NAME, BASE_DIR
from src.backend.utils.query_extraction import QueryExtraction
from src.backend.utils.md_formatter import MarkdownFormatter

class SearchService:
    def __init__(self):
        self.cilent = chromadb.PersistentClient(path=VDB_PATH)
        self.ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL_NAME)
        self.collection = self.cilent.get_collection(
            name = COLLECTION_NAME,
            embedding_function= self.ef
        )
        self.extraction = QueryExtraction()
        md_output_dir = os.path.join(BASE_DIR, 'data', 'markdown_docs')
        self.md_formatter = MarkdownFormatter(OUTPUT_DIR=md_output_dir)

    def search(self, query:str, top_k=5):
        start_time = time.time()
        extracted_text = self.extraction.extract(query)
        search_kw = extracted_text.get("search_keywords", query)
        res = self.collection.query(
            query_texts=[search_kw],
            n_results= top_k
        )
        
        formatted_res = []
        if res["documents"] and len(res["documents"][0]) > 0:
            for i in range(len(res["documents"][0])):
                doc_title = res["metadatas"][0][i].get('title', 'Unknown')
                doc_url = res["metadatas"][0][i].get('url', "")
                doc_content = res["documents"][0][i]
                md_path = self.md_formatter.save_to_markdown(title=doc_title, url=doc_url, content=doc_content, chunk_idx=i)
                formatted_res.append({
                    "title": doc_title,
                    "url": doc_url,
                    "content": md_path,
                    "distance_score": res["distances"][0][i]
                })
                
        end_time = time.time()
        processed_time_ms = round((end_time - start_time) * 1000, 2)
        return {
            "query": query,
            "extracted_context": extracted_text.get("context", ""),
            "optimized_search_keyword": search_kw,
            "processing time ms": processed_time_ms,
            "total result": len(formatted_res),
            "data": formatted_res
        }