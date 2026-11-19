---
name: copy-check
description: Checks user-facing copy (a page, a component, an email template, a set of strings) against IIIC's writing standard, the proof rule and the counselling and certificate wording rules, and reports what to change. Use after writing or changing any copy, before the reviewer runs.
argument-hint: [file, folder or route, e.g. src/app/(platform)/founders]
---

Check the copy in $ARGUMENTS.

1. Read `src/brand/VOICE.md` (all of it: names and terms, the proof rule, the writing standard, interface copy patterns, words to avoid, counselling and certificate wording) and `docs/content/copy-architecture.md` (how every line is labelled: `[IIIC]`, `[CS]`, `[proposal]`, `[[TODO: …, I-xx]]`).
2. Collect every user-facing string in $ARGUMENTS: JSX text, string literals rendered to the page, metadata titles and descriptions, alt text, email subjects and bodies, WhatsApp templates, error and empty-state messages, seed content.
3. For each string, check in this order and stop at the first failure:
   - **Traceability.** A line of page copy is one of: an `[IIIC]` line used verbatim from `docs/content/sources/`; a `[CS]` or `[proposal]` line that `docs/09-content-and-inputs.md` or `docs/decisions.md` records as approved (I-41); interface copy that follows the patterns table in VOICE.md; or a placeholder with its input ID. A fact (name, number, date, offer, credential, outcome, client, organisation) not in `docs/09-content-and-inputs.md` → known facts or `docs/content/sources/` is a Blocker.
   - **Words to avoid**, including "therapy", "therapist", "psychologist", "clinical", "diagnosis", "treatment", "cure", "heal", "degree", "diploma", "accredited", "recognised", "approved", "first", "first ever", "guaranteed", "safe space", "unlock", "transform", "journey" (outside IIIC's own lines).
   - **The writing standard**, points 1–14: filler tells (chains of long dashes, "In today's fast-paced world", "Imagine…", "Welcome to…", "It's not just X, it's Y", delve, navigate, landscape, tapestry, elevate, empower, seamless, holistic), triplets of abstract nouns outside the outcome band, three-word fragment headlines, exclamation marks, emojis, generic benefit lists, a closing that restates the opening, bold on random phrases, any sentence that implies the reader is broken, lost or stuck.
   - **Counselling surfaces** (counselling pages, the session booking flow, Map results, counselling emails and WhatsApp): the scope statement and the crisis numbers (Tele-MANAS 14416 or 1-800-891-4416; 112; 1098) are present; no offer, bridge, story, Sanskrit line or experience device appears.
   - **Interface patterns**: primary actions as verb + object in sentence case; declines read "No, thanks"; errors say what happened and how to fix it; helper text says what happens with the answer; Indian English spelling; dates, times and money in VOICE.md's formats; no price anywhere while `prices_public` is off.
   - **Markup for language**: Devanagari carries `lang="sa"` or `lang="hi"`; Gujarati `lang="gu"`.
4. Report a table: file and line · the string (shortened) · the rule it fails · the smallest rewrite that passes, or "needs a fact: I-xx" when a rewrite would invent one. Severity: Blocker (an invented fact, a clinical or certificate word, a missing scope statement), Fix (a filler tell, a wrong pattern, an unapproved candidate line), Note (style). End with "Passes" and the count of strings checked when nothing fails.

Do not rewrite the files yourself unless asked; do not propose new facts; do not soften a Blocker because the copy reads well.
