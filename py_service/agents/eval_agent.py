from schemas.types import EvalRequest, EvalResponse
from tools.ast_analyser import ASTAnalyser
import os
import json

class EvalState:
    def __init__(self, request: EvalRequest):
        self.request = request
        self.technical_accuracy = 0.0
        self.adaptability = 0.0
        self.efficiency = 0.0
        self.independence = 8.0
        self.communication = 7.0
        self.doubt_resolution = 7.0
        self.overall_feedback = ""
        self.strengths = []
        self.improvements = []
        self.ast_data = None

    def to_response(self) -> EvalResponse:
        dimension_scores = {
            "technical_accuracy": round(self.technical_accuracy, 1),
            "adaptability": round(self.adaptability, 1),
            "efficiency": round(self.efficiency, 1),
            "independence": round(self.independence, 1),
            "communication": round(self.communication, 1),
            "doubt_resolution": round(self.doubt_resolution, 1)
        }
        
        # Calculate weighted overall score
        total_weight = 0.0
        score_sum = 0.0
        
        dims = self.request.rubric.dimensions if self.request.rubric and self.request.rubric.dimensions else []
        if dims:
            for dim in dims:
                weight = dim.weight
                # Match normalized dimension name
                dim_key = dim.name.lower().replace(" ", "_")
                score = dimension_scores.get(dim_key, self.technical_accuracy)
                score_sum += score * weight
                total_weight += weight
        
        overall_score = (score_sum / total_weight) if total_weight > 0 else (
            (self.technical_accuracy + self.adaptability + self.efficiency + self.communication) / 4.0
        )
        
        passing_threshold = self.request.rubric.passing_score if self.request.rubric and self.request.rubric.passing_score else 5.0
        if passing_threshold > 10.0:  # Normalized if specified out of 100
            passing_threshold = passing_threshold / 10.0

        passed = overall_score >= passing_threshold and self.technical_accuracy >= 4.0
        
        # Override to fail only if explicit tests existed and candidate passed zero
        tests_passed = getattr(self.request, 'tests_passed', 0)
        tests_total = getattr(self.request, 'tests_total', 0)
        if tests_total > 1 and tests_passed == 0:
            passed = False

        return EvalResponse(
            tests_passed=tests_passed,
            tests_total=tests_total,
            dimension_scores=dimension_scores,
            technical_accuracy=round(self.technical_accuracy, 1),
            adaptability=round(self.adaptability, 1),
            communication=round(self.communication, 1),
            efficiency=round(self.efficiency, 1),
            doubt_resolution=round(self.doubt_resolution, 1),
            independence=round(self.independence, 1),
            overall_feedback=self.overall_feedback or f"Candidate completed the assessment with {tests_passed}/{tests_total} tests passing. Demonstrated solid execution and adaptability under constraint changes.",
            strengths=self.strengths or ["Implemented functional logic", "Handled interview guidance effectively"],
            improvements=self.improvements or ["Deepen algorithmic complexity optimization", "Add more defensive edge-case assertions"],
            passed=passed,
            overall_score=round(overall_score, 1)
        )

async def layer1_deterministic(state: EvalState) -> EvalState:
    """
    Layer 1: Deterministic analysis combining test execution results + AST parsing & Big-O estimation.
    """
    code = state.request.final_code or ""
    tests_passed = getattr(state.request, 'tests_passed', 0)
    tests_total = getattr(state.request, 'tests_total', 0)

    # 1. AST Analysis
    analyser = ASTAnalyser()
    ast_res = analyser.analyse(code, language="javascript" if "function" in code or "const" in code else "python")
    state.ast_data = ast_res

    ast_score = 7.0
    if not ast_res.syntax_valid:
        ast_score = 2.0
    else:
        if ast_res.has_recursion:
            ast_score += 1.0
        if ast_res.estimated_complexity in ["O(N log N) or O(log N)", "O(N)", "O(1)"]:
            ast_score += 1.5
        elif ast_res.estimated_complexity == "O(N^2)":
            ast_score = max(5.0, ast_score - 1.0)
        if len(ast_res.code_smells) > 1:
            ast_score = max(3.0, ast_score - 1.0)

    ast_score = min(10.0, max(1.0, ast_score))

    # 2. Test Execution Score
    if tests_total > 0:
        test_ratio = tests_passed / tests_total
        test_score = test_ratio * 10.0
        # Combine: 70% test pass rate + 30% AST code quality
        state.technical_accuracy = (test_score * 0.7) + (ast_score * 0.3)
    else:
        state.technical_accuracy = ast_score

    return state

async def layer2_rubric(state: EvalState) -> EvalState:
    """
    Layer 2: Behavioural and constraint adaptation analysis.
    """
    r = state.request
    
    # Adaptability
    if r.curveball_fired and r.curveball_addressed:
        state.adaptability = 9.5
    elif r.curveball_fired and not r.curveball_addressed:
        state.adaptability = 4.0
    else:
        state.adaptability = 7.0
        
    # Efficiency based on time elapsed
    if r.time_elapsed <= 300:
        state.efficiency = 9.5
    elif r.time_elapsed <= 600:
        state.efficiency = 8.0
    elif r.time_elapsed <= 900:
        state.efficiency = 6.5
    else:
        state.efficiency = 5.0
        
    # Independence based on hints given
    hints = getattr(r, 'hints_given', 0)
    state.independence = max(2.0, 10.0 - (hints * 1.5))
    
    return state

async def layer3_qualitative(state: EvalState) -> EvalState:
    """
    Layer 3: Qualitative AI review using Groq Llama-3.3-70B or Gemini for feedback, strengths, and improvements.
    """
    groq_api_key = os.environ.get("GROQ_API_KEY")
    
    if groq_api_key:
        try:
            from langchain_groq import ChatGroq
            llm = ChatGroq(
                model_name="llama-3.3-70b-versatile",
                temperature=0.3,
                max_tokens=500,
                groq_api_key=groq_api_key
            )
            
            transcript_snippet = ""
            if state.request.conversation_history:
                transcript_snippet = str(state.request.conversation_history[-1].get("content", ""))[:1500]

            prompt = f"""You are conducting an engineering assessment evaluation.
Final Code:
{state.request.final_code[:1000]}

Tests Passed: {state.request.tests_passed}/{state.request.tests_total}
Time Elapsed: {state.request.time_elapsed}s
Curveball Addressed: {state.request.curveball_addressed}
Transcript Summary:
{transcript_snippet}

Respond with valid JSON:
{{
  "overall_feedback": "2-3 constructive sentences on candidate performance",
  "strengths": ["specific strength 1", "specific strength 2"],
  "improvements": ["specific improvement 1", "specific improvement 2"],
  "communication_score": 8.0
}}"""
            
            resp = await llm.ainvoke(prompt)
            content = resp.content
            # Parse JSON
            if "{" in content and "}" in content:
                json_str = content[content.find("{"):content.rfind("}")+1]
                data = json.loads(json_str)
                state.overall_feedback = data.get("overall_feedback", state.overall_feedback)
                state.strengths = data.get("strengths", state.strengths)
                state.improvements = data.get("improvements", state.improvements)
                if "communication_score" in data:
                    state.communication = float(data["communication_score"])
                return state
        except Exception as e:
            # Heuristic fallback on LLM timeout or parsing error
            pass

    # Heuristic qualitative generation
    complexity_str = state.ast_data.estimated_complexity if state.ast_data else "O(N)"
    tests_passed = getattr(state.request, 'tests_passed', 0)
    tests_total = getattr(state.request, 'tests_total', 0)
    
    state.overall_feedback = (
        f"Candidate verified {tests_passed}/{tests_total} test cases with estimated complexity {complexity_str}. "
        f"{'Successfully adapted to requirement curveball.' if state.request.curveball_addressed else 'Demonstrated clear problem engagement.'}"
    )
    state.strengths = [
        f"Achieved valid algorithmic complexity ({complexity_str})",
        "Engaged constructively with technical interviewer instructions"
    ]
    state.improvements = [
        "Further enhance boundary condition validation",
        "Document space-time trade-off rationales during implementation"
    ]
    return state

def compose_final(state: EvalState) -> EvalState:
    return state

async def evaluate(request: EvalRequest) -> EvalResponse:
    state = EvalState(request)
    state = await layer1_deterministic(state)
    state = await layer2_rubric(state)
    state = await layer3_qualitative(state)
    state = compose_final(state)
    return state.to_response()
