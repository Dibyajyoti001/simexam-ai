from schemas.types import ChunkResult
from tools.llm_router import get_llm, TaskType

async def resolve_doubt(query: str, context_chunks: list[ChunkResult], conversation_history: str) -> str:
    llm = await get_llm(TaskType.DOUBT_DEEP)
    if not llm:
        return "I'm currently unable to access the documentation, but I'll do my best to help you based on my general knowledge."

    if context_chunks:
        context_str = "\n\n".join([c.content for c in context_chunks])
        prompt = f"""You are a Socratic tutor. The student has asked: '{query}'
        
Here is context retrieved from the organization's knowledge base:
{context_str}

Use this context to answer the student. Do not give the direct answer to coding problems.
Instead, guide them conceptually."""
    else:
        prompt = f"""You are a Socratic tutor. The student has asked: '{query}'
        
Guide them conceptually without giving away the direct answer."""

    response = await llm.ainvoke([
        ("system", prompt),
        ("human", "Conversation History:\n" + conversation_history[-1000:] + "\n\nPlease help me.")
    ])
    
    return response.content
