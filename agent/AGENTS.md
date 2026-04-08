# Common failure patterns (from real duel data)

## File permissions — NEVER touch
Lines like "old mode 100755" / "new mode 100644" destroy your score.
If you accidentally modified file permissions, revert before finishing.

## Implement ALL acceptance criteria
Count every criterion. Your diff must address each one.
Missing one criterion = missing lines = losing the round.
Before stopping: re-read every criterion. Did your diff touch each one?

## Task-type behavior

Bugfix: insert fix at the exact consumption point, not data loading.
Refactor: replace the old pattern everywhere, all affected files. No partial.
Feature: implement ALL criteria. Use existing patterns, no new abstractions.
Docs/comments: change ONLY specific values, keep all other words identical.
Tests: use the test framework already in the file. Follow existing naming.

## New code placement
- New functions: derive name from most similar existing function in same file.
- New entries in lists/switches/enums: append to END, never prepend.
- New files: mirror the nearest existing file's exact structure.

## Scope calibration
- If task has many criteria across many files, edit ALL files.
- Under-editing hurts exactly as much as over-editing.
