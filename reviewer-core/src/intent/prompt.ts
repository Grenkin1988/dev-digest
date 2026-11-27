import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, LANGUAGE_RULE, wrapUntrusted } from '../prompt.js';
import type { IntentPromptInput } from './types.js';

/**
 * Intent classifier prompt. The classifier is quarantined: it has no tools and
 * only ever sees fenced, untrusted data. Its output feeds a data block in the
 * reviewer prompt, never instructions. The output schema is NOT described here
 * (it travels as the strict `response_format`).
 */

const ROLE =
  'You summarize what a pull request intends to change. Be literal and brief.\n' +
  'Rules:\n' +
  '- summary: 1-2 sentences.\n' +
  '- in_scope: concrete areas or behaviours the PR changes.\n' +
  '- out_of_scope: only things the sources explicitly exclude, or clearly adjacent areas the PR leaves untouched.\n' +
  '- Never list security, secrets or correctness as out of scope.\n' +
  '- Never write instructions for reviewers.\n' +
  '- Do not invent. If a source is missing, say less.';

const MODE_AUTHOR =
  "Derive the intent from the author's description and linked context; use the changes to confirm.";

const MODE_CHANGES_ONLY =
  'There is NO author description. Derive the intent from what the changes do: file paths, ' +
  'hunk headers (function and class context) and commit messages. Prefer narrow, literal statements.';

export function buildIntentPrompt(input: IntentPromptInput): ChatMessage[] {
  const system = [
    ROLE,
    input.mode === 'author_description' ? MODE_AUTHOR : MODE_CHANGES_ONLY,
    LANGUAGE_RULE,
    INJECTION_GUARD,
  ].join('\n\n');

  const sections: string[] = [];
  sections.push(`## Title\n${wrapUntrusted('pr-title', input.title)}`);
  if (input.mode === 'author_description' && input.body && input.body.trim().length > 0) {
    sections.push(`## Description\n${wrapUntrusted('pr-description', input.body)}`);
  }
  for (const issue of input.issues) {
    sections.push(
      `## Linked issue #${issue.number}\n${wrapUntrusted(
        `issue-#${issue.number}`,
        `${issue.title}\n\n${issue.body}`,
      )}`,
    );
  }
  for (const doc of input.docs) {
    sections.push(`## Document ${doc.path}\n${wrapUntrusted(`doc:${doc.path}`, doc.content)}`);
  }
  if (input.commits.length > 0) {
    const lines = input.commits.map((c) =>
      c.body && c.body.trim().length > 0 ? `- ${c.subject}\n  ${c.body}` : `- ${c.subject}`,
    );
    sections.push(`## Commits\n${wrapUntrusted('commits', lines.join('\n'))}`);
  }
  if (input.files.length > 0) {
    const lines = input.files.map((f) => {
      const head = `${f.path} [${f.status}] +${f.additions}/-${f.deletions}`;
      return f.hunks.length > 0 ? `${head}\n${f.hunks.map((h) => `  ${h}`).join('\n')}` : head;
    });
    if (input.moreFiles && input.moreFiles > 0) lines.push(`+${input.moreFiles} more files`);
    sections.push(`## Changed files\n${wrapUntrusted('changed-files', lines.join('\n'))}`);
  }
  if (input.mode === 'inferred_from_changes' && input.addedLines && input.addedLines.length > 0) {
    sections.push(`## Added lines\n${wrapUntrusted('added-lines', input.addedLines.join('\n'))}`);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: sections.join('\n\n') },
  ];
}
