import os
import time
import json
import chromadb
from collections import defaultdict
from chromadb.utils import embedding_functions
from src.backend.config import VDB_PATH, EMBEDDING_MODEL_NAME, COLLECTION_NAME, BASE_DIR, JSON_PATH
from src.backend.utils.query_extraction import QueryExtraction
from src.backend.utils.md_formatter import MarkdownFormatter
from src.backend.utils.bm25_kw_search import BM25Search
 
 
class SearchService:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=VDB_PATH)
        self.ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL_NAME)
        self.collection = self.client.get_collection(name=COLLECTION_NAME,embedding_function=self.ef)
        self.extraction = QueryExtraction()
        md_output_dir = os.path.join(BASE_DIR, 'data', 'markdown_docs')
        self.md_formatter = MarkdownFormatter(OUTPUT_DIR=md_output_dir)
        self.bm25 = BM25Search(json_path=JSON_PATH)
        self._full_text_index = self._build_full_text_index()

    def _build_full_text_index(self) -> dict:
        index = {}
        try:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            for article in data:
                url = article.get("url", "").strip()
                if url:
                    index[url] = {
                        "title": article.get("title", "Unknown title"),
                        "url": url,
                        "text": article.get("text", ""),
                    }
        except Exception as e:
            print(f"[SearchService] Warning: không load được full-text index: {e}")
        return index
    @staticmethod
    def _title_boost_score(query:str, title:str)->float:
        stop = {'what', 'is', 'the', 'a', 'an', 'how', 'why', 'who', 'does', 'do', 'are', 'was', 'were', 'about', '?', 'long'}
        query_word = set(query.lower().split()) - stop
        title_word = set(title.lower().split()) - stop
        if not query_word or not title_word:
            return 1.0
        intersection = query_word & title_word
        union = query_word | title_word
        jaccard = len(intersection) / len(union)
        return round(1.0 - jaccard * 0.35, 4)
    @staticmethod
    def _calc_weighted_score(distances: list[float]) -> dict:
        avg  = sum(distances) / len(distances)
        best = min(distances)
        weighted = round(best * 0.6 + avg * 0.4, 6)
        return {
            "weighted_score": weighted,
            "avg_score":      round(avg, 6),
            "best_score":     round(best, 6),
            "chunk_count":    len(distances),
        }
    @staticmethod
    def _rrf_merge(vector_articles: list, bm25_results: list, top_k: int, full_text_index: dict) -> list:
        RRF_K  = 60
        scores = {}
        data   = {}
        #vector result xep hang theo weighted score tang dan (sc cang thap -> distance cang ngan)
        for rank, art in enumerate(vector_articles, start=1):
            url = art["url"]
            scores[url] = scores.get(url, 0) + 1 / (RRF_K + rank)
            data[url]   = art
        # BM25 results xep hang theo b,25_score giam dan (sc cang cao -> cang co nhieu kw can tim kiem)
        for rank, res in enumerate(bm25_results, start=1):
            url = res["url"]
            scores[url] = scores.get(url, 0) + 1 / (RRF_K + rank)
            if url not in data:
                full = full_text_index.get(url, {})
                data[url] = {
                    "url": url,
                    "title": res["title"],
                    "score_info":{"weighted_score": 999, "best_score": 999, "avg_score": 999, "chunk_count": 0},
                    "chunk_texts":[],
                    "full_text":full.get("text", res["text"]),
                    "text_source":"bm25_only",
                }
        ranked = sorted(scores, key=lambda u: scores[u], reverse=True)
        return [data[url] for url in ranked[:top_k]]

    def search(self, query: str, top_k: int = 5) -> dict:
        start_time = time.time()
        extracted = self.extraction.extract(query)
        search_kw = extracted.get("search_keywords", query)
        fetch_n = max(top_k * 6, 30)
        res = self.collection.query(query_texts=[search_kw],n_results=fetch_n)
 
        grouped: dict[str, dict] = defaultdict(lambda: {
            "distances": [], "chunk_texts": [], "title": "", "url": ""
        })
 
        if res["documents"] and len(res["documents"][0]) > 0:
            docs = res["documents"][0]
            metas = res["metadatas"][0]
            distances = res["distances"][0]
 
            for doc_text, meta, dist in zip(docs, metas, distances):
                url   = meta.get("url", "")
                title = meta.get("title", "Unknown")
                if not url:
                    continue
                grouped[url]["url"]   = url
                grouped[url]["title"] = title
                grouped[url]["distances"].append(dist)
                grouped[url]["chunk_texts"].append(doc_text)
        scored_articles = []
        for url, group in grouped.items():
            score_info = self._calc_weighted_score(group["distances"])
            scored_articles.append({
                "url": url,
                "title": group["title"],
                "score_info": score_info,
                "chunk_texts":  group["chunk_texts"],
            })
        for article in scored_articles:
            boost = self._title_boost_score(query, article["title"])
            article["score_info"]["weighted_score"] = round(article["score_info"]["weighted_score"] * boost, 4)
            article["score_info"]["title_boost"] = boost
 
        scored_articles.sort(key=lambda x: x["score_info"]["weighted_score"])
        bm25_results = self.bm25.search(query, top_k=top_k * 3)
        top_articles = self._rrf_merge(scored_articles, bm25_results, top_k, self._full_text_index)
        formatted_res = []

        for rank, article in enumerate(top_articles, start=1):
            url = article["url"]
            title = article["title"]
            si = article["score_info"]
            full_data = self._full_text_index.get(url)
            if full_data and full_data.get("text"):
                full_text = full_data["text"]
                title= full_data["title"]
                text_source = "full_article"
            elif article.get("full_text"):
                full_text = article["full_text"]
                text_source = "bm25_only"
            else:
                full_text ="\n\n---\n\n".join(article["chunk_texts"])
                text_source ="merged_chunks"
            md_path = self.md_formatter.save_to_markdown(title=title, url=url, content=full_text, chunk_idx=rank)
            formatted_res.append({
                "rank": rank,
                "title":title,
                "url": url,
                "content": full_text,
                "markdown_file": md_path,
                "text_source": text_source,
                "weighted_score": si["weighted_score"] if si["weighted_score"] != 999 else None,
                "best_chunk_score": si["best_score"] if si["best_score"] != 999 else None,
                "avg_chunk_score": si["avg_score"] if si["avg_score"] != 999 else None,
                "matched_chunks": si["chunk_count"],
            })
 
        end_time = time.time()
        processing_time_ms = round((end_time - start_time) * 1000, 2)
 
        return {
            "query":                    query,
            "extracted_context":        extracted.get("context", ""),
            "optimized_search_keyword": search_kw,
            "processing_time_ms":       processing_time_ms,
            "total_results":            len(formatted_res),
            "data":                     formatted_res,
        }