---
title: Privacy is a fraud signal now
slug: privacy-is-a-fraud-signal
status: published
published_at: 2026-08-05
updated_at: ''
topic: Tech & Society
topic_new: ''
series: ''
series_order: null
tags:
  - AI
  - Hiring
  - Privacy
  - Job Search
  - ATS
featured: false
sort_order: null
excerpt: A recruiter asked if I'd used AI to auto-apply (I didn't). An ATS flagged my application as possible fraud. When I checked, every fraud signal traced back to a privacy choice.
cover_image: /blog/images/privacy-is-a-fraud-signal-cover.png
cover_alt: 'A dark editorial collage of overlapping "prove you''re real" verification screens: an "I am not a robot" checkbox, a "select all squares with buses" picture puzzle, a scanned government ID card, a six-digit code texted to your phone, a facial-recognition scan of a face, a live verification video call, a gold "verified identity" digital badge, a blue verified checkmark next to a user handle, a fingerprint scan, and a large red "suspicious activity detected" alert. Several screens glow warning red.'
lede_align: left
linkedin_url: ''
---

A recruiter I know messaged me recently because my job application had been flagged for "fraud signals." She knew I was real, we're friendly LinkedIn connections, so what she actually wanted to know was whether I'd used AI to auto-apply.

I hadn't.

![A LinkedIn DM from a recruiter asking whether I used automation to apply, noting my application was flagged for "fraud signals." I reply that I apply manually, source roles with a tool, and use a Google Voice number on purpose.](/blog/images/recruiter-fraud-flag-dm.png "How I found out: a recruiter I know asked whether I'd used AI to automate my application.")

I'm a real product manager with over twelve years of experience, and I apply to every role by hand. I built a tool to find jobs that match my profile. If anyone should sail through an "is this a human" check, it's me.

So I did what I do with any system I don't understand. I read the docs and looked into what activity triggers fraud alerts.

### Every flag traced back to a privacy choice

[Ashby, the hiring software](https://www.ashbyhq.com/product-updates/introducing-fraudulent-candidate-detection-and-management-to-help-you-focus-on-legitimate-candidates), rates you on a handful of things: your device, your email, your phone, and where you seem to be. Mine lit up in a few places, and every one came back to a choice I intentionally made to protect my privacy.

![Ashby's fraud-signal panel for my application: green checks for an associated LinkedIn account and an established email (48 accounts, 17.8 years old), a phone carrier reading as VOIP with a zero-account footprint, a red flag under Automation Signals for "Multiple Users on Same Device," and a red flag under Spoofing Signals for "No Online Profiles Found."](/blog/images/ashby-fraud-signals.png "The fraud panel in Ashby shared with me by the recruiter. The green checks include the email I've used for years. The red flags are my privacy choices.")

The clearest flag, filed under "spoofing signals," was "no online profiles found." I deleted my social media a while back (gestures at the world), and I even [pay to scrub my data from data brokers](https://middleton.io/blog/owning-your-context/). There's very little of me out there to find. To the system, a person with no footprint might not be a person at all.

I use a Google Voice number on my resume so I don't hand my personal cell to every job board on the internet. It registers as VOIP, and per [Ashby's own docs](https://docs.ashbyhq.com/running-candidate-fraud-detection-checks-and-reviewing-fraud-signals), that adds to your risk score. So the thing I do to protect my number ends up counting against me.

Then, under "automation signals," there was "multiple users on same device," which puzzled me, because I just use my laptop. My best guess is [Safari, which deliberately makes every Mac look the same to trackers](https://www.apple.com/safari/privacy/), so my device can't be told apart from everyone else running the same browser. I can't fully confirm that, and honestly that's the unsettling part. Even after reading the docs, I couldn't always tell why the system had decided I looked suspicious.

The one thing that saved me was my email. It's almost eighteen years old, so the system rated me low risk. The single part of my identity I never locked down might be what kept me off the reject pile.

### I only know because I got lucky

The recruiter looked twice because she knew me, but a stranger probably wouldn't have. It makes me wonder how many times I've been skipped over for a speck of red on my candidate profile, when the only crime was being careful with my data. How would I ever know?

### Exposure is what fraud detection systems prefer

From what I can tell, these systems decide you're trustworthy based on how much of yourself you've left lying around the internet: a long social history, a phone tied to your real name, or an easily traceable device. The more exposed you are, the more "real" you look.

Turn that around and it gets ugly. The people doing the responsible thing, using a VOIP number instead of exposing their real one, deleting their socials, leaving on the privacy features their devices ship with, all look suspicious. Fraud detection has been built on the assumption that privacy is something only fraudsters want. That's wrong, and the people it wrongly flags never find out.

And it's not just hiring. I recently argued in a panel interview that a company should add Apple Sign-in to widen the top of their funnel by making sign-on frictionless. One of their objections was that Apple lets people sign in with a relay address that forwards to their real inbox, and the team didn't seem to like that. A privacy-forward login was treated as a problem.

[Fake and AI-generated candidates are a serious issue](https://www.cnbc.com/2025/07/11/how-deepfake-ai-job-applicants-are-stealing-remote-work.html), and a tool that helps a swamped recruiter triage thousands of applications is reasonable. The problem is what counts as suspicious. Somewhere along the way it came to mean private, and candidates have no way to know their risk scores.

### The fix isn't complicated

The system only collects **red flags 🚩** and never tells the candidate how to do better. There are some obvious ways to fix this:

- **Let candidates add green flags.** Verify once through a channel you trust and carry the proof, so you're not stripping your privacy at every company. LinkedIn already does ID verification. Greenhouse verifies through CLEAR. The systems exist, we should be using them.
- **Tell people.** If a VOIP number or a missing social profile hurts a candidate, say so, the way a form tells you a file is too big to upload. Hidden tips like these are exactly what feeds the "beat the ATS" industry. Transparency beats snake oil; opacity sells it.
- **Investigate, don't auto-reject.** A signal is a reason to look closer, not a verdict. The good recruiters already treat it that way.

![A Greenhouse hiring pipeline for a Project Manager role showing candidate identity verification: a "CLEAR verified Julia's identity" badge with a green check on the current interview stage, a "Request new verification" option, and previously verified screenings.](/blog/images/greenhouse-clear-verification.png "Greenhouse lets a candidate verify their identity through CLEAR in MyGreenhouse, and the verification stays on their candidate profile as a green flag.")

### I shouldn't have to trade privacy for a callback. I'm going to anyway.

I've made my contact information consistent everywhere, using my direct cell phone number and applying in Chrome with the privacy features off, making myself look traceable, boring, and less safe during my job hunt.

It'll probably remove any suspicion on my candidate profiles. The fix for "the system misread my privacy choices as fraud" is "have less privacy," and I'm going to take it, because I have no other choice. Recruiters get imperfect filters for fraud signals. Candidates get [fake listings from scammers impersonating real companies](https://consumer.ftc.gov/consumer-alerts/2023/08/scammers-impersonate-well-known-companies-recruit-fake-jobs-linkedin-other-job-platforms) and nothing to screen them with. Fraud protections for recruiters, but not for applicants.

I'm usually the loudest voice telling people to stop chasing "beat the ATS" advice, that most of it is snake oil sold to exhausted job seekers. So it really pains me to write this: you may need to make some changes to "beat the ATS." **Yuck.**

### This reaches past job seekers

Think about all the fraud detection systems out there verifying risk, and how they can be at odds with the steps we take to protect our privacy. My partner just set up a new .com email (he'd been in the EU, so, fair reason). He's not job hunting, but the same logic would ding him: a fresh address with no history looks like potential fraud to a system that rewards a long paper trail. Or think of the people who keep a separate email for specific use cases, so the flood of spam doesn't bury their real inbox. That address is new by design. So whether you're searching or not, it's worth knowing what these systems reward: an old email and a direct phone line read as green flags, and careful, privacy-focused choices read as risk.

If you're job hunting and you've been careful with your data, you didn't do anything wrong. But the fraud system scoring your application might not be able to tell the difference between careful and fake.
