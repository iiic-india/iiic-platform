# Runbook

Steps to follow when something has to be done by hand. Deploy, roll back, restore and the other rotations arrive with M7 (`12` §5, `14`); this file starts with the two M5 needs: rotating the session notes key and responding to a breach (`08` §3, §9; `18` §3, §5).

## Rotating the session notes key

Session notes are sealed at rest under `NOTES_ENCRYPTION_KEY` (D-11; `18` §3). Rotate it yearly, when someone who could read Vercel's environment variables leaves, and at once if the key may have been seen. An owner does this in Vercel; nobody else holds the key, and it is never put in the repository, a chat or a ticket.

1. Make a new key on your own computer: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Copy it straight into Vercel, not into a file.
2. In Vercel → Project → Settings → Environment Variables, for each environment that has notes (Preview and Production share one database today, so they share one key):
   - set `NOTES_ENCRYPTION_KEY_PREVIOUS` to the current value of `NOTES_ENCRYPTION_KEY`;
   - set `NOTES_ENCRYPTION_KEY` to the new key.
   The app refuses to start with the previous key alone, or with both the same.
3. Redeploy. Every note opens under either key in the meantime. The build runs `pnpm notes:rekey`, which re-seals each note still under the previous key and logs two counts: notes re-sealed, and notes no key held could open.
4. Check the build log. When a later deployment's run re-seals 0 and finds 0 unopened, delete `NOTES_ENCRYPTION_KEY_PREVIOUS` in Vercel and redeploy.
5. If the count of notes no key could open is above 0, stop and keep both keys: those notes were sealed under a key this deployment does not hold. Find the key they were sealed under before deleting anything.

Without `NOTES_ENCRYPTION_KEY` the app still builds and runs: the notes panel says notes are not available and nothing is stored unsealed.

## Responding to a breach

The breach register is Admin → Privacy → Breach register (`incidents`). Its two clocks run from the moment the incident was detected: CERT-In within 6 hours for a listed incident, and the Data Protection Board's detailed report within 72 hours (`08` §3). The Privacy view shows each open clock as time left or overdue, in words.

1. **Record it at once.** Add an incident with the time it was detected (IST), a title and what happened. Name systems and kinds of data, never a person's details. Saving sets both deadlines; they move only if the time detected is corrected.
2. **Contain it.** Stop what is leaking: revoke keys or sessions, take a page or integration offline, rotate the secret involved (above for the notes key; `PAYLOAD_SECRET` through `PAYLOAD_SECRET_PREVIOUS`, `08` §9). Record the time contained and set the status to Contained.
3. **Assess it within the first hour.** Tick "A listed incident: report to CERT-In" if it is one of CERT-In's listed kinds, and "Personal data was affected" with the kinds of data and how many people. An incident with neither box ticked shows its clocks as not assessed.
4. **CERT-In, within 6 hours** of detection, for a listed incident: report through CERT-In's incident reporting channel, from IIIC's point of contact <span class="iiic-todo">[[TODO: CERT-In point of contact, name, email and phone, I-27]]</span>. Record the time reported and CERT-In's reference.
5. **The people affected, without delay**, through their registered channel: what happened, how far it reached, when, the likely consequences, what IIIC has done, what they can do, and whom to contact <span class="iiic-todo">[[TODO: grievance officer's name and contact, I-21]]</span>. No offers, and nothing from a counselling session, in these messages (CLAUDE.md #3). Record when, how and how many under "People told".
6. **The Data Protection Board**: the first notice without delay, then the detailed report within 72 hours of detection (the DPDP Rules' duty, from 13 May 2027) <span class="iiic-todo">[[TODO: how to reach the Board while it is being constituted, to confirm with the lawyer]]</span>. Record the first notice, the detailed report's time and the reference.
7. **Close it** once the remediation is written down and every notification is recorded: set the status to Closed with the time.

Every change to the register is in the audit log. If a step's time was missed, record when it was done all the same; the clock then shows how late it was.
