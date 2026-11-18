import { describe, expect, it } from 'vitest';
import { tidyAlt, tidyLink } from '../src/lib/tidy';

describe('tidyAlt', () => {
  it('keeps a short answer as is', () => {
    expect(tidyAlt('A black Labrador puppy sitting on wooden boards.')).toBe('A black Labrador puppy sitting on wooden boards.');
  });

  it('keeps only the first sentence and first line', () => {
    expect(tidyAlt('A pug wrapped in a blanket. It looks cosy and the forest is green.\n\nMore details here.'))
      .toBe('A pug wrapped in a blanket.');
  });

  it('removes preambles, quotes and "image of"', () => {
    expect(tidyAlt('Alt text: "Image of a dog on a path"')).toBe('A dog on a path');
  });

  it('cuts long text at a word boundary within the limit', () => {
    const long = 'A black puppy ' + 'with very shiny fur '.repeat(20);
    const out = tidyAlt(long);
    expect(out.length).toBeLessThanOrEqual(125);
    expect(out.endsWith(' ')).toBe(false);
    expect(long.startsWith(out)).toBe(true);
  });

  it('normalises DECORATIVE', () => {
    expect(tidyAlt(' decorative.\n')).toBe('DECORATIVE');
  });
});

describe('tidyLink', () => {
  it('limits to six words and strips quotes and periods', () => {
    expect(tidyLink('"Adopt Bella the two year old Labrador mix today."')).toBe('Adopt Bella the two year old');
  });

  it('uses the first non-empty line only', () => {
    expect(tidyLink('\nAdopt Bella\nThis link goes to her page')).toBe('Adopt Bella');
  });
});
