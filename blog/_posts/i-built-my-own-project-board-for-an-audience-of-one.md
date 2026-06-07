---
title: "I Built My Own Project Board for an Audience of One"
status: "draft"
updated_at: "2026-06-05"
topic: "Building with AI"
series_order: 14
tags: ["board"]
featured: false
sort_order: 14
excerpt: "Every PM has opinions about the perfect project board. So instead of arguing with a tool built for a team of twelve, I built mine for an audience of one."
---

**[IMAGE: Hero. A clean Now/Next/Done board with a person on one side adding a card and a small friendly assistant on the other side adding one too. Minimal, soft colors, white background, no text.]**

Every PM has opinions about the perfect project board. So instead of arguing with a tool built for a team of twelve, I built mine for an audience of one.

### A view on top of what I already had

Once my job tracker lived in a database, putting a board on top of it was easy. board.middleton.io is a live Now, Next, and Done view of everything I'm working on: the job search, my side projects, even the system that runs the job search. It reads straight from the database, so it's never out of date. There's no sync step and no stale state, because the board and the data are the same thing.

I built it instead of renting another project tool. I already had the database. A thin web view on top beats paying for software designed for a team when the team is just me.

### Built for one, designed for more

**[IMAGE: A single board today, with faint "ghost" panels around it hinting at future uses (calendar, deadlines, ideas). Minimal, soft colors, no text.]**

The board only shows job search data today. But because it queries a general-purpose database, adding a new kind of data later is just a new query, not a new system. I deliberately made it more capable than the current use needs. That's a habit worth keeping when you build for yourself: leave the door open for the version of you who shows up in three months with a new idea.

### The part I didn't expect to love

**[IMAGE: A late-night scene: a person jots a half-formed idea onto a card, and the next morning the same card is sitting on the board waiting, with a small assistant nearby. Minimal, soft colors, no text.]**

The board isn't only mine to look at. My assistant can read and write to it too. That one change turned a dashboard into a shared workspace.

So when I have a half-formed idea at 11pm, I don't lose it. I drop it on the board and pick it back up later, with the assistant, when I actually have the energy to develop it. The loose thoughts wait for me instead of evaporating. The board became the place where my half-ideas live until I'm ready, and where the two of us work them into something real.

### One database, one board, one assistant

This is the piece that ties the rest of the system together. The scanner finds the roles, the rejection sweep catches the nos, the database holds all of it, and the board is the face of the whole thing. It started as a dashboard for an audience of one. It quietly became a shared workspace for me and the thing helping me build.

**[IMAGE: Optional closing. The board glowing calmly on a screen as the room lights dim, still updating itself. Minimal, soft colors, no text.]**
