import os
import re

class MarkdownFormatter:
    def __init__(self, OUTPUT_DIR: str):
        self.outputdir = OUTPUT_DIR
        os.makedirs(self.outputdir, exist_ok=True)
        
    def save_to_markdown(self, title:str, url:str, content:str, chunk_idx:int) -> str:
        safe_title = re.sub(r'[\\/*?"<>|]', "", title).replace(" ", "_")
        safe_title = safe_title[:50]
        file_name = f"{safe_title}_chunk_{chunk_idx}.md"
        file_path = os.path.join(self.outputdir, file_name)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"# {title}\n\n")
            f.write(f"**URL:** {url}\n\n")
            f.write("---\n\n")
            f.write(f"{content}\n")
                    
        return file_path