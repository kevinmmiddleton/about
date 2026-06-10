---
title: "I Don't Check Job Boards. My Mac Mini Does."
slug: i-dont-check-job-boards-my-mac-mini-does
status: "draft"
updated_at: "2026-06-05"
topic: "Building with AI"
series_order: 11
tags: ["job scanner"]
featured: false
sort_order: 11
excerpt: "I don't check job boards anymore. A Mac Mini in my office does it for me, twice a day, and texts me the handful of roles worth a look. It costs about a dollar a month to run, and\u2026"
---

**[IMAGE: Hero. A small home server (Mac Mini) wearing a tiny detective hat, scanning a stack of job listings with a magnifying glass, a few cards rising to the top. Minimal, soft colors, white background, no text.]**

I don't check job boards anymore. A Mac Mini in my office does it for me, twice a day, and texts me the handful of roles worth a look. It costs about a dollar a month to run, and hundreds of applications have started from one of its messages.

The version running today is a lot simpler than the one I started with. Almost everything I built in the first month, I later tore out. That turned out to be the whole lesson.

### I kept making the AI part dumber

**[IMAGE: A split showing a big, expensive-looking AI brain on one side and a small model plus a row of plain gears on the other, doing the same job. Minimal, soft colors, no text.]**

I started with a big, capable model doing the classification. It worked, and it was overkill. Deciding whether a job matches my criteria is pattern matching, not deep reasoning, so I dropped to the cheapest model that could do it. Same accuracy, a fraction of the cost.

Then I stopped feeding the model the entire web page. Early on it was chewing through about 220KB of raw HTML per scan. Now plain Python strips that down to the job cards before the model ever sees them. The model classifies the cards. It doesn't parse them, because parsing is a job for code.

I added a plain text file that remembers every job URL it has ever seen, so repeats get thrown out before the model wastes a token on a role I already passed on. And I killed the afternoon scan once I realized LinkedIn's time filter meant the 1pm run only ever re-found the morning's results.

The pattern was the same every time. Move work off the model and onto boring, deterministic code, and the system gets cheaper, faster, and more reliable. The model's only job is the slice that genuinely needs judgment. Everything else is a for-loop.

One more decision in that spirit: it uses a headless browser to load the pages, not raw HTTP requests, because LinkedIn blocks the simple stuff. The browser renders the real page like a person would.

### The local-model detour

**[IMAGE: A lineup of small robots at an audition, each holding a job listing, most of them confused. Minimal, soft colors, no text.]**

For a while I tried to cut the cloud entirely and run everything on a small model on my own hardware. I tested five through Ollama. All five missed the bar. One confidently classified a sweater sales rep as a product role. Another stopped filtering and started giving me career advice.

So the classification still runs through a cloud model, with a free-tier Gemini pipeline as a backup. I retest the local options every few months. The day a small model can match the nuance, the cloud dependency goes away. We're not there yet.

### The best decision wasn't a feature

**[IMAGE: A phone showing a calm text that reads like "no new roles today," with a small green checkmark. Minimal, soft colors, no text.]**

If the scan finds nothing, it still texts me to say so. "No new roles found today" is not a non-event. It's proof the system ran. No text at all is the only thing that means something broke.

That one rule has saved me more debugging than any error handling in the code. In any system that runs unattended, silence is the enemy. Make the absence of news its own message.

### The part I haven't solved

Twice a day, my full set of job criteria flows through a cloud API. I'd rather keep all of that on my own machine, and the local models aren't good enough yet at the sizes that run on consumer hardware. So for now I've chosen convenience over purity, with my eyes open about the trade. That's the honest state of it.

The scanner isn't clever. That's the point. The smartest thing I did was keep handing the hard, fuzzy judgment to the model and everything else to code that never gets tired, never gets creative, and never decides a sweater salesman is a product manager.

**[IMAGE: Optional closing. The Mac Mini relaxing with its feet up while a phone buzzes with a tidy list of roles. Minimal, soft colors, no text.]**
