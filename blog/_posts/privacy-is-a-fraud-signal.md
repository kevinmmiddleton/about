---
title: Privacy is a fraud signal now
slug: privacy-is-a-fraud-signal
status: ready
published_at: ''
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
excerpt: A recruiter asked if I'd used AI to auto-apply (I didn't). An ATS flagged my application as possible fraud. When I checked, every signal traced back to a privacy choice.
cover_image: /blog/images/privacy-is-a-fraud-signal-cover.png
cover_alt: 'A dark editorial collage of overlapping "prove you''re real" verification screens: an "I am not a robot" checkbox, a "select all squares with buses" picture puzzle, a scanned government ID card, a six-digit code texted to your phone, a facial-recognition scan of a face, a live verification video call, a "verified identity" badge, a blue verified checkmark, a fingerprint scan, and a large red "suspicious activity detected" alert. Several screens glow warning red.'
lede_align: left
linkedin_url: ''
---

A recruiter I know messaged me recently because my job application had been flagged for "fraud signals." She knew I was real, we're friendly LinkedIn connections, so what she actually wanted to know was whether I'd used AI to auto-apply.

I hadn't. But because she took the time to look closer and ask, I found out the flag existed at all. Some recruiters might let the software make the call, and I'd never have known.

![A LinkedIn DM from a recruiter asking whether I used automation to apply, noting my application was flagged for "fraud signals." I reply that I apply manually, source roles with a tool, and use a Google Voice number on purpose.](/blog/images/recruiter-fraud-flag-dm.png "How I even found out: a recruiter I know asked, plainly, whether I'd automated my application.")

For the record, I'm a real product manager with twelve years of experience, and I apply to every role by hand. I built a tool to find jobs that match my profile, but I personally apply to posted jobs. If anyone should sail through an "is this a human" check, it's me.

So I did what I do with any system I don't understand. I read the docs and pulled the actual signals.

### Every flag traced back to a privacy choice

[Ashby, the hiring software](https://www.ashbyhq.com/product-updates/introducing-fraudulent-candidate-detection-and-management-to-help-you-focus-on-legitimate-candidates), rates you on a handful of things: your device, your email, your phone, and where you seem to be. Mine lit up in a few places, and every one came back to a choice I made on purpose.

![Ashby's fraud-signal panel for my application: green checks for an associated LinkedIn account and an established email (48 accounts, 17.8 years old), a phone carrier reading as VOIP with a zero-account footprint, a red flag under Automation Signals for "Multiple Users on Same Device," and a red flag under Spoofing Signals for "No Online Profiles Found."](/blog/images/ashby-fraud-signals.png "The fraud panel in Ashby. The green checks include my old email. The red flags are my privacy choices.")

The clearest flag, filed under "spoofing signals," was "no online profiles found." I deleted my social media a while back (gestures at the world), and I even [pay to scrub my data from data brokers](https://middleton.io/blog/owning-your-context/). There's very little of me out there to find. To the system, a person with no footprint might not be a person at all.

I use a Google Voice number on my resume so I don't hand my personal cell to every job board on the internet. It registers as VOIP, and per [Ashby's own docs](https://docs.ashbyhq.com/running-candidate-fraud-detection-checks-and-reviewing-fraud-signals), that adds to your risk score. So the thing I do to protect my number quietly counts against me.

Then, under "automation signals," there was "multiple users on same device," which puzzled me, because I just use my laptop. My best guess is Safari, which deliberately makes every Mac look the same to trackers, so my device can't be told apart from everyone else running the same browser. I can't fully confirm that, and honestly that's the unsettling part. Even after reading the docs, I couldn't always tell why the machine had decided I looked suspicious.

The one thing that saved me was my email. It's almost eighteen years old, so the system rated me low risk. The single part of my identity I never locked down might be what kept me off the reject pile.

### I only know because I got lucky

The unsettling part isn't the flag. It's that I found out at all.

A friendly LinkedIn connection who's also a recruiter noticed a fraud signal on my applicant profile and that was enough for her to look twice and say something. A stranger wouldn't have. I'd have been sorted into a pile I never see, for the crime of being careful with my data, and I'd have kept applying, wondering why I may have been skipped over.

### Privacy is a fraud signal now

From what I can tell, these systems decide you're trustworthy based on how much of yourself you've left lying around the internet. A long social history. A phone tied to your real name. A stable, traceable device. The more exposed you are, the more real you look.

Turn that around and it gets ugly. The people doing the responsible thing, using a VOIP number, deleting their socials, leaving on the privacy features their devices ship with, all look more suspicious, not less. We built identity verification on the assumption that privacy is something only fraudsters want. That was always wrong, and now it has consequences you can count in callbacks.

And it's not just hiring. I recently argued in a take-home that a company should add Apple Sign-in to widen the top of their funnel. The objection was that Apple lets people hide their real email behind a relay that forwards to it, and the team didn't want that. Privacy-preserving login was treated as the problem, not the feature. That this is still a debate in 2026 tells you how deep the assumption runs: privacy reads as risk.

[Fake and AI-generated candidates are a real problem](https://www.cnbc.com/2025/07/11/how-deepfake-ai-job-applicants-are-stealing-remote-work.html), and a tool that helps a swamped recruiter triage thousands of applications is reasonable. The problem is what counts as suspicious. Somewhere along the way it came to mean private, and the person on the other end never gets told.

### The fix isn't complicated

Screening isn't the problem. Fake candidates are real, and recruiters are drowning. The problem is a system that only collects **red flags 🚩** and never tells you. A few things would fix it:

- **Let candidates add green flags.** Verify once through a channel you trust and carry the proof, so you're not stripping your privacy at every company. LinkedIn already does ID verification. Greenhouse verifies through CLEAR. The systems exist, we should be using them.
- **Tell people.** If a VOIP number or a missing profile hurts you, say so, the way a form tells you a file is too big to upload. Hidden tips like these are exactly what feeds the "beat the ATS" industry. Transparency kills the snake oil; opacity sells it.
- **Investigate, don't auto-reject.** A signal is a reason to look closer, not a verdict. The good recruiters already treat it that way.

![A Greenhouse hiring pipeline for a Project Manager role showing candidate identity verification: a "CLEAR verified Julia's identity" badge with a green check on the current interview stage, a "Request new verification" option, and previously verified screenings.](/blog/images/greenhouse-clear-verification.png "Greenhouse lets a candidate verify once through CLEAR, and the proof follows them through the process. Letting people vouch for themselves, instead of only scoring them.")

### What I'm going to do, and what I shouldn't have to

I've made my contact information consistent everywhere, using my direct cell phone number, so nothing looks like a mismatch. I'm using Chrome with the privacy features off, just for job applications, and I'll flip myself back into a traceable, boring, less safe person every time I job hunt.

It'll probably work. That's the part that bugs me. The fix for "a machine misread my privacy as fraud" is "have less privacy," and I'm going to take it, because I need the job.

I'm usually the loudest voice telling people to stop chasing "beat the ATS" advice, that most of it is snake oil sold to exhausted job seekers. So it really pains me to write this: this time, I'm optimizing to beat the system. Beat the ATS. Yuck. The difference is that I'm not gaming a hardly used keyword filter, I'm making myself look more legit to pass a fraud check I didn't even know existed. But hey, at least this advice is free. Nothing to sell here.

And this reaches past job seekers. My partner just set up a new .com email (he'd been in the EU, so, fair reason). He's not job hunting, but the same logic would ding him: a fresh address with no history looks thin to a system that rewards a long paper trail. Or think of the people who keep a separate email just for job applications, so the flood of recruiter spam and auto-rejections doesn't bury their real inbox. That address is new by design, and to the machine, new looks like fake. So whether you're searching or not, it's worth knowing what these systems reward. An old email and a direct phone line read as green flags. The privacy-focused, careful choices read as risk.

If you're job hunting and you've been careful with your data, go check your number, your resume, and your browser. You didn't do anything wrong. The system reading your application just can't tell the difference between careful and fake.
