import json
import math
import re
from collections import Counter

class BM25Search:
    def __init__(self, json_path:str):
        with open(json_path, "r", encoding="utf-8") as f:
            self.corpus = json.load(f)
        self.k1 = 1.5
        self.b = 0.75
        self.tokenized = [self.tokenize(doc.get("title", "") + " " + doc.get("text", "")) for doc in self.corpus]
        self.doc_freq = []
        self.idf = {}
        self.avg_dl = 0
        self.build_index()
    
    def tokenize(self, text: str) -> list:
        return re.findall(r'[a-z0-9]+', text.lower())
    def build_index(self):
        df = Counter()
        total_len = 0
        for tokens in self.tokenized:
            total_len += len(tokens)
            tf = Counter(tokens)
            self.doc_freq.append(tf)
            for term in tf:
                df[term] += 1
        n = len(self.corpus)
        self.avg_dl = total_len / n if n else 1
        for term, freq in df.items():
            self.idf[term] = math.log((n - freq + 0.5) / (freq + 0.5) + 1)
    def search(self, query: str, top_k: int = 10) -> list:
        query_terms = self.tokenize(query)
        scores = []
        for idx, tf in enumerate(self.doc_freq):
            dl    = sum(tf.values())
            score = 0.0
            for term in query_terms:
                if term not in tf:
                    continue
                idf =self.idf.get(term, 0)
                tf_val = tf[term]
                norm = tf_val * (self.k1 + 1)
                denom = tf_val + self.k1 * (1 - self.b + self.b * dl / self.avg_dl)
                score += idf * (norm / denom)
            if score > 0:
                scores.append((idx, score))
        scores.sort(key=lambda x: x[1], reverse=True)
        return [{
                "url": self.corpus[i].get("url", ""),
                "title": self.corpus[i].get("title", ""),
                "text":self.corpus[i].get("text", ""),
                "bm25_score": round(s, 4),
            }
            for i, s in scores[:top_k]
        ]