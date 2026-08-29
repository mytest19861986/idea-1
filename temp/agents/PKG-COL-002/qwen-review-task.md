# PKG-COL-002: Qwen Review Brief

**Role**: Full-stack / UI / Product Engineer  
**Target**: TrustMRR Controlled Collector (`src/collection/trustmrr-collector.mjs`)  

**Review Dimensions**:
1. Opportunity UI compatibility: Are normalized `RawDocument` attributes easily consumed by frontend clients?
2. Fact vs Claim integrity: Is `claim_type: "SOURCE_CLAIM"` correctly preserved in metadata?
3. Naming and usability: Are fields named predictably for opportunity feed and detail views?
4. Risk avoidance: Are there any leaked confidential URLs or un-sanitized strings?
