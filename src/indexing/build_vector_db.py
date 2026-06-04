import json 
import os
import chromadb
from chromadb.utils import embedding_functions
from src.backend.config import EMBEDDING_MODEL_NAME, COLLECTION_NAME

#set up dir
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JSON_PATH = os.path.join("data", "raw", "wikipedia_dataset.json")
VDB_PATH = os.path.join("data", "vector")

def main():
    # Itializing Vector DB & AI model
    client  = chromadb.PersistentClient(path = VDB_PATH)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name= EMBEDDING_MODEL_NAME)
    try:
        client.delete_collection(name= COLLECTION_NAME)
    except:
        pass
    collection = client.create_collection(name=COLLECTION_NAME, embedding_function=ef)

    with open (JSON_PATH, "r", encoding="utf-8") as f: #Read data
        data = json.load(f)
    docs = []
    metadatas = []
    ids = []

    #chunking
    chunk_id = 0
    for article in data:
        title = article.get("title") or "No Title"
        url = article.get("url") or ""
        text = article.get("text") or ""

        if not text:
            continue

        paragraphs = text.split("\n")
        for p in paragraphs:
            p = p.strip()
            if len(p) > 150:
                docs.append(p)
                metadatas.append({"title": str(title), "url":str(url)})
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