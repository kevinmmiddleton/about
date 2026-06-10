---
title: "I Gave My Mac Mini Its Own Apple ID"
slug: i-gave-my-mac-mini-its-own-apple-id
status: "draft"
updated_at: "2026-06-05"
topic: "Building with AI"
series_order: 16
tags: ["assistant"]
featured: false
sort_order: 16
excerpt: "A Mac Mini in my office texts me. Job leads in the morning and evening, rejection summaries, error alerts when something breaks, and a briefing to start the day. The messages land\u2026"
---

**[IMAGE: Hero. A phone showing a pinned iMessage thread from a contact named "Assistant" with a friendly briefing, next to a HomePod and a coffee cup on a desk. Minimal, soft colors, white background, no text.]**

A Mac Mini in my office texts me. Job leads in the morning and evening, rejection summaries, error alerts when something breaks, and a briefing to start the day. The messages land in a pinned conversation on my phone from a contact named Assistant, and they feel like they came from a colleague, because in a way they did.

Getting there was less about AI and more about identity. The single best decision I made was giving the machine its own.

### You can't cleanly text yourself

**[IMAGE: A split. Left: a messy single thread where a person texts themselves and messages show up doubled and tangled with personal notes. Right: a clean, separate "Assistant" thread. Minimal, soft colors, no text.]**

The first version had the Mac Mini signed into my own Apple ID, texting me from myself. It technically worked, and it was a mess.

iMessage duplicates anything you send yourself, so every briefing arrived twice. My personal notes-to-self thread, the one I use as a scratchpad, got buried under automation output. And the thing that actually mattered: I could never tell at a glance whether a message was from the system or from me.

Automation needs its own identity so you know what you're looking at without reading it. So I created a second Apple ID, signed the Mac Mini's Messages into it, and gave it a contact card named Assistant with a pinned conversation at the top of my phone. Now an incoming blue bubble from Assistant is unmistakable.

(Creating a second Apple ID from a machine that already has one is weirdly hard. Apple fights you at every step. It took a call to Apple Support to finish. Worth it, but go in expecting a fight.)

### Native messages, no extra apps

**[IMAGE: A single iMessage bubble arriving on a phone, with a small "no third-party app" badge implied by simplicity. Minimal, soft colors, no text.]**

It sends through an open-source command-line tool called imsg, which talks to Messages directly. That choice was deliberate. No SMS service to pay for, no dependency on a separate chat app I'd have to remember to check. The notifications I actually read are iMessage notifications, so the automation lives where my attention already is. Plain AppleScript stays as a backup in case imsg ever breaks.

### The morning briefing

**[IMAGE: A HomePod glowing softly while a speech bubble reads out a day's summary; a person nearby pours coffee. Minimal, soft colors, no text.]**

The payoff I feel every single day is the briefing. An Apple Shortcut has my HomePod read me the version my assistant compiled while I'm making coffee, and a more detailed one is sitting in the Assistant thread as a text when I want the specifics.

I don't open an app or check a dashboard. I just listen, and the day is already organized: what's on the calendar, what came in overnight, what needs a decision. The same logic runs unattended first thing in the morning and on demand whenever I ask.

### Walled off on purpose

Only Messages is signed into the assistant account. The system-level iCloud on the Mac Mini, the Drive, the photos, all of it, stays on my personal Apple ID. The automation has its own identity and its own channel, but its footprint is sealed off from my personal data. When you give a machine the ability to message you and act in the background, drawing that line early is worth the extra setup.

### A teammate who works overnight

That's really what this is. A coworker who never sleeps, handles the overnight shift, and catches me up in the morning through a channel I already read. None of it is flashy. It's a contact card, a command-line tool, and a Shortcut. But it turned a silent background process into something that feels like working with someone, and it means my attention goes to the actual work instead of the wrangling.

**[IMAGE: Optional closing. The "Assistant" contact card pinned at the top of a Messages list, calm and ordinary, like any other coworker. Minimal, soft colors, no text.]**
