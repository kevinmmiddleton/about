---
title: Reclaiming your narrative starts with one page you own
slug: one-page-you-own
status: published
published_at: 2026-06-11
updated_at: ''
topic: Building with AI
series: ''
series_order: null
tags:
  - AI
  - Personal Brand
  - Career
  - Open Source
featured: false
sort_order: null
excerpt: An old colleague got laid off, shipped a personal site ten days after I sent him a starter kit, and took back his story online. So I turned the starter into a free plugin.
cover_image: ''
cover_alt: ''
linkedin_url: ''
---

An old work colleague of mine got laid off at the start of May. He'd come to my office hours, and somewhere in that conversation I nudged him to build himself a personal site.

He took some time to process the layoff, stewed on the idea, and came back with a better version of it than the one I pitched him: an interactive resume. Surface level at first glance, deeper wherever someone wants to click. A timeline, the skills, the major projects, maybe the personal stuff too. He'd been thinking about how he highlights himself, how he works, and what he's actually accomplished.

> **The starter kit from this story is now a free** [**Claude plugin you can install and run yourself**](https://github.com/kevinmmiddleton/personal-site/releases/latest)**.**

I told him yes, a hundred times yes. Here's how I use mine. It's the link at the top of my resume. It's the screen share in an interview when you can sense the interviewer is cool. And it's where your impact lives on after a company turns off your badge.

Then I did the thing I do, and built him a starter, two days before my first vacation in three years.

## Getting someone off the blank page

The zip I sent had three files: a skeleton site, a design rulebook, and a START-HERE guide with one prompt to paste into Claude. The note with it said: consider this a skeleton, not a finished thing. Every word, color, and layout is yours to change. It's just here to get you off the blank page.

His reply the next morning: "THIS. IS. AMAZING."

Ten days later, between interviews and family stuff, he shipped a rough draft. His headline, his framing, his projects, written like him rather than like a template. I sent back two pieces of mobile feedback, he fed them straight to Claude, and the next note from me was "ship it."

What's amazing is that he now owns a little piece of the web that he controls, and with it his own narrative beyond LinkedIn.

## Why a page you own is step one

I wrote recently about [what happens when AI researches you](https://middleton.io/blog/ai-is-researching-you/). Short version: people and their AI agents are already looking you up, and if you don't make the answer easy to find, they get a wrong or outdated one.

A personal site is step one of the fix. It's the one place on the internet where you control every word of your story: what leads, what's emphasized, what a recruiter or an AI research pass finds when your name goes in. LinkedIn decides what gets seen on LinkedIn. Your page answers to you.

The old excuse was real: building a site meant learning web development or paying someone. I hear the modern version every week in office hours, "I'm not technical enough to build it," and it's almost never true anymore. The blank page is the only real obstacle left. So I started handing people a way past it.

## I turned the starter into a plugin

He's the third person I've helped get a site live, and three is about the number where you stop doing it one at a time. So I cleaned up the starter and packaged it as a free plugin for Claude, so (almost) anyone can build their own.

It runs as a guided interview, about an hour end to end. Three questions about the site's purpose and audience. Your resume, pasted or dropped in. A quick voice check, including what you don't want to sound like. Ten color palettes pulled from 2026 forecasts, four headline fonts, your photo, your scheduling link. Claude generates the site, walks you through QA'ing every line against your real resume, then gets it live on GitHub Pages for free, with an optional $10 domain. It still takes a little comfort with following technical steps, but Claude walks you through pretty much all of the tough stuff.

My favorite detail: it sets up free analytics with a small trick. The link you put on your resume carries a `?ref=resume` tag, so you can literally see when a recruiter clicked through from your resume.

And one opinionated choice. Most AI-built sites have a tell: the same font, the same pill buttons, the same icon-card grids. The plugin ships a real editorial backbone and a do-not-use list that Claude reads before it writes anything, then runs a final check for the tells anyway. If your page looks like everyone else's page, you haven't reclaimed much.

It's free. [Grab the plugin here](https://github.com/kevinmmiddleton/personal-site/releases/latest), drop it into Claude's Cowork mode, and say "build me a personal site."

## An hour from now

His site is live. His story is solid, his proof is one click deep, and the next recruiter who looks him up finds the version he wants them to read, organized and laid out exactly how he wants them to experience it.

That's available to you this afternoon. And if you want company while you build it, my office hours are right there: [middleton.io/officehours](https://middleton.io/officehours). Bring the "probably dumb" questions. Those are my favorite.
