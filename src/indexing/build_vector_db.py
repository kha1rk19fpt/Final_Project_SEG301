import json 
import chromadb
from chromadb.utils import embedding_functions
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings
from src.backend.config import EMBEDDING_MODEL_NAME, COLLECTION_NAME, VDB_PATH, JSON_PATH

def main():
    # Itializing Vector DB & AI model &Semantic chunker
    client  = chromadb.PersistentClient(path = VDB_PATH)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name= EMBEDDING_MODEL_NAME)
    semantic_embedding = HuggingFaceEmbeddings(model_name= EMBEDDING_MODEL_NAME)
    text_semantic_chunk = SemanticChunker(semantic_embedding, breakpoint_threshold_type="percentile")
    try:
        client.delete_collection(name= COLLECTION_NAME)
    except Exception:
        pass
    collection = client.create_collection(name=COLLECTION_NAME, embedding_function=ef)

    with open (JSON_PATH, "r", encoding="utf-8") as f: #Read data
        data = json.load(f)
    docs = []
    metadatas = []
    ids = []

    #Semantic chunking
    chunk_id = 0
    for article in data:
        title = article.get("title") or "Unknow title"
        url = article.get("url") or ""
        text = article.get("text") or ""
        tables = article.get("tables") or []

        if not text:
            continue
        
        semantic_chunking = text_semantic_chunk.create_documents([text])
        for sc in semantic_chunking:
            chunk_text = sc.page_content.strip()
            if len(chunk_text) > 50:
                docs.append(chunk_text)
                table_str = json.dumps(tables, ensure_ascii=False) if tables else ""
                metadatas.append({
                    'title': str(title),
                    'url': str(url),
                    "tables": table_str
                })
                ids.append(f"chunk_{chunk_id}")
                chunk_id += 1

    #Vector embedding
    batch_size = 500
    for i in range(0, len(docs), batch_size):
        end_idx = min(i + batch_size, len(docs))
        collection.add(
            documents=docs[i:end_idx],
            metadatas=metadatas[i:end_idx],
            ids=ids[i:end_idx]
        )

if __name__ == "__main__":
    main()