---
title: "What Running an AI Job Scanner Daily Actually Looks Like"
status: "published"
published_at: "2026-03-06"
updated_at: "2026-06-06"
topic: "Building with AI"
series: "Building with AI"
series_order: 3
tags: ["AI Workflows", "Job Search", "Automation", "Web Scraping", "Reliability", "Product Management"]
featured: false
sort_order: 3
excerpt: "Two weeks running my AI job scanner. The field report: extraction failures, a temporary block, duplicate noise, and what actually held up."
cover_image: "/blog/images/ai-job-scanner-daily-cover.jpg"
cover_alt: "Job Search Automation: Two Weeks Later. The pipeline diagram with an error badge on Terminal, a check on Claude, and a warning on iMessage."
linkedin_url: "https://www.linkedin.com/pulse/what-running-ai-job-scanner-daily-actually-looks-like-kevin-middleton-kwige/"
---

My AI job scanner has been running for two weeks. It broke in interesting ways, and I learned things I didn't expect. Here's the field report.

## When a Third of Your Results Are Noise

The system was built to scan 60 LinkedIn job cards per run, twice a day. Each scan sends those listings to an AI model along with my preferences, my skip list, and a de-dupe file containing every role I've already applied to, skipped, or been rejected from.

In the first week, that de-dupe file was about 5KB. Two weeks later, it hit 32KB. That's roughly 670 company/role pairs the model has to cross-reference against every scan. The full prompt payload grew from 47KB to 73KB in the same period. Still well within the model's limits, but it's a trajectory worth watching.

The real problem wasn't size. It was accuracy.

The AI model was supposed to match incoming jobs against my de-dupe list, but it's fuzzy matching at best. Same company, slightly different role title? Comes through as "new." Same role reposted with a fresh URL? Also "new." On one scan, I got 24 results and at least 8 were duplicates of roles I'd already seen or applied to.

When a third of your results are noise, the system is creating work instead of saving it.

## Don't Ask the AI to Do What Code Can Do Better

This was the key insight. URL matching is a perfect deterministic task. No interpretation needed. Either you've seen this exact URL before or you haven't.

So I built a pre-filter. A file called `seen_urls.txt` stores every LinkedIn job URL the scanner has ever encountered. Before the AI model even sees the listings, a Python script strips out any URLs already in that file. After the scan, all new URLs get appended, whether they were included or excluded.

The first scan with the pre-filter active processed 60 jobs and filtered zero, because the seed file only had 50 URLs from that morning. But every scan after that catches repeats instantly. No model needed, no fuzzy matching, no cost.

And if every job in a scan is a repeat? The system short-circuits entirely. No API call. It just texts me "No new PM roles." Saves the API cost for that run, which isn't much per scan, but adds up over weeks.

The lesson: if a task has a definitive right answer, don't make the AI guess. Use code for what code is good at and save the model for what actually requires judgment.

## What Broke (and What's Still Annoying)

Any system that scrapes a website is one HTML change away from failing. Two weeks gave me a solid reminder of that.

On February 17th, LinkedIn returned 1.4MB of HTML but zero job cards extracted. The HTML structure had shifted slightly and my CSS selectors didn't match anymore. The scan failed three times that morning before I caught it and adjusted the selectors. Straightforward fix, but a reminder that scraping is always borrowed time.

Three days later, a morning scan got back 39 bytes. Not 39KB. 39 bytes. LinkedIn had either rate-limited or temporarily blocked the request entirely. The evening scan worked fine. Probably a temporary IP thing, but that morning's data was just gone.

Both times, the system handled the failure correctly. It texted me that something was wrong instead of silently returning nothing. That distinction matters more than it sounds. Silence meaning failure, not success, was one of the best design decisions in the whole build.

The most annoying ongoing task is authentication. LinkedIn doesn't offer a public job search API, so the scanner requires periodic manual re-authentication every few days. I built a macOS Shortcut to make it quick, about 30 seconds, but it's still manual. Everything else runs hands-off.

The other recurring annoyance: LinkedIn's location filter doesn't do what you think it does. I search for "New York, New York" explicitly. LinkedIn still returns roles in Jersey City, Newark, sometimes Philadelphia-area postings. The AI catches most of these and excludes them, but some slip through. This isn't a bug in my system. It's a known behavior with LinkedIn's search. Worth knowing if you build something similar.

## What's Working Well

The three-file system has held up. A Google Sheet acts as my master tracker (400+ rows and growing). A local text file handles de-dupe for the scanner. A markdown file serves as a staging area for new scan results. Three locations, manually synced, but the separation is intentional. The scanner never touches my master data. If the scanner breaks, my sheet is fine.

The interview pipeline is real. Multiple active interviews came directly through roles this system surfaced. The scanner found the initial postings, I applied manually, and the pipeline grew from there. Speed matters here. The system finds newly posted roles within about 12 hours of posting, and recruiters can start reviewing applications within days. Getting in early can make a difference.

And the economics still work. The AI classification costs about $0.06 per day. The second model I use for a different classification pass is still free. For a system that processes roughly 1,800 job cards across 30+ scans and maintains a 97% success rate post-stabilization, that's a pretty good deal.

## The Honest Take

Systems like this aren't "set it and forget it." In two weeks, I dealt with extraction failures, a temporary block, duplicate noise, cookie refreshes, and location filter weirdness. That's real maintenance.

But the maintenance is minutes per week, not hours per day. And the alternative is manually checking LinkedIn twice a day, doom scrolling through 60 listings, and hoping I don't miss something. The scanner is imperfect, but it's consistently better than doing it by hand.

I would not call any of this production-ready. But it's perfectly serviceable for me, and that's the point. I don't need it to scale. I need it to work. For personal projects, AI is incredible at unblocking things that would've been stuck behind access to engineering resources. There's never been a better time for the value you get from these tools.

I've been thinking a lot about the data that flows through this system and why I'm sending all of it to cloud APIs. More on that here: [I Paid to Scrub My Data From Hundreds of Data Brokers. Then I Sent Even More to an AI.](/blog/owning-your-context/)
