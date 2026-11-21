# Keyword map · what people search for, and which page answers it

The searches IIIC can win, grouped by the page that answers them, with the search title and description each page should carry. Written 21 November 2026 from the search research of that day (Google's suggestions for India, Google Trends over five years for India and Gujarat, the pages that rank today, and how the AI answer engines read sites). It serves the search titles and descriptions (D-65), the FAQs (I-20), the Journal (I-19), the Google Business Profile (`google-business-profile.md`) and the structured data (D-62 to D-64).

## How to read it

**Status**

- **T**: target now. The page can answer it from facts IIIC has already given (`09`, `sources/`).
- **C**: target once the named input or decision arrives; until then it is not used in a title, a description or a heading.
- **N**: never target, with the reason. Most are clinical words (`CLAUDE.md` #9), recognition claims (`08` §7), services IIIC does not sell (an invented service is an invented fact, `CLAUDE.md` #1), or searches whose meaning in India is something else.

**Evidence**

- **AC**: Google suggested it for India (autocomplete, `gl=in`, English, Hindi or Gujarati) on 21 November 2026, so people type it.
- **TR n**: Google Trends, the five-year average for India (or Gujarat, "GJ"), relative to "personality development" at 55 in the same comparison. Relative only; it is not a volume.
- **SR**: seen in the pages that rank today, or in the competitors' titles.
- **F**: a form people type that the research did not measure (a spelling, a city name, a modifier). Check it in Google Keyword Planner before launch.

No source gave monthly volumes or costs. Before launch IIIC runs Google Keyword Planner (its own Ads account) on every T and C search below, for Ahmedabad and for Gujarat, and the figures are added to this file.

**Intent**: Nav (looking for a named organisation or person), Loc (a service nearby), Com (comparing before buying), Info (wants an answer).

## What a search title may and may not do (D-65)

IIIC's owner put getting business first for search copy (21 November 2026), so a title or description may lead with the searched words, name Ahmedabad and the service plainly, and differ from the page's heading. What still holds:

- Only facts in `09` and `sources/`. IIIC's own lines are quoted word for word.
- No superlative or first without evidence: "best", "top", "No. 1", "leading", "first", "only", "most trusted" (CCPA guidelines, 2022; `08` §6).
- No clinical word about counselling: therapy, therapist, psychotherapy, psychologist, counselling psychologist, psychiatrist, clinical, diagnosis, treatment.
- No degree, diploma, university course, accredited, recognised or approved about IIIC or its course.
- No price, fee or "with fees" while `prices_public` is off (D-21).
- No service IIIC does not sell.
- No keyword list, no string of variants ("IIIC | IIIC India | Image Catalysts | Ahmedabad"), no `keywords` meta tag.
- Limits: title ≤ 53 characters (the tab adds " · IIIC"), description ≤ 155, no placeholder.

## The modifiers people add, and how each is met

The same base search arrives with many modifiers. None of them needs a page of its own; doorway pages per city, area or modifier are what Google's scaled-content policy removes.

| Modifier | Example | How it is met | Status |
| --- | --- | --- | --- |
| best, top, No. 1, leading, famous, good, trusted | best business consultant in ahmedabad (AC for life coach, career counselling, marriage counselling, corporate training) | The base search is targeted; Google reads "best" as a quality filter and answers it with relevance, the Business Profile's reviews and proximity. The word itself is never written about IIIC. | T for the base search; the word itself N (CCPA 2022) |
| near me | counselling near me, self awareness courses near me (AC), personal counselling near me (AC) | The Business Profile and the address in the page's text and markup. Never write "near me". | T through the profile |
| in Ahmedabad | management consultant ahmedabad (AC) | The city in the title, the first paragraph and the address | T |
| Amdavad, Ahmadabad, Ahemdabad, Ahd | counsellor in amdavad | The engine matches the spellings; the page writes "Ahmedabad" only | T (never written) |
| the office's own area | iiic thaltej, iiic hebatpur, counselling in thaltej | The address on the page, in the markup and on the profile, once the address is settled | C (I-33) |
| other areas of the city | counsellor in bodakdev, business consultant sg highway, satellite, vastrapur, prahladnagar, bopal, gota, sola, science city | The Business Profile's proximity; no page per area | N (doorway pages; one office) |
| Gandhinagar, Vadodara, Surat, Rajkot | business consultant vadodara | Only if IIIC serves there and says so | C (I-49) |
| in Gujarat | management consultancy gujarat (SR) | Named where a fact supports it (the PDEU workshop is in Gandhinagar, Gujarat) | C (I-49) for services |
| in India | business consultant for SMEs in India | National head terms belong to large firms and directories | C (I-49) |
| online | online counselling (TR 30, mostly exam admissions), self awareness courses online (AC) | Only for a service IIIC confirms runs online, and always qualified ("one-to-one counselling online") | C (I-08, I-49) |
| with fees, fees, cost, price, charges | personality development classes in ahmedabad with fees (AC), how much does family counselling cost (AC) | An FAQ may say how fees are shared, never a figure | N while D-21 holds |
| for kids | personality development classes for kids (AC) | Not IIIC's offer; the finishing school is for 17+ | N |
| for adults, for students, for young adults | life skills course for adults (AC), life skills courses for young adults (AC) | On `/learn`, with SSB's "It is not age based. It is awareness based." | T |
| spellings | counseling, counselor (US), organization, catalyst (singular, AC), consulting, consultants, consultancy | The engine matches them; the page writes Indian English (counselling, organisation, consultancy) | T (never written) |

## Brand, name and founder · `/` and `/about`

"IIIC" alone belongs in search to the Indian Institute of Infrastructure and Construction, Kollam (Wikipedia redirects "IIIC" to it), and to several other organisations. IIIC wins its full name, "IIIC Ahmedabad" (no Ahmedabad organisation uses exactly IIIC), "Image Catalysts Ahmedabad", "IIIC Subjective Self" and the founder's name with a qualifier (D-63).

| Search | Intent | Evidence | Status | Page and notes |
| --- | --- | --- | --- | --- |
| indian institute of image catalysts | Nav | AC | T | `/`, `/about`; the full name in the home title and `og:site_name` (D-63) |
| indian institute of image catalyst | Nav | AC | T | Matched by the engine; the singular is never written |
| indian institute of image catalysts ahmedabad | Nav | AC | T | `/about` |
| indian institute of image catalysts ahmedabad photos | Nav | AC | T | The Business Profile's photos (`google-business-profile.md`); a Maps listing exists (seen on 21 November 2026), and IIIC claims it |
| iiic ahmedabad | Nav | AC | T | `/about`; the realistic acronym target |
| iiic amdavad, iiic gujarat | Nav | F | T | Matched through `/about` and the profile; not written |
| iiic full form, what is the full form of iiic, iiic stands for | Info | AC | T | `/about`, first sentence: "IIIC stands for Indian Institute of Image Catalysts" (the sentence answer engines lift) |
| iiic image catalysts, image catalysts iiic | Nav | F | T | `/`, `/about` |
| image catalysts ahmedabad | Nav | SR | T | `/about` |
| image catalysts | Nav | SR | C (I-48) | Alone it returns pictures of chemical catalysts; "Image Catalysts" becomes an alternate name only on IIIC's confirmation |
| iiic india | Nav | AC (returns the Kerala institute) | C (I-48) | The Instagram handle `@iiic.india`; an alternate name only on IIIC's confirmation, never strung into copy |
| iiic | Nav | AC (Kollam, Kerala, logo, login) | N as a target | Contested; answered by the full name and the city, and by the disambiguation FAQ on `/about` |
| iiic subjective self, subjective self iiic | Nav | F | T | `/framework`, `/` |
| iiic counselling, iiic consultancy, iiic course | Nav | F | T | The door pages |
| iiic reviews, indian institute of image catalysts reviews | Nav | F | C (I-42, D-37) | `/proof` once reviews are published; no rating markup |
| iiic contact number, iiic address, iiic timings | Nav | F | T | `/about`'s contact section and the footer; the PIN after I-33 |
| iiic ahmedabad address, iiic hebatpur road, iiic thaltej | Nav | AC (for the name and city) | C (I-33) | One address, one PIN, everywhere |
| iiicedu, iiicedu.com | Nav | SR | T | The old domain's 301s to the platform at launch (`02` Redirects) |
| gaurang mistry | Nav | SR (crowded: a dentist, an engineer) | T | `/about`; the `Person` node and "Image Consultant" separate him (D-64) |
| gaurang mistry ahmedabad | Nav | AC | T | `/about` |
| gaurang mistry image consultant | Nav | F | T | `/about`; his title in the general brochure |
| gaurang mistry iiic, gaurang mistry founder | Nav | F | T | `/about` |
| gaurang mistry subjective self | Nav | SR | T | `/framework`, `/about` |
| gaurang mistry reviews | Nav | F | C (I-42, D-37) | `/proof` |
| gaurang mistry linkedin | Nav | SR | C (I-45) | The confirmed profile, linked from his `Person` node |
| dr gaurang mistry | Nav | AC (a dentist in Navi Mumbai) | N | No doctorate is claimed anywhere; never "Dr." (`09`) |
| gaurang mistry psychologist | Nav | SR (a search summary) | N | Never "psychologist" (`CLAUDE.md` #9); I-45 asks him to check his headline |
| ankvishwa, ankvishwa gaurang mistry | Nav | SR | N | Kept apart from the platform (D-26) |
| indian institute of image consultants, indian institute of image management, indian school of image management | Nav | AC (neighbours) | N | Other organisations, or misremembered names; the full name and the founder's page answer the confusion |

Where a page has a starter file, its search title and description live there (`src/content/starter/<page>.ts`) until the page is published in the admin, and in the admin's `title` and `description` from then on (D-51, D-68); they are written to the T searches of its section. The lines below give the searches each must carry and, for pages without a starter file yet, a candidate.

**Home (`/`).** Title fixed: "Indian Institute of Image Catalysts · Subjective Self" (53, `12` §3). Description: the full name, "IIIC", Ahmedabad and the three doors in searched words (`home.ts`). The first screen of copy carries the full name, "IIIC" and "Ahmedabad" together, and names the three doors in the words people search for.

**About (`/about`).** Title and description (`about.ts`) carry the full name, Ahmedabad, "IIIC" and the founder as "image consultant Gaurang Mistry". FAQs (I-20): what IIIC stands for; what IIIC does (the philosophy's first sentence); who founded it ("Mr. Gaurang Mistry, Image Consultant and founder of IIIC", GB); where it is and when it is open (the PIN after I-33); "Is IIIC the same as the Indian Institute of Infrastructure and Construction in Kerala?" (IIIC writes or approves a one-line factual answer); "Does IIIC award degrees or diplomas?" (the fixed certificate statement, `08` §7, only).

## The framework · `/framework`

The generic term "subjective self" belongs to psychology textbooks (the I and the Me); IIIC wins it with the qualifier and by defining its own term, with a `DefinedTerm` node (D-62).

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| subjective self | Info | AC, TR 0 | T | IIIC's definition first, in its own words |
| subjective self framework | Info | F | T | |
| subjective self meaning | Info | AC | T | |
| subjective self concept | Info | AC | T | |
| subjective self awareness | Info | AC | T | |
| subjective self vs objective self, subjective and objective self | Info | AC | T | The Object/Subject flip on the page; a Journal article |
| subjective self theory, subjective self psychology | Info | F | T | Without "first" (I-31) |
| subjective self course, subjective self workshop | Com | SR | T for the course and for the 2023 workshops as past facts; a current workshop offer C (I-11) | Links on to `/learn` and `/institute` |
| self awareness | Info | TR 35 | T | Used where IIIC's text uses it ("signature self awareness curriculum", SSB) |
| self awareness meaning, what is self awareness | Info | AC | T | A Journal article |
| how to know yourself, know yourself | Info | AC | T | A Journal article |
| know thyself, know thyself meaning | Info | AC, TR 0 | T | The signature line |
| atmanam viddhi, atmanam viddhi meaning, आत्मानं विद्धि meaning | Info | AC | T | आत्मानं विद्धि with `lang="sa"` and ātmānaṃ viddhi (D-36) |
| indian psychology | Info | TR 30 (mostly academic) | T | "an Indian framework of psychology", never "first" |
| indian theory of psychology, first indian theory of psychology | Info | F | C (I-31) for "theory"; "first" N until evidence and a lawyer's view | IIIC's own brochure says there is no single Indian theory of psychology |
| concepts of self in the bhagavad gita, bhagavad gita self realization, bhagavad gita self control | Info | AC | C (I-10, I-41); T only for naming the research basis on `/framework` in GB's words | GB names IIIC's research basis ("Concepts of Self through Bhagwad Gita") but answers none of these questions; Journal topics once IIIC writes its interpretation (#13); the framework is not religious instruction |
| self realization | Info | TR 5 | C (I-10, I-41) | Journal only, as #13 |
| mental clarity, conscious choice, decision making | Info | F | T | SSB: "The aim is not motivation, but mental clarity." |
| bhagavad gita leadership course | Com | TR 0 | N | IIM Ahmedabad's ground; not an IIIC course |
| spiritual healing, numerology, date of birth reading | Com | SR | N | Not offered (D-26) |

Title and description (`framework.ts`): "Subjective Self" first, with IIIC and Ahmedabad, and the definition from IIIC's 2026 description, "rather than merely" kept; "an Indian framework of psychology", never "first". FAQs: what Subjective Self is; the four steps; where it comes from (GB, quoted with the brochure's spelling); who it is for; what आत्मानं विद्धि means; how it differs from the textbook term (IIIC writes); whether it is a religious teaching (IIIC writes).

## Consultancy, the core business · `/organisations`

Directories own page one (Clutch, The Manifest, IndiaMART, Noomii). None of the local firms ties people, processes and culture to one named framework; that is IIIC's opening.

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| management consultant ahmedabad, management consultant in ahmedabad | Loc | AC, TR 18 (IN) | T | IIIC's own label, "Business & Management Consultancy" |
| management consultancy ahmedabad, management consulting firms in ahmedabad | Loc/Com | F | T | |
| business consultant ahmedabad, business consultant in ahmedabad | Loc | AC, TR 19 (IN), 12 (GJ) | T | The largest consultancy term in Gujarat |
| business management consultant in ahmedabad | Loc | AC | T | |
| business consultancy ahmedabad, business consulting services ahmedabad | Loc | F | T | |
| best business consultant in ahmedabad, top management consultants in ahmedabad | Com | AC (pattern) | T base; "best"/"top" never written | Met by relevance and the profile's reviews |
| business consultant near me, management consultant near me | Loc | F | T through the profile | |
| small business consulting firms in ahmedabad | Com | SR (Clutch) | T | An honest Clutch profile is itself a route (`google-business-profile.md`) |
| business consultant for SMEs, business consultant for small and mid-size businesses | Com | F | T | IIIC's target: small and mid-size non-e-commerce businesses (`09`) |
| SME consultant ahmedabad, consultant for SMEs in gujarat | Com | F | T (Ahmedabad); C (I-49) for Gujarat | |
| management consultancy gujarat, business consultant gujarat | Loc | SR | C (I-49) | |
| business consultant india, business coach india | Com | SR | N | National brands own them (Bada Business and others) |
| leadership development program, leadership development programme | Com | TR 15 | T | The philosophy's leadership development |
| leadership development program for SMEs, for founders | Com | F | T | The SME and founder tail; IIM Ahmedabad owns the head term |
| leadership training ahmedabad, leadership training in ahmedabad | Loc | AC | C (I-11) | A training programme is GB's "Leadership Development Programmes", which waits on I-11, as management training does |
| management training ahmedabad | Loc | AC | C (I-11) | Only if IIIC runs training programmes for managers |
| standard operating procedures consultant, SOP development for small business | Com | F | T | Always "standard operating procedures (SOPs)", never "SOP" alone |
| standard operating procedures for SMEs, SOPs and systems for SMEs | Com | F | T | "we build organisational systems, processes and Standard Operating Procedures (SOPs) through an HR-centric approach" |
| business systems and processes consultant, business process consultant ahmedabad | Com | F | T | |
| people processes culture, people process and culture consulting | Info | F | T | The three pillars |
| organisational culture, organisational culture consultant, culture building in organisations | Com | F | T | |
| organisational culture assessment | Com | F | C (I-11) | GB: "Manpower Planning & Organisational Culture Assessment" |
| HR systems for SMEs, HR-centric consulting | Com | F | T | Wording, not a page heading |
| hr consultant ahmedabad, hr consultancy, hr consultant near me | Loc | AC (all placement agencies) | N | Means recruitment in Ahmedabad; answered in an FAQ ("Is this recruitment?") without targeting it |
| sop, sop consultants, sop preparation consultants in ahmedabad | Com | AC (visa agents) | N | "SOP" alone means statement of purpose |
| msme consultant, msme loan consultant in ahmedabad | Com | AC | N | Means loans and registration; "SME/MSME leaders" stays as audience wording |
| business coach ahmedabad | Loc | AC, TR 7 (IN), 1 (GJ) | C (I-11) | Only if IIIC keeps "Performance Coaching" (GB); otherwise an FAQ, "Consultant or coach?" |
| corporate training ahmedabad, corporate training companies in ahmedabad, corporate trainer in ahmedabad | Loc | AC, TR 12 (IN), 3 (GJ) | C (I-11, I-38) | GB lists leadership and performance programmes for corporates |
| self awareness training for employees, leadership workshop for managers | Com | F | C (I-11) | |
| psychometric analysis for organisations, organisational diagnostics | Com | SR (GB) | C (I-11) | Consultancy pages only, never on counselling pages |
| business transformation consultant | Com | F | N | "Transformation" claims; VOICE.md's avoid list |
| what does a management consultant do | Info | AC | T | A Journal article |

Title and description (`organisations.ts`): business and management consultancy in Ahmedabad; leadership development; systems, processes and standard operating procedures (SOPs) for SMEs. FAQs: what IIIC does for organisations (philosophy); who it works with ("business owners, entrepreneurs, leaders and professionals", description); whether it writes standard operating procedures (philosophy); whether this is recruitment (IIIC writes); consultant or coach (IIIC writes); how an engagement starts (the proposal call; no fee while D-21 holds); which organisations (I-38).

### The services · `/organisations/[service]`

Names and page copy wait on I-11; the titles below use the three services IIIC's brief and the old site name.

| Page | Searches | Evidence | Status | Title (chars before/after " · IIIC") | Description |
| --- | --- | --- | --- | --- | --- |
| `/organisations/organisation-planning` | organisation planning consultant; organisational structure consultants (AC); organisation development consultant india; manpower planning consultant ahmedabad (GB term); HR systems for SMEs | AC, F | T (I-11 for the final name) | "Organisation planning consultancy for SMEs, Ahmedabad" (53/60) | "Organisation planning for small and mid-size businesses in Ahmedabad, part of IIIC's Business & Management Consultancy, built on Subjective Self." (145) |
| `/organisations/marketing-and-sales` | marketing and sales consultant for SMEs; sales and marketing strategy consultant ahmedabad; marketing consultant ahmedabad | F | T (I-11) | "Marketing and sales consultancy for SMEs, Ahmedabad" (51/58) | "Marketing and sales consultancy for small and mid-size businesses in Ahmedabad, part of IIIC's Business & Management Consultancy." (129) |
| `/organisations/brand-positioning` | brand positioning consultant (AC); brand identity consultant; brand positioning process (Info) | AC, F | T (I-11) | "Brand positioning consultancy for SMEs, Ahmedabad" (49/56) | "Brand positioning for small and mid-size businesses in Ahmedabad, part of IIIC's Business & Management Consultancy, built on Subjective Self." (141) |
| `/organisations/team-map` | team assessment for SMEs; team assessment tool | F | C (I-12) | "What a Team Map is, and how to request one" (42/49) | IIIC writes after I-12 |
| planned `/organisations/leadership` | leadership development program for SMEs; leadership training ahmedabad (AC) | AC, F | C (I-11) | "Leadership development for founders and SMEs" (44/51) | After I-11 |

Brand positioning is a consultancy service; it is never called image consulting.

## Founders and business owners · `/founders`

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| founder consultation | Com | F | T | IIIC's term; what it is waits on I-36 |
| consultant for founders and business owners, business consultant for founders | Com | F | T | |
| SME founder advisor ahmedabad, business advisor for founders | Com | F | T | |
| scaling a business, how to scale a business from 100 crore to 1000 crore | Info | F | T | The page's own story (IIIC's illustration, D-28); the figures are turnover, not prices (D-55) |
| family business consultant, family business consultants in india, leadership development program for family businesses | Com | AC, F | C (I-11) | Only if IIIC does family-business work |
| family business succession planning | Com | F | C (I-11) | |
| startup founder coaching, founder coaching | Com | AC (no Indian intent) | N | No Indian intent; "Performance Coaching" (GB) waits on I-11, as for "business coach ahmedabad" |
| SME and MSME leaders | — | `09` | Audience wording only | Not a service keyword (see "MSME consultant") |

Title and description (`founders.ts`): consultancy for founders and business owners, Ahmedabad; founders, business owners and SME/MSME leaders as the audience. IIIC's subheadline ("Your company has grown to the size of your thinking…") stays on the page, word for word.

## Image consulting · `/about` (the founder), a Journal explainer

"Image consultant" in India means styling, grooming and etiquette; IIIC offers none of these. The founder's title is the honest anchor.

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| image consultant ahmedabad | Loc | AC (ICBI's directory owns it) | T on `/about` only | His real title (GB); no service page |
| what does an image consultant do, image consultant meaning | Info | AC | T for what an image consultant does; C (I-41) for what an image catalyst is | A Journal article (#9) in IIIC's words; no source defines an image catalyst yet |
| image consultant kya hota hai | Info | AC (Hindi) | C (I-44) | A reviewed Hindi page or article |
| corporate image consultant, personal branding for founders, personal branding coach in ahmedabad | Com | AC, TR 3 | C (I-11) | Only if IIIC confirms it as a service |
| image consultant course ahmedabad, image consulting course, image consultant salary, image consultant jobs | Com | AC | N | IIIC's course is not an image-consulting certification |
| grooming classes ahmedabad, personal grooming, etiquette coach, wardrobe, colour analysis, stylist, executive presence coaching | Loc | AC, TR 46 (grooming), 26 (etiquette) | N | Services IIIC does not sell |

## Education · `/learn`

The listing sites (UrbanPro, Superprof, Sulekha, IndiaMART) own the large terms. IIIC's opening is a real syllabus page (I-14) with format and dates.

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| subjective self course, subjective self certification course | Com | F | T | Never "diploma", "degree", "accredited", "recognised" or "approved" |
| subjective self course ahmedabad | Loc | F | C (I-14, I-08, D-07) | Only once IIIC says where the course runs; the title names no city |
| self awareness course, self awareness courses near me, self awareness courses online | Com | AC | T; "near me" C (I-14, I-08, D-07); "online" C (I-08) | |
| self awareness workshop, self discovery workshop, self development workshops near me | Loc | AC, F | C (I-11; I-13 for dates) | A workshop offer waits on I-11; the 2023 workshops are past facts |
| certificate course in self awareness | Com | F | T | The fixed certificate statement on the page (`08` §7) |
| life skills course for adults, life skills courses for young adults, life skills courses for students | Com | AC, TR 37 (IN), 17 (GJ) | T | The three life skills (philosophy) |
| life skills course ahmedabad, life skills training in ahmedabad | Loc | F | C (I-14, I-08, D-07) | Only once IIIC says where the course runs |
| discipline, accountability, decisiveness | Info | F | T | The philosophy's definitions; a Journal article |
| self development course, self development kya hai | Com/Info | TR 24; AC (Hindi) | T (English); C (I-44) for Hindi | |
| personality development course ahmedabad, personality development classes in ahmedabad for adults, personality development training in ahmedabad | Loc | AC, TR 55 (IN), 35 (GJ) | C (I-41) | The largest education term. Named once on `/learn` as an honest comparison in wording IIIC approves; GB says the course accelerates "personality, leadership and life skills". Never pretends to be communication, English or grooming classes |
| what is personality development course | Info | AC | C (I-41) | A Journal article in IIIC's words |
| personality development classes in ahmedabad with fees | Com | AC | N | D-21 |
| personality development classes for kids | Com | AC | N | Not offered |
| finishing school ahmedabad, finishing school in india, what is finishing school | Loc/Info | AC | C (I-11) | GB: "an upcoming finishing school"; never "first finishing school in Gujarat" (I-31) |
| soft skills training ahmedabad, communication skills course, spoken english classes | Loc | TR 49 (soft skills, IN), 30 (GJ) | N | Not IIIC's offer; "soft skills" only where honest on corporate programmes (I-11) |
| subjective self info session | Com | F | C (I-13) | `Event` markup with dates |

Title and description (`learn.ts`): the title is "Subjective Self certification course" (36/43), with no city, since where the course runs waits on I-14, I-08 and D-07; the description names it as the course from IIIC, Ahmedabad (where IIIC is), with the three life skills, discipline, accountability and decisiveness. FAQs: what you will learn (philosophy); who can join ("It is not age based. It is awareness based.", SSB); format, length, dates and completion rule (I-14); whether it is online (I-08); whether the certificate is a degree or diploma (the fixed statement only); whether it is a personality development course (IIIC writes); what it costs (no figure while D-21 holds; IIIC writes how fees are shared).

## Counselling · `/counselling`

In India "counselling" alone mostly means admissions (NEET, JEE, AMU), and the counselling results in Ahmedabad are full of clinical words. IIIC competes only on the counselling and counsellor wording, always paired with a qualifier. Counselling pages carry no experience devices (`11`), and nothing said in counselling feeds keywords, analytics or review requests (`CLAUDE.md` #3).

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| counselling in ahmedabad, counselling ahmedabad | Loc | AC | T | |
| counsellor in ahmedabad, counsellor ahmedabad | Loc | AC | T | |
| counselling centre ahmedabad, counselling center ahmedabad | Loc | AC | T | |
| counselling near me, counsellor near me | Loc | F | T through the profile | |
| best counsellor in ahmedabad, top counselling centre in ahmedabad | Com | AC (pattern) | T base; "best"/"top" never written | |
| personal counselling, personal counselling near me, personal counselling online | Loc | AC | T; "online" C (I-08) | |
| one to one counselling ahmedabad, individual counselling ahmedabad | Loc | SR (old site's service name), F | T | 1:1 sessions of 15, 30 or 45 minutes (`09`) |
| family counselling ahmedabad, family counsellor in ahmedabad | Loc | AC, TR 5 (IN), 0 (GJ) | T | Family sessions are offered; their length waits on I-31 |
| family counselling near me | Loc | F | T through the profile | |
| relationship counselling ahmedabad, relationship counsellor ahmedabad | Loc | AC | C (I-41) | Only if IIIC confirms relationships in "who it helps" |
| marriage counselling ahmedabad, couple counselling ahmedabad, couples counselling | Loc | AC, TR 2 (IN) | C (I-41) | Only if couples are confirmed |
| online counselling india, online counselling with a counsellor | Com | TR 30 (mostly admissions) | C (I-08) | Always qualified |
| counselling in gujarati, gujarati speaking counsellor, counselling in hindi | Loc | AC (every suggestion is clinical) | C (I-44) | |
| counselling for young adults, counselling for students | Loc | F | C (I-41) | The "who it helps" line is a candidate |
| counselling meaning, what is counselling, what happens in a counselling session | Info | AC | C (I-22) | FAQs and a Journal article (#8); the lawyer reads them with the scope statement |
| how many counselling sessions | Info | AC | C (I-20: IIIC writes the answer; I-22) | No source gives a number of sessions |
| is counselling confidential | Info | AC | C (I-22) | Lawyer's wording; no unconditional promise |
| how much does family counselling cost | Info | AC | N while D-21 holds (an FAQ may say fees are not published, never a figure) | D-21: fees are not published |
| counselling kya hota hai, કાઉન્સેલિંગ એટલે શું | Info | AC | C (I-44) | |
| life coach ahmedabad, life coaching | Loc | TR 14 (IN), 4 (GJ) | N as a target | IIIC does not call itself a life coach; at most a Journal article, "Counsellor or life coach: what is the difference?" |
| career counselling ahmedabad, career guidance ahmedabad, career counselling after 12th | Loc | TR 20 (IN), 5 (GJ) | N | No career counselling is offered; psychometric analysis (GB) waits on I-11 and never appears on counselling pages |
| therapy, therapist, family therapist ahmedabad, relationship therapist, psychotherapy, psychologist, counselling psychologist, psychiatrist, clinical, diagnosis, treatment, anxiety or depression treatment, mental health treatment, gujarati speaking therapist or psychologist | Loc | AC (they lead the suggestions) | N | `CLAUDE.md` #9; no health markup either |
| NEET counselling, JEE counselling, admission counselling, AYUSH counselling, genetic counselling | Info | AC | N | Unrelated meanings |

Title and description (`counselling.ts`): counselling in Ahmedabad, one-to-one and family; the description may add the session lengths (15, 30 or 45 minutes). FAQs: what happens in a session (IIIC's sentence, lawyer); how long a session is (15, 30 or 45 minutes; family length I-31); what counselling covers and what it is not (the scope statement, fixed after the lawyer, `08` §7); who it is for (I-41); whether it is confidential (lawyer, I-22); whether you can meet online (I-08); which languages (I-44); what it costs (no figure, D-21); what to do in a crisis (the crisis numbers, `08` §7). No offers anywhere in it.

## Colleges and universities · `/institute` (and `/research`, `/programmes`, `/partnerships`)

| Search | Intent | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| subjective self workshop | Com | SR (the old event pages) | T for the 2023 workshops as past facts; a current workshop offer C (I-11; I-13 for dates) | PDEU, 3–4 April 2023; Cafe Venture Studio, 8–9 July 2023 |
| workshop for college students, workshop for university students | Com | F | C (I-11; I-13 for dates) | Programmes for colleges and universities are an open education offer (I-11) |
| self awareness workshop for students, self awareness workshop for college students | Com | F | C (I-11; I-13 for dates) | |
| life skills programme for colleges, life skills programme for colleges in gujarat | Com | F | C (I-11; I-13 for dates); Gujarat also I-49 | |
| faculty development programme for colleges in gujarat, faculty development program for teachers | Com | AC (mostly teachers seeking free online FDPs) | C (I-11) | GB lists Faculty Development Programmes |
| placement training for final year students, campus placement training | Com | F | C (I-11) | GB: "Placements and Training Centre" |
| pdeu workshop, pandit deendayal energy university subjective self | Nav | F | T | A fact on the page; I-47 asks PDEU for a linking page |
| verify iiic certificate | Nav | F | T (route only) | `/institute/verify` is noindex (D-67), so the page is reached from the certificate's QR code and `/institute` |

Title and description (`institute.ts`): the title is "Subjective Self research and university partnership" (51/58), what the page holds rather than an offer to colleges, which waits on I-11; the description names IIIC, Ahmedabad, research, programmes and partnerships, with the two-day workshop at Pandit Deendayal Energy University in April 2023 as a past fact.

## Proof, Journal, Map and the rest

- **`/proof`**: "iiic reviews", "gaurang mistry reviews" (Nav, C: I-42, D-37). Title (41/48) "IIIC reviews: Gaurang Mistry's programmes"; description after the reviews exist. No `Review` or `AggregateRating` markup.
- **`/journal`**: title (47/54) "The Journal: Subjective Self in work and family"; each article answers one searched question (order below).
- **`/map`**: "Find your path" stays; navigational, indexable, not optimised.
- **Legal pages**: plain titles ("Privacy notice" and so on), indexable, not optimised.
- **noindex routes** (D-67): `/book`, `/b`, `/feedback`, `/subscribe`, `/account`, `/search`, `/login`, `/map/go`, `/map/result`, `/institute/verify`, `/admin`. Plain names, no keyword work.

## Gujarati and Hindi searches

People type these (AC) or forms close to them (F). They are targeted only through human-reviewed Gujarati or Hindi pages with `hreflang` (`12` §3), once IIIC says which languages it works in (I-44); until then they appear only where they occur naturally, with `lang` set, and never as a keyword list or a machine translation.

| Search | Meaning | Evidence | Status | Where |
| --- | --- | --- | --- | --- |
| કાઉન્સેલિંગ એટલે શું | What is counselling? | AC | C (I-44) | A Gujarati counselling FAQ |
| કાઉન્સેલિંગ અમદાવાદ, કાઉન્સેલર અમદાવાદ | Counselling / counsellor, Ahmedabad | F | C (I-44) | A Gujarati `/counselling` |
| ફેમિલી કાઉન્સેલિંગ, પારિવારિક કાઉન્સેલિંગ | Family counselling | F | C (I-44) | |
| બિઝનેસ કન્સલ્ટન્ટ અમદાવાદ, મેનેજમેન્ટ કન્સલ્ટન્ટ | Business / management consultant | F | C (I-44) | |
| business consultant meaning in gujarati | — | AC | C (I-44) | |
| વ્યક્તિત્વ વિકાસ એટલે શું, personality development in gujarati | What is personality development? | AC | C (I-44, I-41) | |
| વ્યક્તિત્વ વિકાસ પત્રક | The school progress sheet Gujarat's schools fill in | AC | N | A different thing entirely |
| કરિયર કાઉન્સેલિંગ | Career counselling | AC | N | Not offered |
| આત્મજાગૃતિ, સ્વ-જાગૃતિ | Self-awareness | F | C (I-44) | |
| આત્માનં વિદ્ધિ | The signature line in Gujarati script | F | C (I-44) | Always as आत्मानं विद्धि with `lang="sa"` on the English pages (D-36) |
| counselling kya hota hai, life coach kya hota hai, image consultant kya hota hai | What is counselling / a life coach / an image consultant? | AC | C (I-44) | Hindi FAQs or articles |
| परामर्श, पारिवारिक परामर्श, परामर्श केंद्र अहमदाबाद | Counselling, family counselling, counselling centre Ahmedabad | F | C (I-44) | |
| व्यापार सलाहकार, प्रबंधन सलाहकार | Business adviser, management consultant | F | C (I-44) | |
| vyaktitva vikas, vyaktitva vikas kya hai, व्यक्तित्व विकास क्या है, personality development in hindi | Personality development | AC, TR 0 | C (I-44, I-41) | |
| self development kya hai | What is self-development? | AC | C (I-44) | |
| apne aap ko kaise jane, अपने आप को कैसे जाने | How to know yourself | AC | C (I-44) | A Hindi Journal article |
| आत्म जागरूकता क्या है, आत्म जागरूकता के लाभ, आत्म जागरूकता का महत्व, self awareness in hindi | Self-awareness: what it is, its benefits, why it matters | AC | C (I-44) | |
| gita ke anusar aatma kya hai | The self according to the Gita | AC | C (I-44, I-41) | IIIC's interpretation only |
| atmanam viddhi meaning in hindi, know thyself meaning in hindi | — | AC | C (I-44) | |

## Answer engines: the questions they are asked

AI answers draw on the same index (Googlebot for AI Overviews and AI Mode, Bing for Copilot and ChatGPT's search provider) plus their own search crawlers, all allowed (D-61). What they lift is a direct answer in the first sentence under a question, in the page's text. These questions get that treatment, on the page named or in the Journal:

- What is IIIC? / IIIC full form → `/about`
- Is IIIC the same as the Indian Institute of Infrastructure and Construction? → `/about` (IIIC writes)
- Who is Gaurang Mistry? → `/about`
- What is Subjective Self? / subjective self vs objective self → `/framework`, Journal
- What does an image consultant do, and what is an image catalyst? → Journal (I-41)
- What does a management consultant do for an SME? → Journal
- What is a Team Map? (I-12) · What is a Founder Consultation? (I-36)
- What is counselling, and what happens in a session? → `/counselling` (I-22)
- What does ātmānaṃ viddhi mean? → `/framework`, Journal

Every month IIIC asks ChatGPT, Gemini, Perplexity, Copilot and Claude "What is IIIC Ahmedabad?", "What is Subjective Self?", "Who is Gaurang Mistry, image consultant?" and "business consultant for SMEs in Ahmedabad", and notes the answers here with the date.

## The Journal's first articles, in order

One article per searched question, the question as the title, a one-sentence answer first, in IIIC's words (I-19, `12` §3). IIIC writes them; this is the order of value for the business, consultancy first.

| # | Title (the searched question) | Searches it answers | Door it links to | Status |
| --- | --- | --- | --- | --- |
| 1 | What is Subjective Self? | subjective self, subjective self meaning, subjective self framework | `/framework` | T |
| 2 | Standard operating procedures for a small business: where do you start? | standard operating procedures for SMEs, SOP development for small business | `/organisations` | T |
| 3 | People, processes and culture: what holds an SME together? | people processes culture, organisational culture | `/organisations` | T |
| 4 | What does a management consultant do for a small or mid-size business? | what does a management consultant do, business consultant for SMEs | `/organisations` | T |
| 5 | Subjective self and objective self: what is the difference? | subjective self vs objective self | `/framework` | T |
| 6 | Discipline, accountability, decisiveness: what does each mean? | life skills, discipline, accountability, decisiveness | `/learn` | T |
| 7 | What does ātmānaṃ viddhi mean? | atmanam viddhi meaning, know thyself meaning | `/framework` | T |
| 8 | What is counselling, and what happens in a session? | counselling meaning, what happens in a counselling session | `/counselling` | C (I-22: the lawyer reads it with the scope statement) |
| 9 | What does an image consultant do, and what is an image catalyst? | what does an image consultant do, image consultant meaning | `/about` | C (I-41: IIIC writes what an image catalyst is) |
| 10 | Consultant or coach: what is the difference? | business coach ahmedabad, consultant vs coach | `/organisations` | T |
| 11 | What is a personality development course, and where does Subjective Self fit? | personality development course ahmedabad, what is personality development course | `/learn` | C (I-41) |
| 12 | Counsellor or life coach: what is the difference? | life coach ahmedabad, counselling meaning | `/counselling` | C (I-22; the word "therapist" in a title needs the lawyer's view, and without it the title stays as written) |
| 13 | What do the Bhagavad Gita's concepts of self say about decisions? | concepts of self in the bhagavad gita, bhagavad gita self realization | `/framework` | C (I-10, I-41: IIIC's interpretation) |
| 14 | What is a finishing school? | what is finishing school, finishing school ahmedabad | `/learn` | C (I-11) |

## Off the site

The strongest measured correlate of being named in AI answers is mentions of the brand on other sites and in video, not links; listings and the brand's own site supply most citations. The actions, all IIIC's own: the Google Business Profile (`google-business-profile.md`), then Bing Places and Apple Business Connect; Instagram, LinkedIn and Facebook with the website set to `imagecatalysts.in` and the same entity sentence (I-34, I-48); honest Clutch and The Manifest profiles for the consultancy; Justdial with the identical name, address and phone; corrections asked of CB Insights and beBee (website, PIN, description); PDEU's page on the 2023 workshop (I-47); the founder's talks on YouTube and LinkedIn articles linking to the Journal; local press only on real news. No counselling directory that lists under therapist or psychologist categories, no bought links or mentions, no "AI visibility" vendor, no Wikipedia article, and no Wikidata item until independent sources exist.
