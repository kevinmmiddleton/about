# Gong Panel Exercise: Deep Technical Research
## API Capabilities, Platform Policies, and Integration Feasibility

---

## WHATSAPP BUSINESS API: TECHNICAL DEEP DIVE

### Message Access & Retrieval

**No historical message retrieval.** The WhatsApp Cloud API does not provide an endpoint to pull past conversations. There is no conversations.list or messages.get for history. The only way to capture messages is via real-time webhooks, meaning you must have capture infrastructure in place from day one. You cannot retroactively analyze older conversations.

Third-party BSPs (like Whapi.Cloud) offer their own chat history methods, but these are outside the official Meta API spec.

### Webhook Capabilities

Webhooks DO deliver real-time message content. When a customer sends a message, Meta POSTs a JSON payload (up to 3MB) to your registered URL containing:
- Full message content (text, images, documents, etc.)
- Sender/recipient info
- Timestamps
- Message type

This means a business CAN capture every inbound message in real-time. The limitation is that this only works for new messages going forward, and the business must build/maintain the capture infrastructure.

### Cloud API vs. On-Premises API

The On-Premises API was **deprecated and end-of-life as of October 23, 2025**. It's gone. All businesses must use the Cloud API now.

Both APIs had the same fundamental limitation: no historical message retrieval. The On-Premises API did NOT give more access to message content.

### E2EE Reality on Business API

**This is more nuanced than the simple "E2EE blocks everything" story:**

Messages ARE encrypted in transit via Signal Protocol. But on the Cloud API, messages pass through Meta's servers where they are decrypted for processing/routing, then re-encrypted for delivery to the business. Meta states it "cannot read message content" because it doesn't hold decryption keys, but the architectural reality is that messages DO transit through Meta's infrastructure in a processable state.

Once received by the business (or BSP), messages are stored in **plaintext** in the business's own database. The business is responsible for encryption at rest.

**Key implication:** The E2EE barrier is about Meta's policy choices, not pure technical impossibility. Messages ARE accessible in plaintext at the business endpoint. A conversation intelligence platform could theoretically analyze messages that a business has already received and stored, but Meta's terms of service prohibit using that data for AI training.

### Rate Limits

- Volume tiers: 1K / 10K / 100K unique users per 24h
- Throughput: 80 messages/second (upgradeable to 1,000 MPS)
- Quality ratings affect quotas (high/medium/low based on user response, opt-out, abandonment rates)

### BSP Role

BSPs (Twilio, Infobip, Gupshup, 360dialog, etc.) handle API requests, message routing, and infrastructure. They process messages but operate under Meta's strict privacy policies. BSPs do NOT have inherent rights to share message content with third parties. Any data sharing would require:
1. Explicit integration agreement
2. Data handling disclosures compliant with WhatsApp's terms
3. User consent

### Native Analytics

Extremely limited. Meta provides:
- Total conversation count
- Template delivery performance
- Response times (basic)
- Category filtering (Marketing, Utility, Service)

No keyword tracking, topic extraction, sentiment analysis, conversion tracking, or anything resembling conversation intelligence.

### CRM Integration Path (Indirect Access)

HubSpot and Salesforce both store WhatsApp message content within their CRM systems after integration. This creates an **indirect pathway**:
1. Business integrates WhatsApp with CRM
2. CRM stores message content
3. Third-party tool (like Gong) accesses messages through CRM API

**Constraints:** Only new messages (no history), CRM as intermediary adds latency, still subject to consent requirements, CRMs not designed for streaming raw conversation data.

---

## META'S AI LOCKDOWN: FULL PICTURE

### The Ban (Effective January 15, 2026)

Meta updated WhatsApp Business Solution Terms on October 18, 2025. The policy explicitly prohibits "general-purpose" or "open-ended" AI chatbots where AI is the "primary (rather than incidental or ancillary) functionality."

**Confirmed affected companies:** OpenAI (ChatGPT), Perplexity, Poke (General Catalyst-backed), Luzia (Khosla Ventures-backed), Microsoft (Copilot). All were delisted.

**Meta's rationale:** General-purpose AI chatbots created disproportionate system burden with increased message volume. The pay-per-message model couldn't effectively monetize open-ended AI interactions.

### Exact Policy Language

"Providers and developers of artificial intelligence or machine learning technologies including large language models, generative AI platforms, and general-purpose AI assistants are strictly prohibited from using the WhatsApp Business Solution when such technologies represent the primary functionality being offered."

### Data Training Prohibition (Critical for Gong)

"Business Solution Data, including any anonymous, aggregate, or derived forms, may not be used to create, develop, train, or improve any machine learning or artificial intelligence systems, models, or technologies, including large language models."

**Fine-tuning exception:** Companies CAN fine-tune AI models exclusively for their own internal use with their WhatsApp data, provided the data is NOT used to train or improve other AI systems.

### Could Gong Argue "Analytics, Not Chatbot"?

The policy targets "AI providers" and "general-purpose AI assistants." It doesn't explicitly mention "conversation intelligence" or "analytics." However:

- The data training prohibition is absolute and would block Gong from using WhatsApp data to improve its AI models
- Even positioning as "analytics," using conversation data to generate insights via LLMs could be interpreted as violating the terms
- Meta appears to reserve analytics capabilities for its own Business AI features

### Regulatory Pushback

**Italy (December 24, 2025):** ACGM ordered Meta to suspend the ban. Finding: Meta's conduct "may constitute an abuse" by limiting AI chatbot market access. Meta allowed Italian users (+39 country code) to retain third-party AI access. Investigation ongoing.

**Brazil (January 13, 2026):** CADE ordered Meta to halt the policy. Formal antitrust investigation into whether terms are "exclusionary to competitors" and "unduly favor Meta AI." Ban paused for Brazil. Investigation ongoing.

**EU (February 9, 2026):** European Commission opened formal antitrust investigation. Issued Statement of Objections finding the policy "appears at first sight to be in breach of EU competition rules." Meta offered to allow rival AI for one year with usage-based fees. EU rejected this on April 15, 2026, calling it a "paid distribution channel." Threatened interim measures. Investigation ongoing.

### The Data Asymmetry (Key Argument for the Deck)

Meta prohibits third parties from using WhatsApp data to train AI while simultaneously using that data to train Meta AI. Meta AI is integrated directly into WhatsApp and cannot be removed. Every conversation with Meta AI generates training data that strengthens Meta's models while competitors are locked out.

This is the antitrust argument the EU is making, and it's a useful lens for the deck: the platform owner is building a moat around conversation data.

### Meta's Strategic Direction

Meta is turning WhatsApp into a business intelligence platform:
- Business AI for customer service, recommendations, sales
- Conversions API pulling data from websites, apps, CRM, and WhatsApp into unified layer
- Voice calling, video, voice messaging added to Business Platform (July 2025)
- Advertising integration across WhatsApp/Facebook/Instagram

Meta is not yet a direct Gong competitor, but the trajectory points there: conversation summarization, inquiry routing, agent-facing tools. The missing pieces (agent coaching, performance metrics, deal analytics) are logical next steps.

---

## SLACK CONNECT API: TECHNICAL DEEP DIVE

### API Endpoints: They Work (Technically)

`conversations.history` and `conversations.replies` both work with Slack Connect shared channels via the unified Conversations API. The Events API fires for shared channels (`message.channels`, `message.groups`). Real-time webhooks are possible.

### Rate Limits: The Real Blocker

**May 2025 rate limit changes created a tiered system:**

| App Type | conversations.history | Max Objects/Request |
|----------|----------------------|-------------------|
| **Non-Marketplace (e.g., Gong)** | 1 request/minute | 15 messages |
| **Custom/Internal apps** | 50+ requests/minute | 1,000 messages |
| **Marketplace apps** | Tier 3 (higher) | Higher |

At 15 messages/minute, a non-Marketplace app like Gong cannot do real-time conversation intelligence. This is ~900 messages/hour, which is inadequate for any enterprise with active deal rooms.

**Workaround:** If Gong published a Marketplace app, they'd get higher rate limits. But Slack Marketplace apps face their own review and policy constraints.

### Data Available vs. Redacted

**Available in shared channels:**
- Full message text content
- Timestamps
- User IDs
- Reactions (with user lists)
- File attachments and links
- Thread replies
- Message metadata

**Redacted for external users:**
- Email addresses (blocked even with `users:read.email` scope)
- Locale information
- Display names from external organizations

This means Gong could see WHAT was said but would struggle to identify WHO from the customer side said it. For conversation intelligence (attributing statements to buyer vs. seller, identifying decision-makers), this is a significant gap.

### Slack's 2025 Data Storage Restrictions

Slack explicitly restricted third-party apps from storing Slack message data in 2025. This directly blocks conversation intelligence platforms from performing bulk data extraction/indexing. Platforms like Glean were specifically affected by this change.

### Discovery API (Enterprise Grid Only)

Enterprise Grid customers get access to the Discovery API for compliance/eDiscovery:
- Programmatic export of messages and files in JSON format
- Includes Slack Connect channel content
- Legal hold capabilities

**BUT:** Restricted to "security and compliance use cases" (eDiscovery, archiving, DLP). Not designed for analytics. Requires Org Owner access.

### Salesforce + Slack: No Special Back-Channel

Despite Salesforce owning Slack, there is no privileged API access to shared channel data. The integration is standard: CRM record lookup, notifications, workflow triggers. No conversation intelligence pipeline.

### Bottom Line on Slack Connect

| Factor | Verdict |
|--------|---------|
| Can you read shared channel messages? | Yes, via API |
| Can you do it at scale? | No (1 req/min for non-Marketplace apps) |
| Can you identify external participants? | Partially (no emails, no display names) |
| Can you store the data? | No (2025 policy restricts third-party storage) |
| Is there a compliance pathway? | Yes, but Enterprise Grid only, compliance-only use case |
| Is real-time analysis feasible? | No (rate limits + storage restrictions) |

---

## SYNTHESIS: WHAT THIS MEANS FOR THE DECK

### The Story Got Better

Both options are harder than they look on the surface, but for DIFFERENT reasons:

**WhatsApp barriers are mostly POLICY (Meta's choices):**
1. No historical message retrieval (API design)
2. Meta's AI lockdown (terms of service)
3. Data training prohibition (terms of service)
4. Regional privacy laws (regulation)
5. Platform fragmentation across APAC (market reality)

But technically, messages CAN be captured via webhooks and stored in plaintext. The barrier is Meta's increasingly restrictive policy, which is itself under antitrust scrutiny.

**Slack Connect barriers are mostly TECHNICAL (API limitations):**
1. 1 req/min rate limit for non-Marketplace apps (API design)
2. External user metadata redacted (privacy by design)
3. Third-party data storage explicitly restricted (2025 policy)
4. No real-time streaming capability at scale

But the data IS there and IS accessible through compliance channels (Discovery API for Enterprise Grid).

### The Framework Argument

This distinction matters for the deck. A smart PM doesn't just say "we can't do it." They say:
- **WhatsApp:** High strategic value, but platform risk is compounding (Meta is actively moving against third-party AI). Monitor the EU antitrust outcome. Consider CRM-indirect approach.
- **Slack Connect:** Lower strategic risk (Salesforce isn't building a Gong competitor), but current API constraints make scale impractical. Could lobby for Marketplace-tier access or partner with Slack.

### The "What Would I Actually Recommend" Layer

Neither is a quick win. The honest recommendation might be:
1. **Don't invest heavy engineering in either right now.** Both have fundamental blockers.
2. **Build a messaging abstraction layer** that can eventually support multiple channels.
3. **Start with what you can actually access:** CRM-stored WhatsApp messages (via HubSpot/Salesforce APIs) and internal Slack channels (not Connect).
4. **Place strategic bets:** Monitor EU WhatsApp antitrust outcome; explore Slack Marketplace app path for better rate limits.
5. **Give GTM teams a talking track:** "We're investigating messaging integrations. Here's what we know about the landscape and timeline."

This is exactly the kind of nuanced, reality-grounded analysis that shows you've done the work and understand the constraints.
