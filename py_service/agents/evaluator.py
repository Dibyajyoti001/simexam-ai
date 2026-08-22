from schemas.types import EvalRequest, EvalResponse
from agents.eval_agent import evaluate as run_ast_eval
from agents.graph_evaluator import GraphEvaluator
from agents.semantic_evaluator import SemanticEvaluator

class Evaluator:
    async def evaluate(self, request: EvalRequest) -> EvalResponse:
        if request.assessment_type == "system_design":
            evaluator = GraphEvaluator()
            return await evaluator.evaluate(request)
        elif request.assessment_type == "conceptual":
            evaluator = SemanticEvaluator()
            return await evaluator.evaluate(request)
        else:
            # Default or "coding" uses the existing AST evaluator
            return await run_ast_eval(request)
