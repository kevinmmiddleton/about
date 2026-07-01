---
type: Methodology
title: Building With AI
description: How Kevin Middleton, a product manager rather than an engineer, ships real working software with AI. Own the goal and the verification, let AI handle implementation, and work inside a system that improves over time.
resource: https://middleton.io/blog/everyone-can-build-now/
tags: [building-with-ai, product-management, methodology]
timestamp: 2026-06-30
---

# Building With AI

The thesis: the bottleneck in building software was never knowing how to build. It was knowing what to build and being able to tell when it's right. AI collapses the implementation cost, so a product manager who can specify a goal precisely and verify an output rigorously can ship the thing, not just write the ticket for it.

## How Kevin actually works with AI

**Own the goal, not the syntax.** The job is to get the real goal out of your head and into a form the AI can act on. A task is "build a report." The goal is the decision the report drives. AI can do the task once it has the goal, and it can never decide the goal for you.

**Work in small, verifiable loops.** Don't hand the AI the whole thing and wait for a finished product. Scope tightly, check the output, adjust, repeat.

**Verify like it's the job, because it is.** AI is reliable where there is a clear answer and confidently wrong where there isn't. The lever that improves results is verification: define what good looks like up front, pull in external signal, and use a second pass to critique the first.

**Make the environment permanent.** A good setup compounds. Persistent context, reusable skills, and durable rules beat starting from scratch every session. That environment is his [Personal OS](personal-os.md).

## The proof

His own systems are the evidence: an automated job search, a self-deploying blog pipeline, and a voice system that keeps AI writing in his own voice. All of it built and operated by a PM, not an engineering team. See [Personal OS](personal-os.md) for the builds and [owning your context](owning-your-context.md) for the belief underneath.

Related reading: [Everyone can build now. The fundamentals shouldn't change.](https://middleton.io/blog/everyone-can-build-now/)
