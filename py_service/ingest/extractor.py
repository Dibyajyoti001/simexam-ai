import fitz # pymupdf
import docx
import io

def extract_text(content: bytes, mime_type: str) -> str:
    if "pdf" in mime_type:
        text = ""
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text += page.get_text() + "\n"
            return text[:500000]
        except Exception:
            return ""
    elif "wordprocessingml" in mime_type or "docx" in mime_type:
        try:
            doc = docx.Document(io.BytesIO(content))
            return "\n".join([p.text for p in doc.paragraphs])[:500000]
        except Exception:
            return ""
    elif "image" in mime_type:
        return ""
    else:
        # text, markdown, etc
        try:
            return content.decode("utf-8")[:500000]
        except Exception:
            return ""
