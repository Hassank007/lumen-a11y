/**
 * Prompt templates. Defaults live here; Firebase Remote Config can override them
 * at runtime so they can be tuned without shipping a new extension version.
 */
export const DEFAULT_PROMPTS = {
  altText:
    'You write alt text for blind and low-vision screen reader users. ' +
    'Describe the most important thing in this image in ONE short phrase of 5 to 12 words (under 100 characters). ' +
    'No lists, no line breaks, no preamble, no quotes. ' +
    'Do not start with "image of" or "picture of". If there is short readable text in the image, include it. ' +
    'If the image is purely decorative, reply with exactly: DECORATIVE',
  linkText:
    'A web link has unhelpful text: "{text}". It points to: {href}. Surrounding text: "{context}". ' +
    'Write link text of 2 to 5 words that says where the link goes, ' +
    'without "click here" or "link". Reply with the link text only, on one line, no quotes.',
  simplify:
    'Rewrite the following web page text in plain language for people with cognitive or learning disabilities. ' +
    'Use short sentences, common words, and keep every important fact. Use a short bullet list where it helps. ' +
    'Do not add anything that is not in the text.\n\n{text}',
} as const;

export type PromptKey = keyof typeof DEFAULT_PROMPTS;

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
