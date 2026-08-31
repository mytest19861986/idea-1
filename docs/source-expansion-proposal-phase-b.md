# Phase B: Source Expansion Proposal (Candidate Evaluation Matrix)

**Status**: `PROPOSED_STATE=CANDIDATE` (Zero implementation, zero auto-execution, zero pre-approval)  
**Governance Invariant**: All candidate sources remain strictly in `CANDIDATE` state pending Commander & Manager explicit policy approval.

| # | SOURCE_NAME | SOURCE_TYPE | OFFICIAL_URL_OR_API | ACCESS_METHOD | AUTH_REQUIRED | RATE_LIMIT | TERMS_OR_CONSTRAINTS | EXPECTED_SIGNAL_TYPE | EXPECTED_EVIDENCE_VALUE | DUPLICATION_RISK | COMPLEXITY | PRIVACY_CONCERNS | PROPOSED_STATE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Hacker News Official Firebase API | REAL_EXTERNAL | `https://hacker-news.firebaseio.com/v0` | REST / JSON | NO | Bounded Concurrency (10) | Public Domain / Fair Use | Show HN, Launches | Direct Source Claims | Low | Low | Zero PII | CANDIDATE (Active) |
| 2 | Product Hunt Official API v2 | REAL_EXTERNAL | `https://api.producthunt.com/v2/api/graphql` | GraphQL | YES (OAuth Bearer) | 500 req / day | Developer TOS | New Product Launches | Product Claims & Traction | Medium | Medium | Creator usernames | CANDIDATE |
| 3 | GitHub Trending & REST API | REAL_EXTERNAL | `https://api.github.com/search/repositories` | REST / JSON | YES (Personal Token) | 5000 req / hr | API Terms of Service | Open Source Traction | Star Velocity & Commits | Low | Medium | Developer profiles | CANDIDATE |
| 4 | Indie Hackers Public Feed | REAL_EXTERNAL | `https://www.indiehackers.com/feed` | RSS / XML | NO | Respect robots.txt | Public RSS Terms | Milestone Claims / Revenue | Self-reported Traction | Medium | Low | Public founder handles | CANDIDATE |
| 5 | Y Combinator Startup Directory | REAL_EXTERNAL | `https://www.ycombinator.com/companies` | Public Directory | NO | Cache bounded / robots | Public Directory Index | Startup Cohort Launches | Industry & Funding Tier | Low | Medium | Public company data | CANDIDATE |
| 6 | Devpost Hackathon Winners | REAL_EXTERNAL | `https://devpost.com/software` | Public Feed | NO | Bounded crawl | Devpost TOS | Emerging Tech Prototypes | Prototype Evidence | Low | Medium | Team member names | CANDIDATE |
| 7 | BetaList Directory Feed | REAL_EXTERNAL | `https://betalist.com/feed` | RSS / XML | NO | 1 req / min | BetaList RSS terms | Early-stage Beta Launches | Pre-launch Product Concept | Medium | Low | Public startup tags | CANDIDATE |
| 8 | Reddit (r/SideProject, r/SaaS) | REAL_EXTERNAL | `https://oauth.reddit.com/r/SideProject/new` | REST / JSON | YES (OAuth2) | 60 req / min | Reddit Developer Terms | Community Problem & Showcase | Unfiltered User Demand | High | High | Reddit usernames | CANDIDATE |
| 9 | SourceForge / FOSS Launches | REAL_EXTERNAL | `https://sourceforge.net/directory` | RSS / API | NO | Standard robots | Public FOSS Terms | Open Source Tools | Download Activity | Low | Low | Project owner ids | CANDIDATE |
| 10 | Launching Next Directory | REAL_EXTERNAL | `https://www.launchingnext.com/feed` | RSS / XML | NO | 1 req / min | Public RSS | Trending Tech Startups | Curated Launch Signals | Medium | Low | Public company data | CANDIDATE |
| 11 | F6S Startup Discovery Feed | REAL_EXTERNAL | `https://www.f6s.com/programs` | REST / Public Feed | NO | Bounded index | F6S Terms | Accelerator & Pitch Signals | Program Application Data | Low | Medium | Public program listings | CANDIDATE |
| 12 | Techstars Portfolio Directory | REAL_EXTERNAL | `https://www.techstars.com/portfolio` | Public Index | NO | Bounded fetch | Public Directory terms | Accelerator Graduate Signals | Venture Backing Verification | Low | Medium | Company domain info | CANDIDATE |
