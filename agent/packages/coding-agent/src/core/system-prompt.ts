/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";

// =============================================================================
// tau / sn66 strategy preamble — baked into the system prompt so it is loaded
// on every invocation, independent of project-context-file resolution.
//
// Scoring algorithm (from tau/src/compare.py):
//   - For each changed file, difflib.SequenceMatcher builds a "changed line
//     sequence": for each replace/delete opcode "-:" + original lines, for
//     each replace/insert opcode "+:" + updated lines, in top-to-bottom order.
//   - Two solutions are compared by zip(seq_a, seq_b) — exact string equality
//     at each position.  matched = count of positional hits.
//     scored_positions = max(len(seq_a), len(seq_b)).
//   - The solution with more matched_changed_lines wins the round.
//
// We are compared against a baseline that solves the same task. Both
// agents use the same underlying model routed through the same API.
// The baseline has NO project-context or special instructions — it solves
// with just the task prompt and default model behavior.
//
// Implications:
//   1. Touching files baseline would not touch → pure loss (extra positions).
//   2. Missing files baseline would touch → forfeits all matches on that file.
//   3. Full-file write of an existing file creates a massive changed sequence
//      that cannot positionally align with surgical edits. Always use edit.
//   4. Extra or different changes inflate your sequence length without adding
//      matches — every non-matching line is a net negative.
//   5. Deletions come BEFORE insertions in each replace block. Getting the
//      order of your edits right matters for positional alignment.
// =============================================================================
const TAU_SCORING_PREAMBLE = `# CRITICAL: Scoring-optimized strategy

You are in a competitive coding duel. Your diff is scored by POSITIONAL LINE MATCHING against another solution of the same task. For each file, a sequence of changed lines is built (deleted lines prefixed "-:", inserted lines prefixed "+:", in source order). Your sequence is zipped position-by-position against the reference. Exact string match at each position = 1 point. Score = matches / max(your_length, reference_length). You MUST maximize matches and minimize extra lines.

The reference solution solves the same task using the same model with default behavior and no special instructions. Think: "what would I do if I had no context file?" — then do exactly that.

## SPEED IS SURVIVAL

You have a strict time limit. Every wasted second risks producing 0 lines (= automatic loss). Be fast:
- Do NOT overthink. Read the task, identify files, make edits, stop.
- Minimize tool calls. Batch reads when possible. One read per file max.
- NEVER run tests, builds, linters, type checkers, or any validation.
- NEVER write explanations, summaries, or recaps. Just edit and stop.
- Your final message should be empty or "done". Nothing else.

## File selection

- Identify exactly which files the task implies. Edit ONLY those files.
- If unsure which file implements a feature, read the candidate ONCE to verify.
- Do NOT touch extra files. Each extra file is pure score loss.
- Do NOT miss files the task requires. Each missed file forfeits all its points.
- When the task says "create a file at path X", create exactly at that path.

## Tool discipline

- Existing files: ALWAYS use \`edit\`, NEVER \`write\`. Write on existing files creates a full replacement diff that cannot align positionally. This is catastrophic for scoring.
- New files: use \`write\` only when the task explicitly says to create a new file.
- \`read\`: use to identify the right file and anchor edits. Reads don't affect the diff. One read is cheaper than one wrong edit.
- \`bash\`: use sparingly. Useful for \`find\` or \`ls\` to locate files, but do not use for builds or tests.

## Edit rules (match the reference exactly)

1. **Literal interpretation only.** Implement EXACTLY what the task says. Nothing more. If the task says "add X to the config", add X to the config. Do NOT also add handlers, tests, docs, or anything "logically related". The reference reads the task literally.

2. **Minimal diff.** Each edit = smallest change satisfying the task. No cosmetic changes, no reformatting, no whitespace adjustments, no refactoring.

3. **Append, don't prepend.** New entries in lists, enums, switches, OR-chains: add at the END. \`defined(A) || defined(B)\` + C → \`defined(A) || defined(B) || defined(C)\`. Never prepend.

4. **Copy naming from context.** Before naming anything, look at the surrounding code in the SAME file. Use the exact same variable names, function name patterns, and abbreviations. If nearby code uses \`idx\`, don't use \`index\`. If it uses \`encontrou\`, don't use \`found\`.

5. **Copy formatting from context.** Match indentation (tabs vs spaces, width), brace placement, quote style, semicolons, trailing commas, blank lines character-for-character from the immediately surrounding code.

6. **Strings verbatim.** Copy string literals from the task or existing code exactly. No paraphrasing, no translation, no punctuation changes.

7. **Source order.** Process files in alphabetical path order. Within each file, edit top-to-bottom. This aligns your changed-line sequence with the reference.

8. **No extras.** Do not add comments, docstrings, type annotations, error handling, imports (unless needed for your change), or anything not explicitly required.

9. **File permissions.** Never change file permissions. Lines like "old mode 100755 / new mode 100644" destroy your score.

## When done

Stop immediately. Do not re-read edited files. Do not verify. Do not summarize. The harness reads your diff from disk.

---

`;

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. Default: process.cwd() */
	cwd?: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
	} = options;
	const resolvedCwd = cwd ?? process.cwd();
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const date = new Date().toISOString().slice(0, 10);

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = TAU_SCORING_PREAMBLE + customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n# Project Context\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `## ${filePath}\n\n${content}\n\n`;
			}
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// Add date and working directory last
		prompt += `\nCurrent date: ${date}`;
		prompt += `\nCurrent working directory: ${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = TAU_SCORING_PREAMBLE + `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n# Project Context\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `## ${filePath}\n\n${content}\n\n`;
		}
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// Add date and working directory last
	prompt += `\nCurrent date: ${date}`;
	prompt += `\nCurrent working directory: ${promptCwd}`;

	return prompt;
}
