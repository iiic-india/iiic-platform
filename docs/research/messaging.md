# Research: messaging stack (WhatsApp, email, newsletter)

Research snapshot, 30 October 2026. Prices exclude GST unless stated. Source numbers [S…] point to the list at the end. "Computed" means arithmetic from the cited figures.

## 1. WhatsApp Business Platform (India)

**Rules that matter**
- **Pricing model.** Meta has charged per delivered message since 1 Jul 2025. Two things changed on **1 Oct 2026** [S1]:
  - Utility templates sent *inside* an open 24-hour customer-service window are now charged. They had been free since 1 Jul 2025.
  - Free-form service replies are free only for the first **1,000 per business phone number per month**, then charged. Two third parties say the charge is the market's utility rate [S2][S3].
- **What stays free.** All messages inside a click-to-WhatsApp-ad window (up to 7 days) are free, and so are messages users send to you [S1].
- **India rates per message.** Marketing ₹0.8631, utility ₹0.1150, authentication ₹0.1150, authentication-international ₹2.4971, service after the free tier ₹0.1150. 18% GST is added [S4][S5]. The marketing rate rose from ₹0.7846 on 1 Jan 2026 [S6]. Meta's own interactive rate card returned no figures, so these come from third-party pages that agree with each other.
- **Billing currency.** INR billing for India started 1 Jan 2026. Eligible accounts must be moved to INR by 31 Dec 2026; from 1 Jan 2027 Meta stops delivering messages from non-INR accounts. Currency is fixed per WhatsApp Business Account [S1], so create it in INR.
- **Messaging limits.** The limit counts unique users messaged outside a service window in any rolling 24 hours [S7]: new portfolios start at 250; 2,000 through business verification, partner verification, or 2,000 good-quality sends in 30 days; then 10k, 100k, unlimited. Shared by all numbers in the portfolio. IIIC's volume fits inside 250.
- **Unverified portfolio caps.** 2 phone numbers (20 once verified) [S8]. 250 templates per account (6,000 once verified) [S9].
- **Business verification.** Not needed to start. India documents listed: business bank statement, business licence, certificate of incorporation, GST certificate, PAN, Shop & Establishment certificate, Udyog Aadhaar, utility bill; each must show the legal name, address or phone [S10]. A vendor says only GST works reliably for proprietors [S11] (not verified).
- **Templates.** Meta decides within 24 hours. Utility templates must be non-promotional and tied to the user's own transaction. Meta: "a general/generic survey or request for feedback will not be approved as utility". Templates filed as utility that don't qualify are approved as marketing [S12][S13]. **The feedback template must name the specific session.**
- **Display name.** Can be changed 10 times per 30 days; shows in the chat list only after display-name verification, which happens when the portfolio moves up a limit tier [S14]. Meta's naming-guidelines page blocked crawlers.
- **Opt-in.** Must name the business and state that the person agrees to messages from it; can be collected on a website and need not mention WhatsApp, as long as local law is met; must say how to opt out [S15].
- **WhatsApp Business App (free)** [S16]: broadcast lists of at most 256 contacts, received only by those who saved the number; one phone plus 4 linked devices; no roles or chat assignment.
- **Coexistence (one number on both the App and the API).** Available in India [S17]. App messages stay free; API messages are billed. Broadcast lists become read-only and groups don't sync. Throughput capped at 20 msg/s. Onboarding only through a Solution Partner's or Tech Provider's Embedded Signup [S18], so the no-BSP route can't use it. Classic business verification isn't available for coexistence numbers [S19].

**Routes compared**

| Route | Platform fee | India per message: marketing / utility | Inbox for a non-technical operator | Developer integration |
|---|---|---|---|---|
| Direct Cloud API | None | ₹0.8631 / ₹0.1150 [S4] | None. Build one, or add e.g. Chatwoot Cloud at $19/agent/mo (its free plan is live chat only) [S20] | Meta's own API and webhooks; coexistence needs a partner |
| AiSensy | Basic ₹1,500/mo [S21]; Pro ₹3,200/mo [S22] | ₹1.09 / ₹0.145 from 1 Oct 2026; ≈26% over Meta (computed) [S21] | Shared team inbox; fair-use cap of 200 agents [S21] (a Feb 2025 post said 5 agents included [S23]) | One "campaign" send endpoint per live API campaign [S24]; Pro adds "Project APIs" [S23]; coexistence supported [S25] |
| Interakt | Growth $55/mo, Advanced $69/mo + taxes (USD) [S26]; Growth ₹7,699/quarter per a third party [S27] | Markup 12–25% per a third party [S27]; Enterprise no markup [S26] | Unlimited agents [S26] | Template-send API; delivery webhooks; incoming-message webhooks only on Advanced and up [S26] |
| Wati | Growth $59/mo, Pro $119/mo, billed yearly [S28]; Growth ₹2,999/mo per a third party [S29] | ₹1.0357 / ₹0.1495, i.e. 20% / 30% markup [S29] | 3 users (Growth), 5 (Pro) [S28] | Growth: no webhooks; Pro: limited webhooks [S28] |
| Gupshup (self-serve) | None shown | Meta at cost + $0.001 per message [S30] | Not mentioned | API |
| MSG91 | ₹500/mo, first 2 months ₹0 [S31]; Hello inbox ₹1,500/mo for 1,000 tickets [S32] | "Billed per rate card" [S31]; claims Meta's rate only [S6] | Hello (separate product) | API |
| Twilio | None | Meta + $0.005 per message in or out; $0.001 per failed message [S33] | None in pricing | API |

## 2. Transactional email

| Provider | Free tier | 10k/mo | 50k/mo | Webhooks | Regions |
|---|---|---|---|---|---|
| Resend [S34] | 3,000/mo, 100/day, 3 domains | $20 (Pro) | $20 (Pro includes 50k; overage $0.90 per 1k) | Delivery, open, bounce, click, subscription [S35] | US, Ireland, Brazil, Japan; no India [S36] |
| Postmark [S37] | 100/mo | $15 (Basic) / $16.50 (Pro) | $66–87 (computed) | Delivery, bounce, open, click, spam, inbound [S38] | Not verified |
| Amazon SES [S39] | Up to $200 credit for new AWS accounts | $1.00 (computed) | $5.00 | Via configuration sets to SNS or EventBridge [S40] | Mumbai; Hyderabad (API only) [S41] |
| Brevo [S42][S43] | 300/day [S44] | $17 (Starter) | $56 (Starter) | APIs, SMTP and webhooks on all plans [S42] | Not verified |
| ZeptoMail [S45][S46] | First 10k-email credit free [S46] | $2.50 | $12.50 (computed) | Not verified | Dedicated IPs in US, EU and India data centres [S46] |
| Mailgun [S47] | 100/day | $15 (Basic) | $35 (Foundation) | Yes [S48] | US or EU |
| Loops [S49] | 4,000 sends per 30 days, first 1,000 contacts | $49 (Growth, up to 5k contacts) | Same | Not documented [S50] | Not verified |

React Email has official guides for Resend, Postmark, SES, Mailgun, Brevo and ZeptoMail [S51]; Loops needs its own editor or MJML [S50]. ZeptoMail is transactional-only and its credits expire after 6 months [S45]. SES starts every account at 200 emails per 24 hours and 1 per second [S41]. No independent 2026 deliverability benchmark found; EmailToolTester's latest is January 2024 [S52].

## 3. Newsletter

| Tool | About 2k subscribers | 10k subscribers | Double opt-in | Welcome sequence | Site-to-list API | INR billing |
|---|---|---|---|---|---|---|
| Resend Marketing [S53] | $40 (5k tier; free up to 1,000) | $80 | Not in docs; build it in the app [S54] | Automations, 10k runs/mo | Contacts API | No |
| Brevo [S43][S44][S55] | $49 Standard (15k-email tier, 2,500 contacts) | $69 Standard (20k tier) | Forms: yes [S55] | Standard: unlimited workflows | Yes | Base prices shown in INR (Standard ₹1,345) |
| MailerLite [S56][S57] | Comfort $33 ($29.70/mo billed yearly) | $89 ($80.10) | On by default for forms; separate setting for API sign-ups [S57] | Comfort: 50 active | Full API on paid plans | No (USD or EUR) |
| Buttondown [S58][S59] | $29 (third party) + $29 automations add-on | $79 + $29 | Not verified | Add-on | Not verified | No |
| beehiiv [S60][S61] | Free up to 2,500 (no automations); Lite $79 ($69 yearly) | Lite $139 ($119) | Yes, all plans, including API sign-ups [S61] | Lite: 10 | Yes | Not verified |
| Kit [S62][S63] | Free up to 10k but no sequences on Free; Creator $59 at 3k (third party) | Creator $139 (third party) | Not verified | Creator and up | Creator | Not verified |
| Listmonk (self-hosted) [S64] | $0 + a server + an email sender | Same | Yes | None listed | Yes | n/a |

## 4. Deliverability rules and Indian law

- **Gmail [S65][S66].** All senders: SPF or DKIM, valid reverse DNS, TLS, spam rate below 0.3% (aim below 0.1%). Senders of about 5,000+ a day are bulk senders permanently; subdomain mail counts toward the parent domain. Bulk senders also need SPF, DKIM and DMARC (p=none is enough) aligned with the From domain; one-click unsubscribe on marketing mail (`List-Unsubscribe-Post` plus an HTTPS `List-Unsubscribe` header) and a visible unsubscribe link (transactional mail exempt); unsubscribes handled within 48 hours (recommended). Rejections of non-compliant mail ramped up from November 2025.
- **Yahoo [S67]:** bulk senders need DMARC p=none, RFC 8058 one-click unsubscribe, unsubscribes honoured within 2 days, spam below 0.3%.
- **Microsoft (Outlook.com, Hotmail, Live), 5,000+ a day:** aligned SPF, DKIM and DMARC p=none since 5 May 2025; failing mail gets error 550 5.7.515 [S68].
- **Domain separation:** transactional mail and the newsletter from separate subdomains (e.g. `notify.` and `news.`) [S69]; DMARC at the root domain.
- **India.** TRAI's TCCCPR/DLT rules cover telecom SMS and voice. The press release for the TCCCPR (Third Amendment) Regulations, 2026 (18 Sep 2026) covers telecom providers, senders, DLT and call-management apps and does not mention WhatsApp or email [S70]. A February 2025 report says the earlier amendment excluded apps like WhatsApp [S71]. So DLT does not apply to WhatsApp or email as far as these sources show (full regulation text not read). The DPDP Rules were notified on 13 Nov 2025; notice, consent and withdrawal obligations apply from 13 May 2027 [S72].

## 5. Researcher's recommended stack

| Need | Pick | Monthly cost at IIIC's volume |
|---|---|---|
| WhatsApp | AiSensy Basic | ₹1,500 + ₹29–116 for 200–800 utility messages at ₹0.145 = ₹1,529–1,616 before GST; ₹1,804–1,907 with 18% GST (computed) |
| Transactional email | Resend | $0 under 3,000/mo and 100/day; $20 (Pro) after |
| Newsletter | MailerLite Comfort | $33 ($29.70 yearly) up to 2,500 subscribers; $89 at 10k |

Assumptions: four utility templates per booking (confirmation, 24-hour reminder, 2-hour reminder, feedback link), all charged since 1 Oct 2026; operator replies within the 1,000 free service messages; about five emails per booking plus login codes.

Before signing AiSensy, confirm that delivery webhooks are available on Basic; if not, Interakt Advanced has documented webhooks. If the feedback template is reclassified as marketing, each one costs ₹1.09 instead of ₹0.145.

The platform docs choose Resend Broadcasts for the newsletter instead of MailerLite (the platform builds double opt-in anyway to record consent); MailerLite is the documented alternative.

## 6. Not verified, or conflicting

1. Meta's own INR rate card figures, and whether Meta's INR invoices include GST or use reverse charge.
2. Chatmaxima [S4] says utility templates inside the window are still free; Meta's docs [S1], respond.io [S2], YCloud [S3] and AiSensy [S21] say they are charged. Meta followed.
3. Meta's display-name guidelines; no proprietor-specific verification guidance from Meta (document list from Wati [S10]).
4. Coexistence in India rests only on a Wati blog post [S17].
5. AiSensy: current agent count, which features are on Basic, whether GST is added on top, whether webhooks are available.
6. Interakt and Wati INR prices and markups come from a competitor's articles [S27][S29].
7. Gupshup's inbox, MSG91's current markup, whether MSG91 Hello includes WhatsApp, whether Twilio's $0.005 applies to free service messages.
8. WhatsApp Business App limits from a secondary source [S16].
9. ZeptoMail webhooks and INR pricing; Postmark's 50k price and regions; Brevo's transactional credits, INR tiers and data region; Loops' webhooks.
10. Resend: native double opt-in (not found), Workflows general availability, no India region.
11. Kit's free-plan automations; Kit and Buttondown tier prices from third parties.
12. No current independent deliverability benchmarks.
13. The full text of TRAI's 2026 amendment; GST/OIDAR treatment of foreign SaaS bills.

## Sources (all accessed 30 Oct 2026)

S1 developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md · S2 respond.io/blog/whatsapp-pricing-change-2026.md · S3 ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026 · S4 chatmaxima.com/whatsapp-api-pricing/india/ · S5 montymobile.com/blogs/whatsapp-business-api-pricing-in-india-inr-rates-gst-and-the-2026-currency-migration-deadline · S6 msg91.com/guide/whatsapp-pricing-update-2026-and-save-with-msg91 · S7 developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits · S8 …/whatsapp/business-phone-numbers/phone-numbers · S9 …/whatsapp/templates/overview · S10 support.wati.io/en/articles/11463208-facebook-business-verification-required-documents-by-country · S11 richautomate.in/blog/do-i-need-gst-for-whatsapp-business-api-india-2026 · S12 …/whatsapp/templates/template-review · S13 …/whatsapp/templates/template-categorization · S14 …/whatsapp/display-names · S15 …/whatsapp/getting-opt-in · S16 blueticks.co/blog/whatsapp-business-app-limitations · S17 wati.io/en/blog/coexistence-for-smbs/ · S18 …/whatsapp/embedded-signup/onboarding-business-app-users · S19 docs.360dialog.com/partner/waba-management/whatsapp-coexistence · S20 chatwoot.com/pricing · S21 aisensy.com/pricing · S22 aisensy.com/aisensy-vs-interakt-vs-wati · S23 m.aisensy.com/blog/aisensy-basic-vs-pro-plan-which-ones-best-for-you/ · S24 aisensy.com/docs/api-docs/api-reference-docs/ · S25 wiki.aisensy.com/en/articles/11939127-whatsapp-co-existence-everything-you-need-to-know · S26 interakt.shop/pricing/ · S27 codingclave.com/blog/interakt-pricing-india-2026 · S28 wati.io/pricing/ · S29 codingclave.com/blog/wati-pricing-india-2026 · S30 gupshup.ai/isv-partners/whatsapp-api/pricing · S31 msg91.com/in/pricing/whatsapp · S32 msg91.com/in/pricing/hello · S33 twilio.com/en-us/whatsapp/pricing · S34 resend.com/pricing · S35 resend.com/docs/dashboard/webhooks/introduction · S36 resend.com/docs/dashboard/domains/regions · S37 postmarkapp.com/pricing · S38 postmarkapp.com/developer/webhooks/webhooks-overview · S39 aws.amazon.com/ses/pricing/ · S40 docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html · S41 docs.aws.amazon.com/general/latest/gr/ses.html · S42 brevo.com/pricing/ · S43 brevo.com/pricing.md · S44 help.brevo.com/hc/en-us/articles/208580669 · S45 zoho.com/zeptomail/ · S46 zoho.com/zeptomail/pricing.html · S47 mailgun.com/pricing/ · S48 documentation.mailgun.com/docs/mailgun/user-manual/events/webhooks · S49 loops.so/pricing · S50 loops.so/docs/transactional · S51 react.email/docs/integrations/overview · S52 emailtooltester.com/en/email-deliverability-test/ · S53 resend.com/pricing.md · S54 resend.com/docs/dashboard/audiences/introduction · S55 help.brevo.com/hc/en-us/articles/360019540880 · S56 mailerlite.com/pricing.md · S57 mailerlite.com/help/how-to-use-double-opt-in-when-collecting-subscribers · S58 buttondown.com/pricing · S59 sequenzy.com/pricing/buttondown · S60 beehiiv.com/pricing.md · S61 beehiiv.com/support/article/13081072798743-How-to-enable-double-opt-in-and-Smart-Nudge · S62 kit.com/pricing · S63 emailvendorselection.com/kit-pricing/ · S64 listmonk.app · S65 support.google.com/mail/answer/81126 · S66 support.google.com/mail/answer/14229414 · S67 senders.yahooinc.com/best-practices/ · S68 mailgun.com/blog/deliverability/microsoft-sender-requirements/ · S69 resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain.md · S70 trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf · S71 inc42.com/buzz/telecos-question-trais-latest-spam-rules-excluding-whatsapp-other-otts · S72 azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/

(Every S8–S15 and S18 path starting with "…" begins with developers.facebook.com/documentation/business-messaging.)
