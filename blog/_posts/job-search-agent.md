---
title: "Need an AI recruiter that works for you? Try this one."
status: "published"
published_at: "2026-06-06"
updated_at: "2026-06-06"
topic: "Building with AI"
series: "Building with AI"
series_order: 5
tags: ["AI", "Job Search", "Open Source", "Claude Code"]
featured: false
sort_order: 1000
excerpt: "Open-sourced a Claude Code plugin that turns Claude into your job search assistant. The accessible version of the system I built for myself, free on GitHub."
cover_image: "/blog/images/1780711744499-job-search-agent-banner.png"
cover_alt: "Job Search Agent banner. Turn Claude into your job search assistant."
---

I built an AI job-search system [for myself first](https://middleton.io/blog/ai-job-search-assistant/). A Mac Mini sitting in my office, scanning the boards twice a day, texting me only the roles worth a look, costing about a penny per run. I've written about how it works in the previous posts in this series.

But the biggest thing that really bothered me was that most of the people who need automation like this either don't have the time or can't build it themselves.

A setup like mine takes a spare always-on machine, API keys, some patience with the command line, and time to debug when things break. Anyone hunting for a job already has none of those things. They've got rejection emails to triage, applications to send, recruiter pings to chase, and a low-grade hum of stress that doesn't turn off.

So I started porting the useful parts of my personal setup into something anyone with Claude Code can install. Today it's live on [GitHub](https://github.com/kevinmmiddleton/job-search-agent), but you can download it directly here: [job-search-agent.plugin](https://github.com/kevinmmiddleton/job-search-agent/releases/download/v0.1.0/job-search-agent.plugin)

It's open source and does the things you actually want a job-search assistant to do: scan job boards for roles that fit your career profile and goals, track your applications in a plain CSV you own, build interview guides from job descriptions. No always-on machine, no servers, no $200-a-month SaaS. Runs on whatever laptop you already have.

## Two paths if you want to try it

1. Download [`job-search-agent.plugin`](https://github.com/kevinmmiddleton/job-search-agent/raw/main/job-search-agent.plugin) and open it with Cowork. That's the whole install.

2. Or hand the [GitHub](https://github.com/kevinmmiddleton/job-search-agent) link to Claude and ask it to help you get started. Building tools to install other tools is exactly what Claude is good at.

If you fork it, improve it, or break it, tell me. Issues and PRs welcome.

## How to use it

- "Set up my job search" → onboarding + saved search
- "Scan for jobs" / "any new roles?" → on-demand scan against your saved search
- "I applied to X" / "what's in my pipeline?" → tracker
- "Prep me for my interview with [Company]" + paste the JD → interview guide
- "Can this run automatically?" → automation options

## Why share it

A few things I keep coming back to from my own search:

- Whether you're qualified usually isn't the problem. You probably are.
- Applying early matters more than applying polished. In a crowded market, being one of the first 50 applicants beats being a perfectly tailored 200th.
- The constant LinkedIn-and-email roulette is its own tax. Every notification hijacks dopamine and cortisol, all day, every day. Most of what you find won't be relevant. Most of what's relevant won't respond.

Automation doesn't fix the market. But it does pull the noise off your plate so the energy you have left can go to what actually moves the needle: writing better cover notes, prepping harder for interviews, talking to people who matter.

## Why open

I've shared this with a handful of friends already. Putting it in public was the obvious next step. The alternative, keeping a useful tool in my own pocket, felt wrong. We should be sharing the things that make this part of life less brutal, not hoarding them.

This is the first thing I've open-sourced from my personal job search system. Hopefully more will follow. It's the least I can do.
