import os
from enum import Enum

class TaskType(Enum):
    HINT = "hint"
    CONCEPT = "concept"
    NOVEL = "novel"
    EVAL_LAYER3 = "eval_layer3"
    DOUBT_DEEP = "doubt_deep"
    STATIC = "static"
    BEHAVIOURAL = "behavioural"

TASK_MODEL_MAP = {
    TaskType.HINT: "llama-3.3-70b-versatile",
    TaskType.CONCEPT: "llama-3.3-70b-versatile",
    TaskType.NOVEL: "llama-3.3-70b-versatile",
    TaskType.EVAL_LAYER3: "claude-3-5-sonnet-20241022",
    TaskType.DOUBT_DEEP: "claude-3-5-haiku-20241022",
    TaskType.STATIC: None,
    TaskType.BEHAVIOURAL: None,
}

async def get_llm(task_type: TaskType):
    model_name = TASK_MODEL_MAP[task_type]
    if model_name is None:
        return None
    if "gemini" in model_name:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model_name, google_api_key=os.environ.get("GEMINI_API_KEY"))
    elif "llama" in model_name or "mixtral" in model_name or "gemma" in model_name:
        from langchain_groq import ChatGroq
        return ChatGroq(model=model_name, groq_api_key=os.environ.get("GROQ_API_KEY"))
    elif "claude" in model_name:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model_name, anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"))
    raise ValueError(f"Unknown model: {model_name}")
