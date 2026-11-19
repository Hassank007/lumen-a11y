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
  ask:
    'You help a blind person who uses a screen reader understand a web page. ' +
    'Answer their question using only the page information below. ' +
    'Reply in 1 to 3 short sentences of plain text, with no markdown. ' +
    'If the answer is a link, button or form field, give its exact name in quotes so they can find it with their screen reader. ' +
    'If the page does not say, reply that the page does not say.\n\n' +
    'Question: {question}\n\nPage title: {title}\n\nHeadings:\n{headings}\n\nLinks, buttons and fields:\n{controls}\n\nMain text:\n{text}',
} as const;

export type PromptKey = keyof typeof DEFAULT_PROMPTS;

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
