---
title: I build web apps from my phone. Here's the whole setup.
slug: build-with-claude
status: published
published_at: 2026-04-14
updated_at: ''
topic: Building with AI
series: ''
series_order: null
tags:
  - AI
  - Open Source
  - Building
featured: false
sort_order: null
excerpt: No code, no IDE, just a Telegram message. A Mac at home runs Claude Code, and a free guide gets you the same setup.
cover_image: /blog/images/build-with-claude-cover.png
cover_alt: 'Build With Claude banner: arcade-style pixel lettering with the flow Phone to Claude to Live App'
linkedin_url: ''
---

I build web apps from my phone. Real ones, with logins, databases, and payments, live on the internet. I describe what I want in a Telegram message, and a few minutes later there's a link in the chat.

> **The whole setup is a free guide and a** [**Cowork plugin you can install yourself**](https://github.com/kevinmmiddleton/build-with-claude)**.**

Here's the trick: there is no trick, just plumbing. A Mac at home runs Claude Code. Telegram is the remote control. A message goes from my phone to the Mac, Claude writes the code, pushes it to GitHub, and Vercel puts it on the internet. Supabase handles the database and logins, Stripe handles payments, Resend sends the emails. Everything runs on free tiers; the only real cost is the Claude subscription.

I've been building this way for months. QuietFeed, my RSS reader, took shape largely from the couch and the train. Something looks off, I send another message. The app updates while I'm making dinner.

## Get yours running

I wrote the whole thing up so you don't have to reverse-engineer mine. One command in Terminal installs everything, then the guide walks you through the rest a chapter at a time: the Telegram bot, the accounts, the first deploy. If you have Claude's Cowork mode, the plugin does the walking for you. Say "set me up to build with Claude from my phone" and follow along.

What you actually need: any Mac that can stay on (the Mac is the brain; if it sleeps, your bot sleeps), a phone with Telegram, a Claude Pro or Max subscription, and curiosity. That last one is the real requirement.

Everything's free on GitHub: [github.com/kevinmmiddleton/build-with-claude](https://github.com/kevinmmiddleton/build-with-claude).

Happy building!
