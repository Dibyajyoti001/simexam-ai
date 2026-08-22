import re
from dataclasses import dataclass

@dataclass
class Chunk:
    content: str
    index: int
    metadata: dict

def chunk_text(text: str, doc_type: str, max_tokens=300, overlap=50) -> list[Chunk]:
    chunks = []
    # Very basic chunking, assuming 1 token ~= 4 chars
    max_chars = max_tokens * 4
    overlap_chars = overlap * 4

    if "code" in doc_type or doc_type in ["javascript", "python", "java", "typescript"]:
        # Basic split by functions
        parts = re.split(r'\n(?=function|def|class|const|let|var|public)', text)
    elif "markdown" in doc_type:
        parts = re.split(r'\n(?=#+ )', text)
    else:
        parts = text.split('\n\n')

    current_chunk = ""
    chunk_index = 0

    for part in parts:
        if len(current_chunk) + len(part) > max_chars and current_chunk:
            chunks.append(Chunk(content=current_chunk.strip(), index=chunk_index, metadata={"type": doc_type}))
            chunk_index += 1
            # Keep last overlap_chars of current_chunk
            current_chunk = current_chunk[-overlap_chars:] + "\n\n" + part
        else:
            current_chunk += "\n\n" + part if current_chunk else part

    if current_chunk.strip():
        chunks.append(Chunk(content=current_chunk.strip(), index=chunk_index, metadata={"type": doc_type}))

    return chunks
