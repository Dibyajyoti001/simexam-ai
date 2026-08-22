from schemas.types import EvalRequest, EvalResponse
from tools.llm_router import get_llm, TaskType
import os
import json
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser

class SemanticEvaluator:
    async def evaluate(self, request: EvalRequest) -> EvalResponse:
        groq_api_key = os.environ.get("GROQ_API_KEY")
        
        # Deterministic heuristic evaluation when no LLM API key is available
        if not groq_api_key:
            essay = request.final_code or ""

            # --- Word count score ---
            words = essay.split()
            word_count = len(words)
            if word_count < 50:
                word_score = 30
            elif word_count <= 150:
                word_score = 50
            elif word_count <= 300:
                word_score = 70
            else:
                word_score = 85

            # --- Paragraph structure score ---
            paragraphs = [p.strip() for p in essay.split("\n\n") if p.strip()]
            para_count = len(paragraphs)
            if para_count <= 1:
                para_score = 40
            elif para_count <= 3:
                para_score = 60
            else:
                para_score = 80

            # --- Rubric keyword matching score ---
            keyword_score = 0
            matched_keywords = []
            if request.rubric and request.rubric.dimensions:
                essay_lower = essay.lower()
                for dim in request.rubric.dimensions:
                    keyword = dim.name.lower()
                    # Check individual words from the dimension name
                    for kw in keyword.split():
                        if len(kw) > 2 and kw in essay_lower:
                            keyword_score += 5
                            matched_keywords.append(kw)
                            break  # count each dimension at most once
            keyword_score = min(keyword_score, 100)

            # --- Overall score ---
            overall_score = round((word_score + para_score + keyword_score) / 3, 1)
            passed = overall_score >= 50

            # --- Map to rubric dimensions ---
            technical_accuracy = round(overall_score / 10, 1)
            communication = round(para_score / 10, 1)
            adaptability = round(keyword_score / 10, 1) if keyword_score > 0 else 5.0
            efficiency = round(word_score / 10, 1)

            # --- Feedback ---
            strengths = []
            improvements = []

            if word_count >= 150:
                strengths.append(f"Substantial response ({word_count} words)")
            else:
                improvements.append(f"Expand your answer — only {word_count} words provided (aim for 150+)")

            if para_count >= 3:
                strengths.append(f"Well-structured with {para_count} paragraphs")
            else:
                improvements.append("Break your answer into more paragraphs for better structure")

            if matched_keywords:
                strengths.append(f"Addresses rubric topics: {', '.join(matched_keywords)}")
            elif request.rubric and request.rubric.dimensions:
                dim_names = [d.name for d in request.rubric.dimensions[:3]]
                improvements.append(f"Address rubric dimensions more explicitly: {', '.join(dim_names)}")

            if not strengths:
                strengths.append("Answer submitted")
            if not improvements:
                improvements.append("Consider adding concrete examples to strengthen your argument")

            overall_feedback = (
                f"Heuristic evaluation: {word_count} words, {para_count} paragraph(s). "
                f"Scores — Length: {word_score}, Structure: {para_score}, Keywords: {keyword_score}."
            )

            return EvalResponse(
                passed=passed,
                overall_score=overall_score,
                technical_accuracy=technical_accuracy,
                communication=communication,
                adaptability=adaptability,
                efficiency=efficiency,
                overall_feedback=overall_feedback,
                strengths=strengths,
                improvements=improvements,
            )

        try:
            llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=groq_api_key)
            parser = JsonOutputParser()
            
            rubric_text = ", ".join([f"{d.name} ({d.weight})" for d in request.rubric.dimensions]) if request.rubric and request.rubric.dimensions else "Standard Technical Rubric"
            
            prompt = PromptTemplate(
                template="""
                You are an expert technical evaluator. Evaluate the following technical essay against the rubric: {rubric}.
                The student's essay: {essay}
                
                Respond in valid JSON with the following keys:
                - passed (boolean)
                - overall_score (float 0-100)
                - technical_accuracy (float 0-10)
                - communication (float 0-10)
                - adaptability (float 0-10)
                - efficiency (float 0-10)
                - overall_feedback (string)
                - strengths (list of strings)
                - improvements (list of strings)
                """,
                input_variables=["rubric", "essay"],
            )
            
            chain = prompt | llm | parser
            result = await chain.ainvoke({"rubric": rubric_text, "essay": request.final_code})
            
            return EvalResponse(
                tests_passed=1 if result.get("passed", False) else 0,
                tests_total=1,
                **result
            )
            
        except Exception as e:
            return EvalResponse(
                tests_passed=0,
                tests_total=1,
                passed=False,
                overall_score=0.0,
                overall_feedback=f"Error evaluating essay semantically: {str(e)}"
            )
