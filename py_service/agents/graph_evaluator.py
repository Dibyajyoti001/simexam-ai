import json
from schemas.types import EvalRequest, EvalResponse

class GraphEvaluator:
    async def evaluate(self, request: EvalRequest) -> EvalResponse:
        try:
            graph = json.loads(request.final_code)

            # --- Parse tldraw snapshot format ---
            # The tldraw snapshot has a `store` key containing records keyed by ID.
            # Fall back to treating the top-level object as a list for legacy formats.
            if isinstance(graph, dict) and "store" in graph:
                records = list(graph["store"].values())
            elif isinstance(graph, dict):
                records = list(graph.values()) if graph else []
            elif isinstance(graph, list):
                records = graph
            else:
                records = []

            # Separate shapes and arrows
            shapes = [r for r in records if r.get("typeName") == "shape"]
            arrows = [s for s in shapes if s.get("type") == "arrow" or (isinstance(s.get("props"), dict) and s["props"].get("type") == "arrow")]
            nodes = [s for s in shapes if s not in arrows]

            # --- Sub-score: node_count ---
            n = len(nodes)
            if n == 0:
                node_count_score = 0
            elif n <= 2:
                node_count_score = 40
            elif n <= 5:
                node_count_score = 60
            elif n < 10:
                node_count_score = 80
            else:
                node_count_score = 100

            # --- Sub-score: connectivity ---
            a = len(arrows)
            if n == 0 or a == 0:
                connectivity_score = 0
            else:
                ratio = a / n
                if ratio >= 1.0:
                    connectivity_score = 100
                elif ratio >= 0.5:
                    connectivity_score = 70
                else:
                    connectivity_score = 40

            # --- Sub-score: labeling ---
            labeled = 0
            for s in nodes:
                props = s.get("props", {})
                text = props.get("text", "").strip() if isinstance(props, dict) else ""
                name = props.get("name", "").strip() if isinstance(props, dict) else ""
                if text or name:
                    labeled += 1
            if n == 0:
                labeling_score = 30
            else:
                pct = labeled / n
                if pct > 0.8:
                    labeling_score = 100
                elif pct > 0.5:
                    labeling_score = 70
                else:
                    labeling_score = 30

            # --- Sub-score: diversity (distinct geo types) ---
            geo_types = set()
            for s in nodes:
                props = s.get("props", {})
                if isinstance(props, dict):
                    geo = props.get("geo")
                    if geo:
                        geo_types.add(geo)
            d = len(geo_types)
            if d >= 3:
                diversity_score = 80
            elif d == 2:
                diversity_score = 60
            elif d == 1:
                diversity_score = 40
            else:
                diversity_score = 0

            # --- Overall score (weighted average) ---
            overall_score = (
                node_count_score * 0.3
                + connectivity_score * 0.3
                + labeling_score * 0.2
                + diversity_score * 0.2
            )
            passed = overall_score >= 50

            # --- Map to rubric dimensions ---
            technical_accuracy = round(overall_score / 10, 1)
            communication = round(labeling_score / 10, 1)
            adaptability = round(diversity_score / 10, 1)
            efficiency = round(connectivity_score / 10, 1)

            # --- Strengths & improvements ---
            strengths = []
            improvements = []

            if node_count_score >= 80:
                strengths.append(f"Good number of components ({n} nodes)")
            elif node_count_score <= 40:
                improvements.append("Add more components to flesh out the design")

            if connectivity_score >= 70:
                strengths.append(f"Well-connected diagram ({a} connections for {n} nodes)")
            elif connectivity_score <= 40:
                improvements.append("Add more connections/arrows between components")

            if labeling_score >= 70:
                strengths.append("Most components are clearly labeled")
            else:
                improvements.append("Label all components with descriptive text")

            if diversity_score >= 60:
                strengths.append(f"Good variety of shape types ({d} distinct types)")
            else:
                improvements.append("Use different shape types (rectangles, ellipses, etc.) to distinguish component roles")

            if not strengths:
                strengths.append("Diagram submitted")
            if not improvements:
                improvements.append("Consider adding annotations or notes for clarity")

            tests_passed = 4
            tests_total = 4
            if node_count_score < 40:
                tests_passed -= 1
            if connectivity_score < 40:
                tests_passed -= 1
            if labeling_score < 50:
                tests_passed -= 1
            if diversity_score < 40:
                tests_passed -= 1

            overall_feedback = (
                f"Diagram analysis: {n} nodes, {a} connections, "
                f"{labeled}/{n} labeled, {d} shape types. "
                f"Score breakdown — Nodes: {node_count_score}, Connectivity: {connectivity_score}, "
                f"Labeling: {labeling_score}, Diversity: {diversity_score}."
            )

            return EvalResponse(
                tests_passed=tests_passed,
                tests_total=tests_total,
                overall_score=round(overall_score, 1),
                passed=passed,
                technical_accuracy=technical_accuracy,
                communication=communication,
                adaptability=adaptability,
                efficiency=efficiency,
                overall_feedback=overall_feedback,
                strengths=strengths,
                improvements=improvements,
            )
        except Exception as e:
            return EvalResponse(
                tests_passed=0,
                tests_total=1,
                overall_score=0.0,
                passed=False,
                overall_feedback=f"Failed to parse graph JSON: {str(e)}"
            )
