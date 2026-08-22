export const EXAM_DURATION_SECONDS = 600
export const CURVEBALL_TRIGGER_SECONDS = 120

export const INITIAL_CODE = `// production-sort.js
// Sorting module used in our inventory management system
// Status: BROKEN — do not deploy

function sortInventory(arr) {
  const n = arr.length;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {  // BUG: should be n - i - 1
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }

  return arr;
}

// Test cases (expected: [1, 2, 5, 8, 9, 12])
console.log(sortInventory([8, 5, 2, 9, 1, 12]));`

export const CURVEBALL_MESSAGE =
  "Quick update from the client: the deployment target just got smaller, so the fix now needs to stay comfortably within O(n log n). The previous O(n²) approach is no longer acceptable."

export const SIMULATOR_OPENING_MESSAGE = (name: string) =>
  `Hey ${name} — welcome. I've loaded a broken sorting module from our inventory system. It throws on edge cases and it is too slow on larger inputs. Inspect the code, ask about the behavior, and show me your fix when you're ready.`

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"

export const SESSION_KEYS = {
  ORG_SLUG: "simexam_org_slug",
  SESSION_ID: "simexam_session_id",
  STUDENT_NAME: "simexam_student_name",
  EXAM_STATE: "simexam_exam_state",
  MESSAGES: "simexam_messages",
  CODE: "simexam_code",
  TIMER: "simexam_timer_start",
  RESULTS: "simexam_results",
  EVALUATION_PAYLOAD: "simexam_evaluation_payload",
  EVALUATION_PENDING: "simexam_evaluation_pending",
} as const
