---
type: System
title: Personal OS
description: Kevin Middleton's self-hosted personal operating system. A shared database brain plus version-controlled skills that his AI agents read and write across multiple machines, running his job search, his blog, and more.
resource: https://middleton.io/blog/ai-job-search-assistant/
tags: [personal-os, automation, building-with-ai, infrastructure]
timestamp: 2026-06-30
---

# Personal OS

Personal OS is the infrastructure under everything Kevin builds with AI. The idea: give AI a persistent brain and a stable set of skills so it stops starting from scratch every conversation and instead compounds.

## The shape

**One shared brain.** Structured data lives in a self-hosted Postgres database any AI instance can query. Job applications, the project board, daily briefings, and content live as tables. The database is the source of truth, not files that drift.

**Skills as the interface.** Repeatable work is captured as skills, version-controlled in a private repo and synced to each machine, so a fix in one place reaches every place.

**Multiple machines, one state.** A laptop and an always-on Mac Mini both read and write the same brain. The Mac Mini runs scheduled automations while Kevin sleeps.

## What it runs

**An automated job search.** Twice a day the Mac Mini scans for product-manager roles, classifies each one with a small language model, and texts Kevin the matches for about six cents a day. Every application is tracked in the database, more than 1,200 and counting. Written up in [I Built an AI Job Search Assistant That Texts Me](https://middleton.io/blog/ai-job-search-assistant/).

**A self-deploying blog.** A post is one database row. Flipping its status to published triggers a build that renders static HTML and deploys the site, so content is baked in for search and AI crawlers.

**A voice system.** A documented voice guide, an anti-AI-tell checklist, and a validation script keep AI-assisted writing sounding like Kevin instead of like a model.

## Why it matters

Most people use AI as a blank workshop every time. Personal OS makes the workshop permanent, so the environment improves and corrections become durable. It is the environment layer of [how Kevin builds with AI](building-with-ai.md), and the practical form of [owning your context](owning-your-context.md). Some of the tools have been open-sourced; see [projects](projects.md).
