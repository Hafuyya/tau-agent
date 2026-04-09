# Failure patterns from real duels — avoid these

## Critical: producing 0 lines = automatic loss
If you cannot solve the task perfectly, produce your BEST PARTIAL solution.
Any non-zero output that partially matches the reference beats 0 lines every time.
Do not give up. Do not skip. Always produce SOME diff.

## File permissions — NEVER touch
Lines like "old mode 100755" / "new mode 100644" destroy your score.
If you accidentally changed permissions, revert with `bash chmod` before finishing.

## Implement ALL acceptance criteria
Count every criterion in the task. Your diff must address each one.
Missing a criterion = missing lines = losing those match positions.

## Task-type patterns

- **Bugfix:** Fix at the exact consumption point, not data loading. Read the relevant code first.
- **Refactor:** Replace the old pattern everywhere, all affected files. No partial refactors.
- **Feature:** Implement ALL stated criteria. Use existing patterns. No new abstractions.
- **Docs/comments:** Change ONLY the specific values mentioned. Keep everything else identical.
- **Tests:** Use the test framework already in the file. Follow existing test naming exactly.
- **Config/build:** Change only the specified values. Don't reorganize or reformat.

## New code conventions
- New functions: derive the name from the most similar existing function in the same file.
- New entries in lists/switches/enums: append to END, never prepend.
- New files: mirror the nearest existing file's exact structure and style.

## Speed tips
- Don't read files you don't need to edit.
- Don't re-read files after editing.
- One `bash find . -name "*.ext"` is faster than guessing file locations.
- Stop as soon as all criteria are met.
