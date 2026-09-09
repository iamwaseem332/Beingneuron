# Phase 8: Curation Guide

## Overview

This guide trains human curators to review and correct entity normalization and conflict resolution decisions made by the automated synthesis pipeline.

## Who Should Curate

**Required Qualifications:**
- Domain expertise in paper subject area (e.g., NLP, ML)
- Familiarity with research methodology
- Attention to detail for evidence verification

**Time Commitment:**
- Initial training: 2 hours
- Ongoing curation: 15-30 min/day (depending on queue size)

---

## Accessing the Curation Queue

### Queue URL
```
https://beingneuron.supabase.co/admin/curation
```

### Authentication
- Use institutional SSO or admin credentials
- Role must include `curator` permission

### Queue Dashboard

```
┌─────────────────────────────────────────────┐
│ 📋 Curation Queue                           │
├─────────────────────────────────────────────┤
│ Pending: 24 items                           │
│ Reviewed Today: 8 items                     │
│ Avg Review Time: 2.3 min/item               │
├─────────────────────────────────────────────┤
│ Filters: [All] [Low Confidence] [Conflicts] │
│ Sort: [Oldest First] [Priority]             │
└─────────────────────────────────────────────┘
```

---

## Curation Tasks

### Task 1: Review Auto-Created Entities

**When:** Algorithm creates new canonical entity with confidence <0.80

**Review Steps:**
1. Check normalized form for accuracy
2. Verify entity type matches usage
3. Review all linked mentions
4. Decide: Approve, Reject, or Merge

**Example:**
```
Suggested Entity:
- Normalized Form: "Linear Transformer"
- Type: method
- Mentions: 
  - Paper A: "linear-time transformer"
  - Paper B: "Linformer"
  
Decision: ✅ Approve (correct generalization)
```

**Common Issues:**
- Over-generalization ("Model" instead of "BERT")
- Incorrect type ("dataset" vs "method")
- Missed aliases

---

### Task 2: Resolve Fuzzy Matches

**When:** Fuzzy match score 0.75-0.85

**Review Steps:**
1. Compare raw mention to suggested canonical
2. Check context of usage
3. Verify same semantic concept
4. Decide: Accept match or create separate

**Example:**
```
Raw Mention: "attention mechanism"
Suggested Canonical: "Transformer"
Match Score: 0.82

Context from Paper: "We use the attention mechanism 
from Vaswani et al. (2017)"

Decision: ✅ Accept (clear reference to Transformer)
```

**Edge Case:**
```
Raw Mention: "self-attention"
Suggested Canonical: "Transformer"
Match Score: 0.79

Context: "Self-attention predates Transformers 
(see Bahdanau et al. 2015)"

Decision: ❌ Reject (distinct concepts)
```

---

### Task 3: Merge Duplicate Entities

**When:** Two canonical entities represent same concept

**Steps:**
1. Select primary entity (most mentions/earliest)
2. Select secondary entity to merge
3. Confirm merge action
4. Add merged aliases

**Example:**
```
Primary: "BERT" (47 mentions, 3 papers)
Secondary: "BERT model" (12 mentions, 2 papers)

Action: Merge → Primary retains name, 
        secondary becomes alias
```

---

### Task 4: Split Scope Mismatches

**When:** Same name, different meanings detected

**Steps:**
1. Identify distinguishing features
2. Create disambiguated names
3. Reassign mentions appropriately
4. Add clarifying descriptions

**Example:**
```
Original: "BERT"

Split Into:
- "BERT (NLP)" → Language model
- "BERT (Protein)" → Protein structure model

Mention Reassignment:
- Papers about language → BERT (NLP)
- Papers about biology → BERT (Protein)
```

---

### Task 5: Resolve Conflicts

**When:** Automatic conflict detection flags disagreement

**Steps:**
1. Read both claims carefully
2. Check if genuine contradiction or apparent
3. Review evidence spans
4. Mark resolution strategy

**Resolution Options:**

| Option | When to Use |
|--------|-------------|
| Preserve Both | Genuine contradiction |
| Temporal Order | Later work addresses earlier limitation |
| Mark as Alternative | Different valid approaches |
| Request Expert Review | Unclear domain-specific nuance |

**Example:**
```
Claim A: "Method X improves accuracy by 15%"
         (Paper: Smith et al. 2022)

Claim B: "Method X shows no improvement"
         (Paper: Jones et al. 2023)

Evidence Check:
- Different datasets used
- Both methodologies sound

Decision: Preserve Both (contextual disagreement)
Rationale: "Improvement depends on dataset characteristics"
```

---

## Quality Guidelines

### Golden Rules

1. **Evidence First:** Always check source evidence before deciding
2. **Conservative Merging:** When in doubt, keep separate
3. **Document Rationale:** Add brief explanation for non-obvious decisions
4. **Flag Ambiguity:** Use "Needs Expert Review" for domain-specific edge cases

### Common Pitfalls

| Pitfall | How to Avoid |
|---------|--------------|
| Over-merging | Check paper contexts, not just string similarity |
| Ignoring temporal context | Note publication dates for evolution |
| Missing scope differences | Look at paper abstracts/intros |
| Rushing reviews | Take 2-3 min per item minimum |

---

## Escalation Protocol

### Level 1: Curator Decision
- Standard cases within expertise
- Document rationale in system

### Level 2: Senior Curator Review
- Complex scope mismatches
- High-impact contradictions
- Queue for senior curator assignment

### Level 3: Domain Expert Adjudication
- Novel methodological disputes
- Cross-domain terminology conflicts
- Contact domain expert via Research Lead

### Escalation Triggers

- Same entity queued >3 times
- Contradiction involving highly-cited paper (>500 citations)
- User-reported incorrect merge/split

---

## Performance Metrics

### Individual Curator Dashboard

```
┌─────────────────────────────────────┐
│ Your Stats (Last 30 Days)           │
├─────────────────────────────────────┤
│ Items Reviewed: 156                 │
│ Avg Time/Item: 2.1 min              │
│ Agreement Rate: 94%                 │
│ Escalations: 3                      │
└─────────────────────────────────────┘
```

### Quality Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Accuracy | ≥90% | Random audit sample |
| Throughput | ≥20 items/week | Automated tracking |
| Agreement | ≥85% | Inter-curator reliability |
| Response Time | <48 hours | Queue SLA |

---

## Training Exercises

### Exercise 1: Entity Matching

**Instructions:** For each pair, decide if they should merge.

1. "GPT-3" vs "GPT3" → ✅ Merge (typo variant)
2. "Transformer" vs "transformer architecture" → ✅ Merge (same concept)
3. "BERT" (NLP paper) vs "BERT" (biology paper) → ❌ Split (scope mismatch)

### Exercise 2: Conflict Resolution

**Scenario:** 
- Paper A: "Data augmentation always helps"
- Paper B: "Data augmentation hurts low-resource settings"

**Correct Resolution:** Preserve Both (contextual disagreement based on resource level)

---

## Tools and Resources

### Internal Tools
- Curation dashboard
- Entity browser
- Conflict viewer
- Audit log

### External Resources
- Google Scholar (citation counts)
- Paper PDFs (full-text verification)
- Domain ontologies (for type checking)

### Contact
- Slack: #curation-support
- Email: curation@beingneuron.org
- Office Hours: Tuesdays 2-4pm UTC

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-12 | Initial curation guide |
