---
title: Nobody owns the journey
slug: nobody-owns-the-journey
status: ready
published_at: 2026-08-23
updated_at: ''
topic: Product
topic_new: ''
series: ''
series_order: null
tags:
  - Product Management
  - Customer Journey
  - Ownership
  - Strategy
featured: false
sort_order: null
excerpt: If everyone owns the customer journey, no one does.
cover_image: /blog/images/nobody-owns-the-journey-cover.jpg
cover_alt: Teams stand on raised platforms, each working on a stage of a journey, reading a map, reviewing tablets, handing off a product, shaking hands, connected by short bridges. A lone customer stands by themselves on a bare platform at the edge of a wide gap that no bridge crosses.
lede_align: left
linkedin_url: https://www.linkedin.com/posts/kevinmiddleton_one-of-the-most-common-gaps-i-see-in-product-activity-7422279650648940545-beXP
---

I have asked some version of the same question at every company I've worked at. Who owns the customer lifecycle, end to end?

Nobody has ever raised their hand.

Not once. Plenty of people own a piece of it, and they own their piece well. But the whole arc, from the first search to the repeat purchase years later, belongs to no one in particular at most companies I've seen.

### The customer doesn't know or care about your org chart

Marketing owns awareness. Product owns the tool. Sales owns the lead. Support owns the ticket. Operations owns fulfillment. Every one of those teams can be excellent and the experience between them can still be terrible.

The customer doesn't experience your org chart. They experience the gaps.

You feel it as a customer. Handoffs are clunky. Context gets lost. The journey feels stitched together, because it was. It goes ka-chunk, ka-chunk, ka-chunk, a thud at every handoff. New login here, re-enter your info there, explain yourself again to someone who should already know. And every ka-chunk in the customer journey can be extremely costly for business.

With longer or more complex product lifecycles, the gaps get expensive. There could be years of quiet between interactions, so by the time the customer engages, you might have to start from scratch if you don't have the right customer context.

### The homeowner nobody owned

The customer journey for a homeowner buying an HVAC system could be well over 10, 15, or even 20 years. The customer lifecycle included discovery, decision support, installation, registration, app setup, maintenance, and eventual replacement. There were owners for parts of these, or some were just viewed as projects, but we didn't have a unified view of the customer throughout the journey.

Want to sign up for the filter program? It had its own login and no connection to the profile we already have on the homeowner. And the Trane Home app was created as another account entirely. Every one of those pieces worked independently, but none of them connected, because nobody owned the full customer journey, it was left to separate teams or outside agencies focused on their own milestones. If there had been ownership of the full journey on the engineering and product side, all of these silos could have been prevented.

I actually made a bit of a rallying cry out of it. At annual planning, half-joking, I said one of our top goals for the year should be to "destroy silos." It landed harder than I expected, because the silos are obvious and everyone in the room already felt it. We did agree to communicate more thoughtfully across teams, but we fell short of assigning an owner for the full customer journey.

But all was not lost. It's solvable, one small step at a time. I built a homeowner profile that saved the lead form answers to HubSpot, so the sales team could see what the homeowner cared about. I also knew which blog articles and interactive experiences they'd viewed, though we hadn't gotten that into the profile yet. Half-finished, but the right direction. I carried the same principle into Trane's experiences. When I built the System Recommender for Trane Residential, I sent the homeowner's choices to the dealer along with the lead. The dealer could see whether this homeowner cared about cost or efficiency, and the size of their home, so nobody had to ask the same questions twice. That helps the sale, and it tells us what kinds of homeowners are showing up and what they care about.

None of it required extra cross-team collaboration. It required empathy for everyone up and downstream in the buying process. We have the information, we should be taking it and building one profile and using it to make the handoff less broken. One person may not own the journey, but we can refuse to let the data fall into the gaps.

### One product, two backends, no owner

At Rocket Lawyer we had an Ask a Lawyer experience that was totally splintered. The US version routed to Salesforce. The UK, France, Spain, and Netherlands versions routed somewhere else entirely. Same product name, same promise to the customer, but completely different backends.

Nobody cared to build a scalable system at inception, it was more about launching something expediently at the time.

My read was that a routing API would have solved it from day one, and as each quarter went by and this wasn't on the platform team's roadmap to fix, I was puzzled. You could easily create a service to send the request to the right place based on where the customer is, and Ask a Lawyer stops being two regional implementations and starts being one product. Portable. Reusable. Something you could white-label for a partner or extend into use cases nobody had scoped yet. This could have been a global service that we offered, but we couldn't make strategic plays, because we didn't make the changes. (I'm told that later on, some changes did come in this direction.)

Nothing about that was a hard technical problem. Ask a Lawyer stayed split because no single person was looking at the service as one experience. Everyone was just maintaining their half, and Ask a Lawyer stayed out of larger strategic conversations, at least in part, because the underpinnings of the service weren't prioritized.

### If nobody owns the full customer journey, you can't be strategic or move fast

Here's what I think the gaps actually cost, and it's not just the customer paying the price.

When teams own individual pieces of the experience, every roadmap conversation happens inside a silo. You optimize your piece of the experience, you hit your numbers, and you ship features that make your slice better. That's pure execution and it can look extremely productive for years.

What you can't do from inside your silo is make a bigger bet. You can't decide that the thing most worth doing this year is the six months between purchase and first maintenance, because nobody owns that stretch and no roadmap has a line for it. The strategic move requires someone with a view of the whole thing, and so often there is no such person.

So the org stays busy, productive even. Retention sags, NPS goes flat, and the post-mortems blame price or the market. Nobody's dashboard shows how many customers fell into the gaps between teams, because no dashboard is drawn that way.

Product folks are great at seeing dysfunction. We sit closest to the gaps, we get asked to coordinate across them, and we're rarely given the authority to decide anything about them. If you've ever owned a product that was working while the journey around it was failing, you know the exact feeling.

### So how can we fix it?

There are two ways to close the gap.

Someone has to have real cross-functional authority over the end to end. A general manager, a chief customer officer, somebody who can force the conversation when the warranty team and the app team have never met. A title with no authority will never work.

Or the company can go fully product-led, where the experience is the product, and product defines the journey that every other function supports.

Most companies stay in the muddy middle, where product sees everything, owns nothing, and gets blamed when the handoffs fail.

### What you can do without being handed the authority

You probably can't restructure your company this quarter, but you can try a few things.

**Draw the whole lifecycle on one page.** First search to repeat purchase, however many years that spans. Not the funnel your team owns. The whole thing, the way the customer lives it.

**Mark every handoff between teams.** Then circle the ones where nobody would notice if the customer disappeared. Those circles can help form your argument.

**Find one stretch worth targeting.** Don't propose owning everything, because that's a reorg and it isn't yours to call. Propose that this specific gap is where the next material improvement lives, and bring the evidence.

**Identify a way to measure the gap.** If you're asking leadership to invest in a stretch nobody owns, you need a number that shows the gap now and one that proves it shrank later.

**Ask the question out loud, in a room with the people who own the pieces.** Who owns the end to end? Watch what happens. In my experience the room goes quiet, and that silence does more to move people than any deck I could have built.

### Ask it anyway

If you take one thing from this, make it the question. Ask who owns the customer end to end, in a room, out loud, with the people who own the pieces.

If the answer is "everyone," the real answer is no one. And your customers already know it.
