---
title: "It Didn't Fail at Scale. It Failed at Automation."
status: "draft"
updated_at: "2026-06-05"
topic: "Building with AI"
series_order: 13
tags: ["tracker"]
featured: false
sort_order: 13
excerpt: "I tracked hundreds of job applications in a spreadsheet, then tore the whole thing out for a database. Not because it got too big. The spreadsheet handled the row count fine. It\u2026"
---

**[IMAGE: Hero. A bulging, slightly cracked spreadsheet on the left morphing into a clean Now/Next/Done board on the right, with a subtle database cylinder underneath. Minimal, soft colors, white background, no text.]**

I tracked hundreds of job applications in a spreadsheet, then tore the whole thing out for a database. Not because it got too big. The spreadsheet handled the row count fine. It buckled the moment I tried to make it update itself.

### What the spreadsheet was for

I wanted the tracker to do two things. Track my progress, because you can't improve what you don't track. And catch duplicate postings, so I only spent time on genuinely fresh roles. For a long time, a Google Sheet did both jobs well enough.

### Why automation broke it

**[IMAGE: A script wearing a paper mask of a human hand, clumsily clicking spreadsheet cells, a few landing in the wrong place. Minimal, soft colors, no text.]**

I'd been writing to the sheet through browser automation, which is fragile in the way those things always are. Columns splitting wrong. A sort failing. A value landing one row off. Automation is supposed to save me time, not keep me babysitting a tracker.

It held together while I was the only one touching it. Then I built a rejection scanner that needed to write to the tracker on its own, and bolting more browser automation onto a spreadsheet felt like building on sand. The scanner needed reliable writes. A spreadsheet poked at by a fake human couldn't give them.

So I moved the whole thing to a database. Writes are clean and atomic now, the scanner updates it through an API, and the old Sheet sits there as a read-only backup. The migration was never about size. It was about building something that could run without me.

### Blast radius over elegance

**[IMAGE: A diagram showing the scanner writing only to its own scratch file, with a protective wall between it and the master tracker. Minimal, soft colors, no text.]**

One design choice looks over-engineered until you see why. The scanner never touches the master tracker directly. It reads and writes its own files, and the real data lives behind a wall. It means a broken scraper can never corrupt my source of truth. When you let automation write to the thing you care about, blast radius matters more than elegance.

### The file nobody read

**[IMAGE: A dusty folder labeled with a big number, untouched, cobwebs forming, while a person walks past it every day. Minimal, soft colors, no text.]**

While I was cleaning up, I found a staging file in my own setup that had quietly collected 186 entries I'd never once opened. I'd been making every decision off the text messages the whole time. The output existed; nobody consumed it.

That one stung in a useful way. The PM in me caught the PM in me shipping a feature nobody used, in my own job search, for an audience of one. Just because a data flow seems logical doesn't mean anyone is actually using the output. I traced every dependency before deleting it, so nothing downstream broke.

### Tracking how far I got, not just where it ended

Once the tracker was a database, I started logging the full interview history per role. Recruiter screen, hiring manager round, panel, outcome. "Rejected after the final round" and "auto-rejected in 18 hours" are very different stories, and now I can see which one I'm actually living.

### The payoff

**[IMAGE: A person glancing at a clean board on a phone, then setting it down and walking off. Minimal, soft colors, no text.]**

Two prompts after the migration, I had a visual board on top of the database, with sorting and search. Now I don't maintain the tracker. It maintains itself, and I only look when I want to know where things stand.

The best tools fade into the background instead of becoming one more thing to manage. The spreadsheet had become a thing to manage. The database disappeared into the system, which is exactly what I wanted.
