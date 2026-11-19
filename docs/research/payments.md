# Research: payments, invoicing, one-time codes, calendar and mailboxes

Research snapshot, 30 October 2026. Prices exclude 18% GST unless stated. [n] points to the source list. "calc" = arithmetic on the cited rates.

## 1. Payment gateways

| | Razorpay | Cashfree | PayU | PhonePe PG |
|---|---|---|---|---|
| Cards, netbanking, wallets | 2% [1] | 1.95% [9] | 2% [16] | 1.99%, shown as "Free*" (T&C) [19] |
| UPI | 2% platform fee (the MDR itself is zero) [1] | 1.95% [10] | "varies" [16] | not published [19] |
| International cards | 3% [2] | 2.99%; Amex 2.95% [9] | 3% [16] | not published [19] |
| Setup / annual fee | ₹0 / ₹0 [1]; possible ₹199 KYC fee [3] | ₹0 [9]; possible ₹199 KYC fee without GSTIN, refunded after ₹25k of volume [12] | ₹0 / ₹0 [16] | ₹0 / ₹0 [19] |
| New-merchant offer | 0% on the first ₹5L or 90 days [3] | 0% up to ₹20L GMV, "till 31-Mar-27"; GST still charged on the waived fee [9] | none | not explained [19] |
| Settlement | T+2 working days [4] | T+2 [11] | T+2 (secondary source only) [24] | not published |
| Payment links | same 2% [1] | no extra cost; bank transfer to a virtual account from ₹20 [9] | not stated [16] | not stated [19] |
| Checkout | modal on your page, or hosted Links/Pages [8][1] | redirect, popup or inline [15] | PayU-hosted page [18] | redirect [21] |
| Refunds | no fee, but the original fee is kept [5] | not stated | not stated | not stated |
| Webhooks | at-least-once; retried for 24 h, then disabled [6] | 3 retries by default, configurable to 10 [14] | retries not documented [18] | retries not documented [21] |
| Node SDK | `razorpay` 2.9.8 (Jul 2026), typed [23] | `cashfree-pg` 6.0.6 (Sep 2026), typed [23] | `payu-websdk` 1.3.1 (Sep 2025), no bundled types [23] | `@phonepe-pg/pg-sdk-node` 2.0.6 (Apr 2026), typed [21][23] |

**Onboarding a sole proprietorship:** PAN, ID/address proof, a business proof such as a Shops & Establishment certificate or trade licence, and bank proof. Razorpay, Cashfree and PayU do not require GST [7][13][17]; PhonePe's guide says the same [20]. Cashfree needs a live website [13]. PayU requires the bank account name to match the PAN [17]. **Stripe India is invite-only:** Indian businesses "are not able to sign up for a new Stripe account through our website" [22].

**Is UPI still zero-MDR?** The statutory MDR has been zero since 2020 [25], but gateways charge their platform fee on UPI anyway (Razorpay 2%, Cashfree 1.95%). NPCI's committee set a new 0.40% MDR, capped at ₹300, on merchant UPI payments above ₹2,000, due 15 Oct 2026 [26]; on 15 Oct it was postponed to "immediately post Diwali", date "to be notified separately" [27]. Merchants receiving up to ₹1 lakh a month via UPI QR stay at zero [27]. For IIIC, the ₹2,500 and ₹4,000 sessions would carry ₹10 and ₹16 (calc). No gateway says whether this will be added on top of its fee.

**Cost at 100 bookings a month** (calc; ₹2,500 average, ₹2.5L GMV; GST included): Razorpay ₹5,900 · Cashfree ₹5,752.50 · PhonePe ₹5,870.50 (only if its headline rate covers UPI) · PayU ₹5,900 (only if its headline rate covers UPI). A ₹2L B2B invoice costs ₹4,720 by Razorpay link or ₹4,602 by Cashfree link; paid by NEFT/RTGS there is no gateway fee.

**Researcher's recommendation: Razorpay.** About ₹148 a month more than Cashfree at this volume, in return for one dashboard for payment links, pages and GST invoices that a non-technical operator can run; Zoho Books invoices payable via Razorpay with no Zoho fee [33]; webhooks retried for 24 hours; the most mature typed official Node SDK. Pick **Cashfree** instead if first-year cash matters most: its offer can waive up to ₹39,000 in fees, against at most ₹10,000 at Razorpay (calc); if chosen, raise its webhook retries to the maximum.

Build notes for either gateway: create orders server-side; verify signatures on the raw request body [6][14]; deduplicate events by event ID [6]; poll order status as a fallback for missed webhooks; have B2B clients pay by bank transfer.

## 2. Invoicing and GST

| Tool | Cost | API | Limits |
|---|---|---|---|
| Razorpay Invoices | gateway fee only [1] | API makes **non-GST invoices only**; GST invoices need the Dashboard [28] | — |
| Zoho Invoice | ₹0 "for all Indian businesses, forever"; GST-compliant [29] | REST; 1,000 calls/day on free; India data centre [30] | 2 users, 500 invoices/yr [29] |
| Zoho Books Free | ₹0 while revenue stays ≤ ₹25L per financial year [31] | 1,000 calls/day [32] | 1 user + accountant, 1,000 invoices/yr [31] |
| Zoho Books Standard | ₹749/month billed yearly, or ₹899 monthly; taxes extra [31] | 2,000 calls/day [32] | 3 users, 5,000 invoices/yr, e-invoicing [31] |
| Refrens | Lite ₹7,470 offer (list ₹10,680); Plus ₹14,190 offer (list ₹20,280) [34] | an "Invoicing API" exists; plans unverified [34] | e-invoices and GSTR reports mostly on Plus and above [34] |

**GST registration threshold:** service providers must register once aggregate turnover exceeds ₹20L (₹10L in Manipur, Mizoram, Nagaland and Tripura) [35]; Gujarat is a normal-category state, so ₹20L applies [36]. Notification 10/2017-IT, amended by 03/2019-IT, exempts inter-state service suppliers under ₹20L from compulsory registration [35].

**Bill of supply or plain invoice?** A plain invoice. An unregistered person "shall not collect" GST (s.32(1)) [38]. Tax invoices (s.31(2)) and bills of supply (s.31(3)(c), for registered suppliers of exempt services or composition taxpayers) are both duties of registered persons [37]. So while unregistered, IIIC issues a plain invoice or receipt with no GST, not a bill of supply (researcher's reading; a CA should confirm).

**Threshold risk:** 100 bookings × ₹2,500 × 12 = ₹30L a year (calc). At 50–200 bookings a month that is ₹15–60L, before any B2B fees. IIIC will likely need to register in year one, so decide now whether ₹1,500/₹2,500/₹4,000 include GST.

**SAC codes (all 18%)** [39]: management consultancy 998311 "Management consulting and management services including financial, strategic, human resources…"; training/certification 999293 "Commercial training and coaching services"; counselling: no code found for adult or family counselling; nearest are 999352 "Guidance and counseling services n.e.c. related to children" and 999359 "Other social services without accommodation n.e.c."; health care by a clinical establishment or authorised medical practitioner is exempt [39]. A CA should classify IIIC's counselling.

**Researcher's recommendation: Zoho Books.** Start on Free, budget for Standard at ₹8,988/yr plus tax (1,200 invoices a year at 100 bookings a month exceeds Free's 1,000 cap, and revenue will pass ₹25L). The payment webhook creates each invoice and records the payment through the API (India endpoint zohoapis.in) [32]; the operator raises B2B invoices in Zoho's interface, payable via Razorpay [33]. Don't automate with Razorpay Invoices (its API can't create GST invoices) [28]. Zoho Invoice's 500-a-year cap only covers about 41 bookings a month.

## 3. Phone one-time codes

| Option | Cost per OTP | DLT |
|---|---|---|
| MSG91 SMS | ₹0.25 (5,000-pack = ₹1,250), ₹0.20 at 16,500, ₹0.18 at 30,000 [40]; email OTP ₹0.03 [41] | you register [42] |
| 2Factor SMS | ₹0.17 up to 1L/month [43] | free help, but you register on an operator portal [43] |
| Twilio Verify | $0.05 per verification + $0.0832 per SMS ≈ $0.133 [44][45] | domestic route needs DLT; the international route skips DLT but overwrites your sender ID [46] |
| Firebase / Identity Platform | $0.07 per SMS; first 10 SMS a day not billed [47] | not documented |
| WhatsApp authentication template | ~₹0.115 (third-party figure, 28 Sep 2026) [49]; per-message pricing since 1 Jul 2025, India billing moving to INR by 31 Dec 2026 [48]; BSP fees extra | not an SMS route |

**TRAI DLT.** Any business sending SMS to Indian numbers over domestic routes must register as a principal entity on one operator portal (Jio, Airtel, Vi or BSNL), then register sender IDs and templates [42][50]. Cost about ₹5,000 + GST (roughly ₹5,900); Jio's registration covers one year [51] (Exotel: "approximately Rs. 5,900 + GST" [50]). Time: entity approval 3–10 business days, then headers and templates 3–5 days each [50]; budget 2–3 weeks. The registration is in your entity's name; providers only help. Exotel lists a GST certificate among the documents, so it is unclear whether a non-GST proprietor can register [50]. Since 1 Oct 2024, SMS containing non-whitelisted URLs are blocked [52].

**Email codes compared with SMS:** about ₹0 (Resend free tier 3,000 emails a month, 100 a day [54]); no DLT; works for NRI clients; ships in a day. Risks: spam folders without SPF/DKIM/DMARC; corporate link scanners that use up single-use links; in-app browsers that lose the session — use 6-digit codes, not links. SMS is more familiar to Indian users and auto-fills on Android Chrome via WebOTP [53]. At about 150 codes a month (calc): email ≈ ₹0; 2Factor ≈ ₹26 plus ≈ ₹5,900 for DLT; Twilio ≈ $20.

**Researcher's recommendation:** launch with emailed 6-digit codes and collect mobile numbers unverified (for reminders). If phone verification is ever required, add a WhatsApp authentication template (no DLT) or 2Factor SMS after DLT. Skip Twilio (cost) and Firebase (a second auth stack; DLT handling undocumented).

## 4. Calendar and email

| Item | Cost | Notes |
|---|---|---|
| Google Calendar API | free for standard use; charges for exceeding quota "planned … later in 2026" [55] | 1,000,000 requests/day per project; 10,000/min per project; 600/min per user [55]. Service accounts can't add attendees without Workspace domain-wide delegation [56] |
| ICS attachment | ₹0 | generated by the app; works with any calendar client |
| Google Workspace | Starter ₹270, Standard ₹1,080 per user/month, plus intro prices for the first 20 users for 12 months [57]; 18% GST extra [58] | which prices are annual and which flexible is unclear |
| Zoho Mail Lite | ₹59/user/month (5 GB, billed yearly only); ₹75 for 10 GB [59] | Mail Premium ₹199; Workplace Standard ₹99 yearly or ₹129 monthly [59] |
| Zoho Mail Forever Free | ₹0 for up to 5 users, 5 GB, one domain, no IMAP/POP/ActiveSync [60] | select data centres only |

**Researcher's recommendation:** attach an ICS invite to each confirmation email, and separately write the booking into IIIC's own Google Calendar through the API without attendees (avoids the service-account block and duplicate invites; far below quota). Mailboxes on Zoho Mail Lite (three users about ₹177/month against ₹810 for Google Starter, excl. GST, calc; same vendor as Zoho Books); Google Workspace only if sessions will run on Google Meet. Zoho's Free plan is single-domain, so it can't cover both domains. Send codes and confirmations through Resend, not the mailbox.

## Could not verify

1. PhonePe's per-method rates, settlement time and refund fees. 2. PayU's UPI rate and settlement time on its own site. 3. Webhook retry policies for PayU and PhonePe, and link pricing for both. 4. Refund fees at Cashfree, PayU and PhonePe. 5. The new start date for the UPI MDR. 6. Whether the MDR will stack on gateway platform fees. 7. Whether online gateway merchants qualify for the ₹1 lakh/month small-merchant exemption. 8. Whether Razorpay charges GST on waived fees during its offer, and what PhonePe's "Free*" means. 9. Razorpay's international rate ("3%" vs "up to 3%*"). 10. How Twilio Verify and Firebase handle DLT; independent data on Indian OTP delivery rates. 11. Meta's own India authentication rate (₹0.115 is third-party). 12. DLT fees on the operator portals, and whether a sole proprietor without GST can register. 13. Which Google Workspace India prices are annual, flexible and introductory. 14. The official CBIC SAC wording (busy.in used), and the right SAC or exemption for IIIC's counselling. 15. Refrens free-plan limits and API access by plan. 16. Credit validity for MSG91 and 2Factor.

## Sources (all accessed 30 Oct 2026)

[1] https://razorpay.com/pricing/?utm_category=fintech [2] https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/ [3] https://razorpay.com/terms/90-day-free-pg-offer/ [4] https://razorpay.com/docs/payments/settlements/faqs/ [5] https://razorpay.com/docs/payments/refunds/normal [6] https://razorpay.com/docs/webhooks/faqs.md [7] https://d6xcmfyh68wv8.cloudfront.net/docs/payments/kyc (Razorpay Docs page "Business Types and KYC Documents") [8] https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps [9] https://www.cashfree.com/payment-gateway-charges [10] https://www.cashfree.com/docs/help/account/pricing [11] https://www.cashfree.com/docs/help/payments/settlements/settlements [12] https://www.cashfree.com/fee-tnc/ [13] https://www.cashfree.com/docs/help/onboarding-related/onboarding-faqs [14] https://www.cashfree.com/docs/api-reference/webhooks/reliability-and-operations [15] https://www.cashfree.com/docs/payments/online/web [16] https://payu.in/pricing/ [17] https://docs.payu.in/docs/documents-checklist-for-account-activation [18] https://docs.payu.in/docs/webhooks [19] https://www.phonepe.com/business-solutions/payment-gateway/pricing/ [20] https://business.phonepe.com/articles/how-to-get-payment-gateway-registration-in-india-complete-process [21] https://developer.phonepe.com/payment-gateway/backend-sdk/nodejs-be-sdk/integration-steps and https://developer.phonepe.com/payment-gateway/backend-sdk/nodejs-be-sdk/api-reference-node-js/installation [22] https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india [23] https://registry.npmjs.org/razorpay, https://registry.npmjs.org/cashfree-pg, https://registry.npmjs.org/payu-websdk, https://registry.npmjs.org/@phonepe-pg%2Fpg-sdk-node [24] https://productgrowth.in/resources/guides/payment-gateways-india/ (secondary) [25] https://www.businesstoday.in/latest/economy/story/mdr-on-upi-what-it-means-for-customers-555587-2026-09-15 [26] https://www.outlookmoney.com/banking/upi-mdr-of-040-per-cent-from-october-15-what-changes-for-merchants-and-consumers [27] https://newsonair.gov.in/npci-postpones-implementation-of-mdr-on-select-person-to-merchant-upi-transactions/ [28] https://razorpay.com/docs/invoices/faqs/ [29] https://www.zoho.com/in/invoice/pricing [30] https://www.zoho.com/invoice/api/v3/introduction/ [31] https://www.zoho.com/in/books/pricing/ [32] https://www.zoho.com/books/api/v3/ [33] https://www.zoho.com/in/books/kb/razorpay [34] https://www.refrens.com/refrens-premium [35] https://www.gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Registration_under_GST_Law_new.pdf [36] https://cleartax.in/s/gst-registration-limits-increased [37] https://www.knowyourgst.com/gstlaw/the-central-goods-and-services-tax-act-2017/31-tax-invoice-31/ [38] https://www.knowyourgst.com/gstlaw/cgst-act/32-prohibition-of-unauthorised-collection-of-tax-32/ [39] https://busy.in/sac-code-998311/, https://busy.in/sac-code-999293/, https://busy.in/sac-code-9993.md [40] https://msg91.com/in/pricing/sms [41] https://msg91.com/in/pricing/otpwidget [42] https://msg91.com/help/dlt-registration-in-india [43] https://2factor.in/v4/pricing.html and https://2factor.in/v4/index.html [44] https://static0.twilio.com/en-us/verify/pricing [45] https://twilio.com/en-us/sms/pricing/in [46] https://www.twilio.com/en-us/guidelines/in/sms [47] https://cloud.google.com/identity-platform/pricing [48] https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing [49] https://montymobile.com/blogs/whatsapp-business-api-pricing-in-india-inr-rates-gst-and-the-2026-currency-migration-deadline (secondary) [50] https://developer.exotel.com/docs/sms-support/dlt-entity-registration [51] https://crm.smsgatewayhub.com/knowledge-base/article/dlt-registration-charges-cost-breakdown-in-india (secondary) [52] https://trai.gov.in/sites/default/files/PR_No.67of2024.pdf [53] https://developer.chrome.com/docs/identity/web-apis/web-otp?hl=en [54] https://resend.com/pricing.md [55] https://developers.google.com/workspace/calendar/api/guides/quota.md.txt and https://developers.google.com/calendar/pricing [56] https://www.technetexperts.com/service-account-dwd-calendar-attendees/ (secondary) [57] https://workspace.google.com/intl/en_in/landing/partners/referral/gws2 [58] https://cloudfysystems.com/blog/google-workspace-pricing-plans-india (Google partner) [59] https://www.zohowebstatic.com/sites/zweb/json/pricing/mail-pricing-val.json and https://productgrowth.in/tools/developer/zoho-mail/ [60] https://www.zoho.com/mail/zohomail-pricing.html
