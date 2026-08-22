import ast
import re
from schemas.types import AnalyseResponse

class ASTAnalyser:
    def analyse(self, code: str, language: str) -> AnalyseResponse:
        syntax_valid = self._check_syntax(code, language)
        cyclomatic_complexity = [{"complexity": 1, "name": "main"}]
        has_recursion = self._detect_recursion(code, language)
        estimated_complexity = self._estimate_big_o(code, language)
        code_smells = self._detect_code_smells(code)
        variable_names = self._extract_variable_names(code)

        if language == "python" and syntax_valid:
            try:
                import radon.complexity as cc
                results = cc.cc_visit(code)
                cyclomatic_complexity = [{"complexity": r.complexity, "name": getattr(r, 'name', 'block')} for r in results] if results else [{"complexity": 1, "name": "main"}]
            except Exception:
                pass

        return AnalyseResponse(
            cyclomatic_complexity=cyclomatic_complexity,
            has_recursion=has_recursion,
            estimated_complexity=estimated_complexity,
            syntax_valid=syntax_valid,
            code_smells=code_smells,
            variable_names=variable_names
        )

    def _check_syntax(self, code: str, language: str) -> bool:
        if language == "python":
            try:
                ast.parse(code)
                return True
            except SyntaxError:
                return False
        return True # Best effort for other languages

    def _detect_recursion(self, code: str, language: str) -> bool:
        if language == "python":
            try:
                tree = ast.parse(code)
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        func_name = node.name
                        for child in ast.walk(node):
                            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                                if child.func.id == func_name:
                                    return True
            except Exception:
                pass
        else:
            # Fallback regex for recursion (basic)
            func_defs = re.findall(r'function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*\(|let\s+(\w+)\s*=\s*\(', code)
            names = [m[0] or m[1] or m[2] for m in func_defs]
            for name in names:
                safe_name = re.escape(name)
                if re.search(rf'{safe_name}\s*\(', code) and code.count(f'{name}(') > 1:
                    return True
        return False

    def _estimate_big_o(self, code: str, language: str) -> str:
        depth = 0
        max_depth = 0
        lines = code.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('for ') or line.startswith('while ') or line.startswith('for(') or line.startswith('while('):
                depth += 1
                max_depth = max(max_depth, depth)
            elif '}' in line or (language == 'python' and len(line) > 0 and not line.startswith(' ') and depth > 0):
                depth = max(0, depth - 1)
        
        if self._detect_recursion(code, language):
            if 'mid' in code or '/2' in code or '// 2' in code:
                return "O(N log N) or O(log N)"
            return "O(2^N) or O(N)"
        
        if max_depth == 0: return "O(1)"
        if max_depth == 1: return "O(N)"
        if max_depth == 2: return "O(N^2)"
        return f"O(N^{max_depth})"

    def _detect_code_smells(self, code: str) -> list[str]:
        smells = []
        if len(code.split('\n')) > 50:
            smells.append("Long function detected (>50 lines)")
        if re.search(r'\b(magic|const|let|var)\s+\w+\s*=\s*\d+', code):
             pass # Not a robust way to check magic numbers
        if 'catch' not in code and 'except' not in code and 'try' not in code:
            smells.append("Missing error handling")
        return smells

    def _extract_variable_names(self, code: str) -> list[str]:
        vars_found = []
        js_matches = re.findall(r'(?:const|let|var)\s+(\w+)\s*=', code)
        py_matches = re.findall(r'^\s*(\w+)\s*=', code, re.MULTILINE)
        vars_found.extend(js_matches)
        vars_found.extend(py_matches)
        return list(set(vars_found))
