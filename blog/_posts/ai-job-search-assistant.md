---
title: I Built an AI Job Search Assistant That Texts Me When It Finds Roles I Should Apply To
slug: ai-job-search-assistant
status: published
published_at: 2026-02-23
updated_at: 2026-06-06
topic: Building with AI
series: Building with AI
series_order: 1
tags:
  - AI Workflows
  - Job Search
  - Automation
  - LLM
  - Product Management
  - Claude
  - Local Models
featured: false
sort_order: 1
excerpt: How a Mac Mini in my apartment scans LinkedIn twice a day, filters for roles that match my profile, and texts me the results, for about six cents a day.
cover_image: /blog/images/ai-job-search-assistant-cover.jpg
cover_alt: 'Diagram of the job search automation: Apple Shortcuts triggers a Terminal script, Claude classifies roles, results flow from LinkedIn to iMessage.'
linkedin_url: https://www.linkedin.com/pulse/i-built-ai-job-search-assistant-texts-me-when-finds-roles-middleton-nawxe/
---

Most job seekers refresh LinkedIn like it's a slot machine. Open the app, scroll, scroll, scroll, close the app, feel vaguely bad about it. Repeat three hours later.

I decided to stop doing that.

Instead, I built a system that scans LinkedIn twice a day, filters for roles that match my profile, and texts me the results. Just a text that says "here are 4 new PM roles" or "nothing new, scan ran clean." No refreshing. No doom-scrolling. And after a few weeks of optimizing, it costs $0/month to run.

Here's how it works, what I learned testing five different AI models, and a prompt you can copy to try this yourself in 5 minutes.

## The Problem

Postings fill fast. A role that goes up at 9am might have 200 applicants by 5pm. If you're only checking once a day, you're already behind.

A friend of mine manually checks LinkedIn three times a day on a schedule. He inspired me to automate this, because the thought of doing that manually wasn't something that exactly thrilled me.

## How It Works

My Mac Mini runs a script twice a day (8am and 6pm). The whole pipeline: the Mac Mini fires on schedule, `curl` fetches LinkedIn with a 12-hour time filter, Python strips the HTML and extracts the job data, an AI model classifies each role as INCLUDE or EXCLUDE, and a bridge server hands the results to Apple Shortcuts, which texts me over iMessage. (That last hop is a pattern from u/ai_brews on r/mac.)

New roles get saved to a file. If there's nothing new, it still texts me so I know it ran. Silence means something broke.

One gotcha: LinkedIn doesn't offer an API for job search, so the script uses `curl` with a valid LinkedIn login cookie. That cookie expires periodically, so you need to refresh it by grabbing a new one from your browser every few weeks. The script also checks whether LinkedIn returned a logged-out page, so if the cookie goes stale, the scan tells me instead of silently returning garbage data.

The key ingredient is a LinkedIn URL trick most people don't know about. LinkedIn's search URL accepts a parameter called `f_TPR` that filters by time posted, in seconds. `f_TPR=r43200` means "posted in the last 12 hours." Two scans a day with a 12-hour window gives full 24-hour coverage:

```plain
https://www.linkedin.com/jobs/search/?f_TPR=r43200&keywords=product%20manager&location=New%20York&f_E=4%2C5%2C6&sortBy=DD
```

You can customize the keywords, location, and experience level for any role. The `f_TPR` parameter is the magic.

![Apple Shortcuts automation list showing two scheduled Run Shell Script actions: one at 8:00 AM daily and one at 6:00 PM daily.](/blog/images/shortcuts-automation.jpg "Two scans a day, triggered by Apple Shortcuts at 8am and 6pm. I don't open LinkedIn. It comes to me.")

![LinkedIn job search results for product manager roles in New York, filtered to the last 24 hours and sorted by most recent.](/blog/images/linkedin-search.jpg "What my agent sees every morning. New product manager roles in New York, filtered to the last 12 hours and sorted by most recent.")

![An iMessage from the job scan listing eight new product manager roles with clickable links.](/blog/images/imessage-scan.jpg "A morning text from my job scan. Eight new roles, clickable links, no scrolling required.")

## Getting the Cost to Zero

The first version of this system used an expensive AI model and sent it roughly 300KB of data per scan: raw HTML, navigation junk, CSS, historical notes the scan didn't need. It worked, but it burned through API credits.

After a few rounds of cutting, I got each scan down to about 20KB of actual job data and switched to Anthropic's smallest model, Haiku. Cost went from dollars per day to about six cents. Not six cents per scan. Six cents per day.

But I wanted to see if I could get it to zero.

## The Model Experiment

I installed Ollama, which runs open-source AI models locally, and tested five models on the same LinkedIn scan.

- **Qwen 2.5 14B** timed out. Too large for my hardware.
- **Qwen 2.5 7B** worked, but the one role it found was a coding bootcamp posting. It could follow the output format but couldn't tell the difference between "Product Manager" and "not a Product Manager."
- **Gemma 2 9B** completely ignored the instructions and gave me career coaching advice. I asked it to be a filter and it decided to be a life coach.
- **Llama 3.1 8B** followed the format perfectly but excluded every single job, including legitimate roles at companies I'd never applied to. The reason for every exclusion? "Skip list." It couldn't distinguish between "this company is hard-blocked" and "exclude for a different reason." Right format, wrong answers.
- **Mistral 7B** had the opposite problem. It included everything with "Manager" in the title. Accountants. Catering supervisors. Sweater sales reps.

The pattern: small models can follow a structured output format, but they can't do nuanced classification. My filter has real exceptions (ML PM roles are excluded, but AI tooling PM roles are fine; banks are good, but trading product PM roles are not). That's too much reasoning for a 7B model. I uninstalled Ollama and got 25GB of disk space back.

Then I tried Gemini. Google's Gemini Flash has a free API tier. Not "free trial" free. Free as in no billing required. The first test: it correctly classified every single job. Accurate exclusion reasons. Not one mistake.

So now I'm running both side by side: Haiku at six cents a day, Gemini at zero. Both produce accurate results. The whole system costs less per month than a single cup of coffee, and half of it is literally free.

![Anthropic API cost dashboard showing a total token cost of $1.94 over 30 days, with a daily cost of about six cents for Claude Haiku.](/blog/images/cost-dashboard.jpg "I got my job agent down to six (6!) cents per day.")

## What Broke Along the Way

I want to be honest: I didn't know how to fix any of these. I'm a product manager, not a systems engineer. Claude (Anthropic's AI assistant) walked me through every one, and actually wrote all of the code.

**Claude diagnosed its own auth problem.** Claude Code uses OAuth through the macOS Keychain, which requires a UI. That doesn't exist at 8am when nobody's at the computer. Claude figured out its own authentication mechanism was the problem and told me to create an API key instead. There's something funny about an AI diagnosing why it can't authenticate itself.

**Local models hallucinated URLs.** The Ollama models fabricated LinkedIn job URLs. Completely made-up sequential IDs that looked real but went nowhere. The fix was architectural: Python extracts the real URLs, the model only decides INCLUDE or EXCLUDE by job number, and the model never touches a URL. This made the whole pipeline more reliable regardless of which model does the filtering.

**Silent failures everywhere.** Most of the problems I hit produced zero error output. The automation just... didn't run, or ran and produced garbage. The single best decision was making the scan text me even when there are no new roles. If I don't get a text, I know something broke.

## Try It Yourself

You don't need a Mac Mini or any code. Here's a prompt you can paste into Claude (or any AI assistant) right now:

```
I want you to be my job search assistant. Here's my profile:

Role: [your target title, e.g., "Senior Software Engineer"]
Level: [e.g., "Senior, Staff, Principal"]
Location: [e.g., "NYC or Remote US"]
Min compensation: [e.g., "$180K base"]
Companies to skip: [list any]

Here's what I need you to do:

1. Open this LinkedIn URL and find new postings that match my profile:
https://www.linkedin.com/jobs/search/?f_TPR=r43200&keywords=[YOUR KEYWORDS]&location=[YOUR LOCATION]&f_E=4%2C5%2C6&sortBy=DD

2. Skip staffing agencies, roles below my level, and companies on my skip list.

3. For each match, give me:
Company | Role | Comp (if listed) | Location | URL

If there's nothing new, say "no new roles."
```

Five minutes. If you want the full automated setup or the bridge server code, drop a comment or DM me.
