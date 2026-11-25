# Lumen: an on-device accessibility copilot for Chrome

Lumen is a Chrome extension that finds accessibility barriers on regular web pages and fixes some of them in your browser: images with no alt text, links that say "click here", and dense text that is hard to read. **It chooses where AI runs for each page.** Pages that look private (health, banking, sign-in, personal forms) stay on your device. Other pages use Gemini Nano on your device first, and Gemini in the cloud when Nano isn't available or the text is long. You can also turn cloud AI off.

Built for the **#BuildHybridAI 2026** hackathon with **Firebase AI Logic** hybrid inference.

## Why

- 95.9% of the top one million home pages have detectable WCAG failures, and missing alt text and vague links are among the most common ([WebAIM Million 2026](https://webaim.org/projects/million/)).
- Screen reader users hear "image" or "link, click here" and have to guess.
- People with cognitive disabilities or low literacy, and people reading in a second language, can struggle with long, dense text.

Sending every page you read to a cloud model is a privacy problem, often on exactly the pages that matter most (health, banking, government). On-device AI helps with that, but it is slow on long text: on the development laptop a 5,600-character page took 68 seconds on the device and 6.8 seconds in the cloud. So Lumen decides page by page, and says what it decided.

## What it does

Open the Lumen side panel on any page and press **Scan this page**.

| Feature | What happens |
|---|---|
| **Barriers, in plain words** | "This page has 6 barriers. Lumen can fix 5 of them for you below; 1 needs the site owner." Lumen runs **axe-core** (WCAG 2.2 A and AA) on the live page and checks again after every fix you apply, so the message updates as barriers go away. The numbers and rule names are in a collapsed section for site owners and developers. |
| **Tell the site owner** | Drafts a short, polite message listing the problems found, which you can edit, copy, or open in your email app (Lumen finds the site's contact email). Lumen's fixes only live in your browser, so this is how a page gets fixed for everyone. Nothing is sent by Lumen. |
| **Ask about this page** | Ask in plain words ("What is this page about?", "How do I contact them?") and get a short answer from the page's own content, including footers and tables. It is told to name the exact link or button, so you can look for it with your screen reader. |
| **Ask by voice** | Press the microphone, ask, press Stop. Firebase AI Logic's on-device path doesn't take audio, so the recording is turned into text by Gemini in the cloud. Lumen says so next to the button, and voice is off on private pages and in "Only on my device". |
| **Read answers aloud** | Optional, off by default, for people who don't use a screen reader (low vision, dyslexia, cognitive disabilities). Uses only a voice installed on the computer, and stays silent if there is none. Screen reader users shouldn't need it: results also go to a live region. |
| **Alt text** | Lists images with no text alternative (and, separately, the images that are already fine). Lumen writes short alt text from the image itself. WebP, AVIF and SVG images are converted to PNG on your computer first, because the on-device path accepts only JPEG and PNG. Press **Apply to page** to add it to the live page, where a screen reader can pick it up, or **Undo** to put the page's own version back. |
| **Link text** | Finds links like "click here" and "read more", and links with no text at all, and suggests text that says where the link goes, from the link's surroundings. Applying it rewrites the visible link text, so the spoken name always matches what's on screen (WCAG 2.5.3, Label in Name). |
| **Plain language** | Rewrites the page's main text in short sentences and common words. The text streams in as it is written. Long pages go to the cloud first, or part by part on the device if the cloud is off for that page. **Stop** keeps what is done so far. |
| **Automatic privacy** | After a scan, Lumen says whether the page looks private and why ("it has a password field"), and keeps AI on the device there. "Allow cloud AI for this page" is one button away. "Only on my device" turns cloud AI off everywhere and is remembered. Lumen still contacts Google for its own settings (Remote Config) and App Check, and loads images from the page's site when it describes them. |
| **Where it ran** | Every AI answer shows a badge: **On device** or **Cloud** (or **Source not reported**), with the time taken. |

If you move to another page, Lumen says that its results are for the page you scanned.

Lumen only changes the page in your own browser tab. It never edits the website itself.

## Who it's for

- **Blind and low-vision people who use a screen reader:** ask about any page (by keyboard or voice), get images described and links named, and tell the site owner what's broken.
- **People with cognitive or learning disabilities, low literacy, or reading in a second language:** the plain-language rewrite, with optional read-aloud.
- **Testers, developers and content authors:** the axe-core details and ready-made fixes.

## How the hybrid works

Every AI request goes through **Firebase AI Logic**. The page and the task choose the mode (`src/lib/policy.ts`):

| Page | Short task (alt text, link, question) | Long text (over 4,000 characters) |
|---|---|---|
| Ordinary | `PREFER_ON_DEVICE` | `PREFER_IN_CLOUD` |
| Looks private | `ONLY_ON_DEVICE` | `ONLY_ON_DEVICE`, in parts |
| Looks private, and the user allowed the cloud | `PREFER_ON_DEVICE` | `PREFER_IN_CLOUD` |
| "Only on my device" is on, or the build has no Firebase project | `ONLY_ON_DEVICE` | `ONLY_ON_DEVICE`, in parts |

Voice to text is `ONLY_IN_CLOUD`, and is offered only where the cloud is allowed.

- **What looks private** (`src/lib/sensitive.ts`): words in the address, password and card fields, questions such as date of birth, and the title and main heading. It runs in the page, with no AI and no network call. It is a guess and can miss private pages, which is why "Only on my device" is there.
- **The mode is fixed when you press the button**, for the page that was scanned then, so scanning another page can't change where the first page's content goes.
- **Less is sent:** link addresses go to the model without their query string, and questions are answered from the parts of the page that match them (`src/lib/relevance.ts`), because Nano can't read a whole long page at once.
- **On device:** Chrome's built-in Gemini Nano. Chrome chooses the model version. Development used the version Chrome installed (`v3Nano`); to try Gemini Nano 4, turn on `chrome://flags` → "Gemma 4 for Built-in AI". Lumen has not been tested with it yet.
- **Model download:** `initializeDeviceModel`, only when you press "Download on-device AI".
- **`inferenceSource`** from each response drives the badge, so the user can see where the AI ran.

Firebase products used:

- **Firebase AI Logic:** hybrid inference (`firebase/ai`), with `generateContent` and `generateContentStream`.
- **App Check:** used with Firebase AI Logic. A Manifest V3 extension can't load reCAPTCHA's remote script, so the extension uses a registered debug token. The web demo uses the reCAPTCHA v3 provider.
- **Remote Config:** the code reads the prompts and the cloud model name from Remote Config, with built-in defaults, so they could be changed without a new version.

## Accessibility of Lumen itself

An accessibility tool has to be accessible. The side panel:

- uses real headings, a labelled privacy fieldset and native buttons;
- announces scan results, applied fixes and finished rewrites through one polite live region, without stealing focus;
- moves focus to the results heading after a scan and to the plain-language result when it's ready,
- gives every repeated button a name that starts with its visible text ("Apply to page, image 2"), so voice-control users can say what they see (WCAG 2.5.3),
- passes axe-core with 0 violations (WCAG 2.2 A and AA, and best practices), checked in Chromium on 26 Nov 2026 in light and dark, before and after a scan, and keeps the streaming progress line out of the live region so it doesn't chatter;
- is built from native controls. In a check on 23 Nov every control could be reached with Tab and had a visible focus style.

Not tested: NVDA, JAWS or other screen readers, and Chrome's real side panel (the checks opened the panel page in a tab). AI answers were not part of these checks.

The project is directed by a Section 508 Trusted Tester.

## Try it

**Requirements:** Chrome 138 or newer (desktop). For on-device mode, a computer that meets Chrome's [built-in AI hardware requirements](https://developer.chrome.com/docs/ai/get-started). Without it, Lumen uses the cloud, except on private pages.

### The extension, on-device only (no Firebase project needed)

```bash
npm install
npm run build:keyless
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick the `dist` folder. Click the Lumen icon, then **Scan this page**.

### The extension, with cloud AI

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web app config
npm run build
```

1. Create a Firebase project, add a web app, and enable **Firebase AI Logic** (Gemini Developer API).
2. Turn on **App Check** and register a debug token (Firebase console → App Check → Apps → Manage debug tokens). Put it in `VITE_APPCHECK_DEBUG_TOKEN`.
3. Load `dist` as above.

### The web demo (Lumen's panel next to made-up pages)

```bash
npm run build:demo
python -m http.server 8766 --directory dist-demo
```

Test pages with known problems are in `test-page/`, all made up: an ordinary page (`demo.html`), a private one (`clinic.html`), a long one (`council.html`) and a smaller `index.html`. `demo.html` is a made-up small-business page with deliberate problems (axe-core finds 6 issues; after Lumen's fixes, 1 remains, a contrast problem only the site owner can fix):

```bash
python -m http.server 8765 --directory test-page
```

## Development

```bash
npm test          # Vitest: scanning, names, privacy rules, modes, relevance, fixes and undo, summaries, audio, prompts (74 tests)
npm run typecheck
npm run dev       # rebuild on change
```

| Path | What it is |
|---|---|
| `src/lib/policy.ts` | Chooses the Firebase AI Logic mode for each page and task |
| `src/lib/sensitive.ts` | Decides whether a page looks private |
| `src/lib/ai.ts` | Hybrid model setup, `generate`, `generateStream`, voice to text, model download |
| `src/lib/image.ts` | Converts any image to one the on-device model accepts |
| `src/lib/relevance.ts` | Picks the parts of a page that fit a question; splits long text |
| `src/lib/names.ts` | Accessible names, as a screen reader would say them |
| `src/lib/firebase.ts` | Firebase app, App Check, Remote Config |
| `src/lib/scan.ts` | Finds images without alt text, already-OK images and vague links; builds the page outline for questions |
| `src/lib/audit.ts` | Summarises axe-core results, writes the plain-words summary and the message to the site owner |
| `src/lib/audio.ts` | Converts voice recordings to 16 kHz WAV |
| `src/lib/prompts.ts` | Default prompts (overridable from Remote Config) |
| `src/lib/speech.ts` | Picks an installed voice for read-aloud; badge text |
| `src/lib/tidy.ts` | Trims model answers to usable alt text and link text |
| `src/lib/page-agent.ts`, `src/content.ts` | Run in the page: scan, highlight, apply fixes, undo |
| `src/sidepanel/` | The side panel UI |
| `demo/` | The web demo around the panel |

## Limits

- AI-written alt text is a starting point, not a replacement for an author who knows why an image is there. Lumen shows it before you apply it. In one test Nano called a dog in a blanket a person.
- A plain-language rewrite can leave things out. In one test Nano dropped a sentence about medicine, so the prompt was tightened and Lumen now says to check the page for anything important.
- The private-page check is a set of rules written in English. It will miss some private pages and catch some ordinary ones.
- Fixes apply to your tab only and are lost on reload.
- On-device mode depends on Chrome downloading Gemini Nano, which can take a while the first time.
- Speed varies. On the development laptop, on-device answers took 1.6 to 13.6 seconds on short text once the model was loaded, and first answers took 32 and 42 seconds.

## Credits

By Hassan Ahmed, who directed and tested the project. Claude Code wrote the code, tests and docs (AI assistants are allowed by the hackathon rules).

## License

[Apache 2.0](LICENSE)
