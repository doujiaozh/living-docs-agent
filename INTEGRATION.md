# Closing the Loop — Regen Engineering × living-docs-agent

> *Knowledge is the asset. Code is the byproduct. Documentation is the proof they still agree.*

**Status:** proposal · **Autor:** living-docs-agent maintainers · **Cross-ref:** [regen-engineering-skills](https://github.com/tysoncung/regen-engineering-skills) v0.3.0 · [living-docs-agent](https://github.com/doujiaozh/living-docs-agent) v0.1.0

---

## 0. Thesis

Regen Engineering compiles **knowledge into verified code**.
living-docs-agent compiles **code into living documentation**.

Separately, each is a one-way street. Together they close the only loop that has ever mattered in software engineering — the loop between what a system *is supposed to do*, what it *actually does*, and what it *says it does*.

The claim of this document, stated as one sentence:

> **Regen Engineering solves the forward problem — how knowledge becomes code. living-docs-agent solves the reverse problem — how code keeps its knowledge honest. Composed, they form a closed, self-auditing feedback loop in which no artifact can silently rot.**

---

## 1. The model

Let three artifacts live in one repository:

| Symbol | Artifact | Owner | Mutated by |
|---|---|---|---|
| `K` | the knowledge tree — `knowledge/` packages of `BR-` rules, `ADR-` decisions, `ASM-` assumptions, `NFR-` targets, `CT-` contracts | humans | `knowledge-delta`, `reconcile`, `mine` (all human-gated) |
| `C` | the implementation — source under each module | agents, from `K` | `regenerate` (contract-verified, smallest scope) |
| `D` | the generated documentation — Markdown between `livedocs` markers | nobody | `living-docs-agent`, from `C` |

Two functions are defined:

- **Forward (Regen Engineering):** `C = R(K)` — a regeneration, where `R` is an agent supervised by contracts `CT-*` at an interface boundary. Expensive, semantic, human-reviewed, sporadic.
- **Reverse (living-docs-agent):** `D = L(C)` — a documentation build. Deterministic, structural, zero-dependency, and — under `--watch` — continuous. `L` runs on every save.

**Observation 1.** Regen Engineering's own drift-check defines the invariant the whole methodology defends:

> *If a change touches a module's generated paths and contains no corresponding change to that module's knowledge, it is code-ahead drift.* — a defect. The other direction, knowledge-ahead-of-code, is a healthy backlog.

Drift is a relation `δ(K, C)` and it has a sign. Regen Engineering detects `C ≻ K` **structurally** — it never compares prose to code. What it does *not* do is maintain a live projection of `C` that humans actually read. `D` is that projection.

**Observation 2.** living-docs-agent maintains a different invariant, enforced by its watch loop and self-trigger guard:

```
D ≡ L(C)
```

Docs *are* the code's API surface, refreshed within `--interval` ms (default 500) of any edit, never regenerated because their own output moved. So the README can never go stale — but the README also cannot, by itself, tell you whether the code it describes is *correct*. `L` is honest, and `L` has no opinions.

**The gap.** Neither half, alone, closes anything.

- Regen without `L`: the loop `K → C → ΔK` is semantic, slow, and scheduled. Between regenerations, the most-read artifact in the repo — the API surface — drifts silently. `drift-check` fires at merge time; rot lands in `D`-shaped holes nobody watches daily.
- `L` without Regen: `D ≡ C` forever, but `K` does not exist. The docs faithfully describe whatever the code happens to do today, including its bugs, its unmined accidents, and the deliberate decision an ADR was never written for. A perfect mirror of an unjustified system.

---

## 2. The composite loop

Wiring the two half-loops produces one cycle. Read clockwise from the top:

```
                    ┌──────────────── human review ────────────────┐
                    │            (the cheapest place to disagree)   │
                    ▼                                              │
   task ──▶ [knowledge-delta] ──▶ ΔK ──▶ [impact] ──▶ scope         │
                                         │                          │
                                         ▼                          │
                              [regenerate]  C = R(K), contracts first│
                                         │                          │
   ┌─────────────────────────────────────┘                          │
   │                                                                  │
   │  C ──(living-docs-agent, L)──▶ D ──(read by everyone, daily)     │
   │                                  │                               │
   │              ┌───────────────────┼──────────────────────┐       │
   │              ▼                   ▼                      ▼       │
   │       [drift-check]        [gatherer]             [librarian]   │
   │       C ≻ K blocks         commits that           contradictions
   │       the merge            implied nothing         across the tree
   │              │                   │                      │       │
   │              └──────────▶ [reconcile] ◀────────────────┘       │
   │                           draft ΔK, evidence quoted             │
   └──────────────────────────────────────────────────────────────────┘
```

The loop has a name for each edge, an owner for each edge, and — critically — **a materialised artifact on the reverse path**. The reverse edge is not "somebody remembers to update the docs". It is `L(C) = D`, executed by a machine, on save, for free.

### 2.1 The invariant of the composed system

> **Law 0 (Loop Closure).** At any commit, for every module `m`:
> ```
> D(m) ≡ L(C(m))                    (living-docs-agent: docs never lie about code)
> C(m) ≡ R(K(m))  ∨  drift(C(m)≻K(m)) is recorded in knowledge.lock
>                                   (Regen: code is either derived from
>                                    knowledge, or the debt is named)
> ```

A repository that satisfies Law 0 has no silent rot. Every disagreement between the three artifacts is either impossible (by construction, on the `C→D` edge) or measured (by the regen tooling, on the `K↔C` edges).

### 2.2 Why the composed loop is more than the sum

**Lemma (the reverse edge must be mechanical where it can be).** Regen Engineering's own design line is *"the model does judgment, scripts do the graph math."* Impact analysis is deterministic traversal because eyeballing a blast radius is strictly worse than computing it. The same argument applies verbatim to documentation: regenerating the API reference from an AST is deterministic traversal of the code — asking a model to eyeball it is strictly worse. `L` is the script. It removes the model from an edge where the model adds only risk, and leaves `regenerate`/`reconcile`/`mine` — genuine judgment work — to the agents.

**Corollary (cheap everywhere, semantic where it counts).** `D = L(C)` runs on every keystroke. `C = R(K)` runs once per reviewed delta. The frequency asymmetry is correct: the cheap edge is continuous, the expensive edge is gated, and the human is consulted exactly once per cycle — at review.

---

## 3. Layer map — where each piece plugs in

Every regen skill gains a concrete integration point against `living-docs-agent` primitives:

| Regen skill | living-docs-agent primitive | Composition |
|---|---|---|
| `knowledge-delta` | `buildDocs()` output as the *current* API surface | Draft a delta, diff it against `D` to see which documented behaviour the change will visibly break |
| `impact` | `--lang`/`src[]` per-module doc builds | A generated TOC (`demo/API.c.md` style) is a machine-readable module index for cross-checking computed blast radius |
| `regenerate` | markers `<!-- livedocs:start -->` / `<!-- livedocs:end -->` | Regenerated code automatically regenerates `D`; no second command, no forget-to-doc |
| `verify` | `generateDocs()`, `countEntries()` | Docs build is part of green: schema validity → contracts → `D` builds clean ∪ debt report |
| `drift-check` | generated region inside README is a *generated path* | The mechanical rule gets a sharper signal: code-ahead drift now visibly churns `D` too |
| `mine` | `D` as structural first draft, `parseFile()` per artifact | Mining starts from a curated surface, not a blank page — the same inversion `mine` already exploits |
| `regeneration-test` | README denylist | The generated region **must** be in the denylist — it is built *from* the implementation |
| `reconcile` | `Last updated` timestamp + `Source · file:line` links | Evidence quoted per finding: the diff *and* the generated doc line that exposes it |
| `librarian` | TOC + badges (`functions-26`, `classes-1`) | Mechanical counts (`regen-librarian`) cross-checked against `D`'s own counts |
| `gatherer` | README diff between merges | A generated-region change with no `knowledge/` change is exactly the candidate set gatherer wants |
| `trigger` | churn of `D` as decay signal | API surface churn is a leading indicator of `C ≻ K`, arriving before the weekly scheduled sweep |

The pattern: **`D` is never a source of truth — it is a source of evidence.** Regen Engineering's hard rule is that a reconciliation is never merged without human review; `D` makes that review cheap by handing the reviewer a rendered diff of exactly what the API surface just did.

---

## 4. Contract layering — the boundary and the surface

`knowledge-delta` decrees:

> Write contracts in given/when/then form at an **interface boundary**: HTTP calls, command-line behaviour, data formats, observable effects. Never reference internal class or function names, because a contract that reaches inside an implementation cannot survive that implementation being regenerated in another language.

living-docs-agent's extraction is precisely the complement:

| | Contracts (`CT-*`) | Living docs (`D`) |
|---|---|---|
| Layer | interface boundary — *behavioural* | API surface — *structural* |
| Refers to | HTTP / CLI / data formats / observable effects | signatures, parameters, return types, docstrings |
| Survives cross-language regeneration | yes — that is the point | no — re-emitted per language |
| Asserts anything | yes (given/when/then) | never — it only describes |
| Verification | contract suite | `npm test` on the generator (44 tests today) |

They are deliberately disjoint and jointly sufficient. The contract answers *"did the rebuilt system behave correctly?"*; the living docs answer *"what is the rebuilt system, as a human would describe it?"* Neither can answer the other's question, and Regen Engineering already knows the cost of confusing them: `verify` warns that traceability counts contracts *which exist*, not contracts which would fail — because a contract that reaches into implementation detail stops being a check and becomes a mirror.

---

## 5. Integration protocol

Concrete steps, in the order they stop mattering if skipped.

### 5.1 Repository shape

```
my-module/
├── knowledge/            # K — humans own this
│   ├── overview.md
│   ├── rules/BR-001.md
│   ├── decisions/ADR-007.md
│   ├── assumptions/ASM-003.md
│   └── contracts/CT-001.md
├── impl/                 # C — regenerated from K
├── knowledge.lock        # knowledge_version, contracts_passed, drift
└── README.md             # hosts D between markers
```

### 5.2 The markers are load-bearing

`living-docs-agent` injects between:

```markdown
<!-- livedocs:start -->
<!-- livedocs:end -->
```

Treat the enclosed region exactly as `regenerate` treats generated code: **never hand-edit it, never hand-edit around it to make a build pass.** A generated region edited by hand is a lie the next regeneration will erase — the documentation equivalent of editing a contract to go green.

### 5.3 CI wiring

```yaml
# docs never lag code: build D from C, fail if it differs from what is committed
- run: node bin/cli.js ./impl -r README.md
- run: git diff --exit-code -- README.md

# knowledge never silently disagrees with code: the regen health panel
- run: npx -p regen-engineering-schema regen-validate .
- run: npx -p regen-engineering-schema regen-debt .
```

`regen-debt` reports four metrics — coverage, freshness, **integrity (target zero)**, traceability. The first check above is the missing fifth, in the same spirit: *generated-arts never disagree with their sources.* Same shape of rule, applied to the `C→D` edge.

### 5.4 Denylist hygiene for regeneration tests

`regeneration-test` already forbids the agent from seeing the implementation it replaces — and, wisely, the README. Under composition that forbid list must include *every* generated artifact: the `README.md` marked region, `demo/API.*.md`, any `-o` output. All of them are `L(C)`; leaking any of them leaks `C`.

### 5.5 The three rules that never bend

Inherited from Regen Engineering, restated because composition makes each one easier to violate, not harder:

1. **Never edit a contract to make a build pass.**
2. **Never hand-edit the generated doc region.** (new — the `C→D` analogue of rule 1)
3. **Never merge a reconciliation, or a doc regeneration that contradicts `K`, without human review.** The model proposes; a person disposes.

---

## 6. Worked example — a drifted hotfix, end to end

1. Incident. Someone edits `impl/scheduler.py` directly, lowering the retry limit from 5 to 3 to stop the bleeding at 02:00. No `knowledge/` change.
2. On save, `living-docs-agent`'s watcher rebuilds `D`. The README's generated region now reads `def retry(limit: int = 3)`, anchored to `scheduler.py:44`, timestamp updated.
3. Next morning, `drift-check` partitions the diff: implementation changed, generated region changed, `knowledge/` silent → **code-ahead drift, blocking.**
4. `reconcile` reads the diff *and* the generated surface, drafts an `ASM-` item — honest about the unknown:

   > *Reconciled from the hotfix in a1b2c3d. The retry limit was lowered to 3. Whether 3 is correct or merely what stopped the bleeding has not been established.*

5. The reviewer sees the proposed delta, the generated doc line, and the contradiction with `BR-014` (which states the limit is 5) surfaced side by side — not buried in a 400-line pull request.
6. Human resolves: `BR-014` is corrected, a contract asserts the new value, `regenerate` is scoped by `impact`, `knowledge.lock` clears `drift`, `D` reflects `C` again, and the loop is closed.

The hotfix took minutes. The reconciliation took a review. Nothing rotted. **That is the loop.**

---

## 7. What this integration deliberately does not claim

Intellectual honesty, in the spirit of both projects (both publish friction logs and documented limits):

- **`L` is not the semantic reverse of `R`.** `living-docs-agent` extracts signatures, types, and docstrings — the *structural* surface of `C`. It does not mine business rules; rules live in `K` and need judgment. It closes the mechanical half of the reverse edge and makes the semantic half cheaper by handing `reconcile`/`mine`/`gatherer` a curated artifact. The semantic half still ends on a human desk, as it must.
- **Language coverage is asymmetric.** `R` is stack-independent; `L` today parses C-family (`.c/.h/.cpp/.hpp/.cc`) and Python. Modules outside that set fall back to the scheduled `gatherer`/`librarian` sweeps and, until then, carry the honest label: *not continuously documented.*
- **A clean `drift-check` still proves less than it feels like.** `drift-check` says so itself: a branch that changes both `K` and `C` always passes, because it cannot tell whether the knowledge that moved had anything to do with the code that moved. `D` sharpens the signal — the generated diff shows which behaviour visibly moved — but judging whether the knowledge *describes* the change remains human work, and no tool here does it.
- **Neither half replaces security review.** Generated code is untrusted code from an unfamiliar author; contract tests do not catch injection flaws, resource leaks, or a bad dependency. Auto-generated documentation does not change that by one iota.

---

## 8. The one-sentence version

Regen Engineering made knowledge the asset and code the byproduct; living-docs-agent makes documentation the receipt — and a receipt that reprints itself on every save is the only kind a loop this tight can afford.

```bash
# the forward half
npx -p regen-engineering-schema regen-validate .   # K is well-formed
npx -p regen-engineering-schema regen-impact BR-002  # scope, computed not guessed
# the reverse half
node bin/cli.js ./impl -r README.md --watch          # D stays ≡ C, forever
```

---

## 9. References

- [Regen Engineering manifesto](https://regen.engineering) — *Knowledge is the asset. Code is the byproduct.*
- [regen-engineering-skills](https://github.com/tysoncung/regen-engineering-skills) — the eleven skills; [regen-engineering-schema](https://www.npmjs.com/package/regen-engineering-schema) — `regen-validate`, `regen-impact`, `regen-debt`, `regen-librarian`, `regen-gather`, `regen-trigger`
- [regen-engineering-demo](https://github.com/tysoncung/regen-engineering-demo) · [regen-engineering-stateful](https://github.com/tysoncung/regen-engineering-stateful) · [simple-cmdb](https://github.com/tysoncung/simple-cmdb) (brownfield pilot)
- living-docs-agent: `bin/cli.js`, `src/index.js` (`buildDocs` / `generateDocs` / `watchDocs`), `src/parser/{index,c,python}.js`, `src/generator/markdown.js`, `src/watcher.js` — zero dependencies, Node ≥ 18, 44 tests

*Integration document · drafted for the composed system · propose, do not merge.*
