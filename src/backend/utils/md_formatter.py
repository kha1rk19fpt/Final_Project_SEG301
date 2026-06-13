import os
import json
import re

class MarkdownFormatter:
    def __init__(self, OUTPUT_DIR: str):
        self.outputdir = OUTPUT_DIR
        os.makedirs(self.outputdir, exist_ok=True)
    def save_to_markdown(self, title:str, url:str, content:str, tables_str:str, chunk_idx:int)-> str:
        safe_title =  re.sub(r'[\\/*?"<>|]', "", title).replace(" ", "_")
        safe_title = safe_title[:50]
        file_name = f"{safe_title}_chunk_{chunk_idx}.md"
        file_path = os.path.join(self.outputdir, file_name)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"{title}")
            f.write(f"URL: {url}")
            f.write("Content:")
            f.write(f"{content}")

            if tables_str:
                try:
                    tables_dict = json.load(tables_str)
                    if tables_dict:
                        f.write("Table data:")
                        f.write(json.dump(tables_dict, ascii=False, indent=4))
                except json.JSONDecodeError:
                    pass
        return file_path