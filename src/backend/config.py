import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JSON_PATH = os.path.join("data", "raw", "wikipedia_dataset.json")
VDB_PATH = os.path.join("data", "vector")

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
COLLECTION_NAME = "wiki_ai_english"
DEFAULT_TOP_K = 5