import asyncio
from schemas.types import EvalRequest, Rubric, RubricDimension
from agents.eval_agent import evaluate

async def run_tests():
    print("Testing EvalAgent deterministic + AST pipeline...")

    # Test 1: Full pass on coding assessment
    req = EvalRequest(
        assessment_type="coding",
        final_code="""
function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}
""",
        tests_passed=5,
        tests_total=5,
        time_elapsed=240,
        curveball_fired=True,
        curveball_addressed=True,
        hints_given=1,
        rubric=Rubric(
            dimensions=[
                RubricDimension(name="Technical Accuracy", weight=0.4),
                RubricDimension(name="Adaptability", weight=0.3),
                RubricDimension(name="Efficiency", weight=0.3),
            ],
            passing_score=6.0
        )
    )

    res = await evaluate(req)
    assert res.tests_passed == 5, f"Expected 5 tests passed, got {res.tests_passed}"
    assert res.technical_accuracy >= 8.0, f"Expected high technical accuracy, got {res.technical_accuracy}"
    assert res.passed is True, f"Expected passed=True, got {res.passed}"
    assert len(res.strengths) > 0, "Expected non-empty strengths"
    assert len(res.improvements) > 0, "Expected non-empty improvements"
    print(f"  [OK] Test 1 Passed: Technical Accuracy = {res.technical_accuracy}, Overall = {res.overall_score}, Passed = {res.passed}")

    # Test 2: Failing tests
    req_fail = EvalRequest(
        assessment_type="coding",
        final_code="function broken() { return false; }",
        tests_passed=0,
        tests_total=5,
        time_elapsed=500,
        curveball_fired=True,
        curveball_addressed=False,
        hints_given=3,
        rubric=Rubric(passing_score=6.0)
    )

    res_fail = await evaluate(req_fail)
    assert res_fail.passed is False, f"Expected passed=False on 0/5 tests, got {res_fail.passed}"
    print(f"  [OK] Test 2 Passed: Failed accurately (Passed = {res_fail.passed}, Technical Accuracy = {res_fail.technical_accuracy})")

    print("\nAll EvalAgent tests passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
