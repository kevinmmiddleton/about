---
title: An AI tool for me 🎉 An AI tool for us? 🙈
slug: building-personal-ai-tools-for-everyone-else
status: published
published_at: 2026-07-29
updated_at: ''
topic: Building with AI
series: Building the Job Search Agent
series_order: 5
tags:
  - AI
  - job search
  - building
featured: false
sort_order: null
excerpt: The best tool I ever built had exactly one user (me). Now, it's time to share it with some of my friends. I can't wait to see how this turns out.
cover_image: /blog/images/1780711744499-job-search-agent-banner.png
cover_alt: ''
linkedin_url: ''
---

When I started my job search, I didn't want to constantly refresh LinkedIn all day, riding the little hit of dopamine when a new role popped up and the drop when it turned out to be one I'd already seen. I wanted my search to feel deliberate instead of compulsive, and I wanted to feel a sense of control of the process. So I built an agent and a dashboard to handle the search for me.

My personal job search agent reads my profile, pulls fresh roles that actually match, ignores the companies on my skip list, kills duplicates before I ever see them, scores what's left so the best ones sit on top, and pings me when something good lands. I use my personal dashboard instead of the job boards, which totally reframes a job search. It really makes it feel like it's more on your own terms, at least it does for me.

The best part of building something for yourself is the day someone else wants it too. My friends watched me stop doom-refreshing and asked the obvious thing: can I have that? For a while my answer would trail into a mumble, because the whole system was built for exactly one person (me). This month, that changes. I'm about to hand five close friends and colleagues the keys. [I can't wait to see how this turns out!](https://www.youtube.com/watch?v=PEADQ6qfQtY)

### Handing over something you built for yourself is hard

I said a while back that [I couldn't just hand this thing over](https://middleton.io/blog/ai-tools-non-technical/), because it was wrapped around my criteria, my skip list, my phone, my schedule. I was right. So I left it alone for months.

When I finally sat down to do it, the code turned out to be the easy part. The hard part was everything I'd been running on instinct, the stuff a second person would need spelled out.

### Making it multi-user

To turn my personal job search agent into one I could share with friends, I had to build an invite screen, a settings page, some onboarding. About a day of work (shoutout to Claude Opus 5). The real work was deciding things: how to keep user data separate, how a new person sets up their own job search agent, and what subset of my tools should scale and which ones should hit the cutting room floor.

The launch features:

**Fresh roles, twice a day.** The scanner runs morning and evening and [removes duplicate or repeat job postings](https://middleton.io/blog/ai-job-scanner-daily/), so what shows up is actually new. That part carried straight over from my own build.

**Inbox zero for jobs.** New roles land in a dashboard, and each one gets applied, snoozed, or skipped. Snooze hides a role for a few days and then brings it back, which sounds small but it's the whole reason the queue ever hits empty. Inbox zero is a great feeling you should be able to feel every day.

**Block companies.** Staffing firms repost the same role under different names, aggregators pretend to be employers, there are industries we might want to avoid, and a few we've simply had enough of. Just block and never see again.

![The Insights tab of my own job tracker: an interview funnel from Recruiter Screen down to Offer, plus an active-pipeline table, with the personal numbers blurred out.](/blog/images/job-tracker-insights-funnel.png "My own Insights view from my personal job search agent dashboard (with numbers blurred).")

And a lot of the work to make this usable by others was deciding what to take out. The one thing I lean on that didn't make the v1 cut for other users is a personal scanner that reads my email and logs my rejections so my funnel stays up to date automatically.

### Build your own (the lightweight version)

Here's the part I'm most excited about: you don't need me for any of this.

[The bones are open source](https://github.com/kevinmmiddleton/job-search-agent). It's the lightweight version of everything above, and it runs on a computer as humble as a Mac Mini in a closet. Mine does. If you want to start, paste this into your AI and follow where it leads:

```plain
I want to build a personal job search assistant. Here is what it should do:
read a short profile of what I'm looking for, pull fresh job listings that
match, ignore a skip list of companies I never want to see, remove duplicates
I've already seen, score each remaining role for fit so the best rise to the
top, and keep a simple tracker of what I've applied to and what got rejected.
Start me with the simplest version that runs on my own computer, and walk me
through it one step at a time. Use this open-source project as a starting point: https://github.com/kevinmmiddleton/job-search-agent
```

That gets you the do-it-yourself version. The full one, the shared dashboard my friends will log into, is the part I run so they don't have to. Two ways in: build it yourself, or let someone hand it to you.

### Start with your own use cases

If you want to build something like this, here's the only advice I actually trust: start with your own use cases. Build the thing you need, for the one user you understand better than anyone, which is you. Get it good enough that you depend on it. Everything after that, letting other people in, is the fun part.

The five of them start in the next couple of weeks. Something will break, and I'll write about that too.

The best job search tool I've ever used had exactly one user (me) and it got better the more I used it and understood my own friction points. It'll get better still once my friends start telling me what they need.
