---
description: Resource-safe agent rules to prevent "agent terminated due to error"
---

# Resource-Safe Agent Rules

These rules MUST be followed at all times to avoid agent termination due to resource exhaustion.

## 1. File Reading Limits

- **Maximum 2 files in parallel** at once. Never read 3+ files simultaneously.
- **Never batch-read large files** (>200 lines) together. Read them one at a time.
- When reading edge functions, read **one per turn**, not 4-5 at once.
- For files >400 lines, always use `StartLine`/`EndLine` to read in **chunks of 200-300 lines**.

## 2. Tool Call Batching Rules

- Maximum **2 parallel tool calls** per turn when any involves file reading.
- Maximum **3 parallel tool calls** per turn for lightweight calls (grep, find_by_name, SQL queries).
- Never run `browser_subagent` in parallel with file reads.
- Never run `run_command` in parallel with more than 1 other heavy tool.

## 3. Edge Function Reading Strategy

When scanning multiple edge functions:
- Read **one function per step**, not multiple.
- After reading 3-4 functions, update progress (task.md / summary) before continuing.
- Prefer `grep_search` to scan for specific patterns across many files instead of reading full files.

## 4. Break Large Tasks Into Small Steps

- Each task_boundary should cover at most **5-7 tool calls** of real work.
- For large research tasks (e.g. reading all pages + all edge functions), break into sub-phases:
  - Phase 1: Read auth/user functions (2-3 files)
  - Phase 2: Read billing functions (2-3 files)
  - Phase 3: Read webhook functions (2-3 files)
  - etc.

## 5. Handbook / Documentation Tasks

- Write the document **in sections** — don't try to produce a 500-line artifact in one giant write.
- Use `grep_search` to gather specific error message strings quickly instead of reading full files.
- After writing each section, save progress before continuing.

## 6. Edge Function Deployments

- Deploy edge functions **one at a time**, never in parallel.
- Wait for each deploy to confirm before starting the next.

## 7. Recovery Protocol

If an agent turn was terminated:
- On retry/continue, do NOT restart the whole task.
- Read `task.md` first to see what was completed.
- Continue from the **next uncompleted item** only.
- Start with a single lightweight tool call (e.g. `view_file` on task.md) to re-establish context.
