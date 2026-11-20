# SpecSmith

**Data feed specs, stories and tests for Confluence and Jira, kept right when the feed changes.**

SpecSmith is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app for data teams. Upload the CSV extracts for a new data feed, and SpecSmith profiles them, builds a reviewable column-level spec, publishes it to Confluence, plans the delivery work in Jira, and generates the test plan. When the next version of the feed arrives, it detects what changed and updates everything that depends on it.

> **AI drafts, rules decide, humans approve.**
> Anything that can be decided by rules is decided by rules. Rovo agents only fill the gaps, every AI suggestion is reviewed before it's used, and every write to Confluence or Jira is previewed with a dry run first.

> **Status: early development.** The platform foundations are built and verified: Confluence and Jira writes, storage, background jobs, Rovo agents and MCP tools. The product features below are being built now. See [Roadmap](#roadmap).

---

## Why

Onboarding a data feed usually means:
- days of hand-writing column specs in Confluence
- creating the same Jira stories again
- drafting hundreds of test cases

And when the feed changes three weeks later, nobody updates any of it. One silently renamed column across 200 columns becomes a production defect.

SpecSmith treats the spec as a living artifact with a full lifecycle:

```
Intake → Spec → Enrich (AI) → Review & sign-off → Deliver (Jira) → Test → Change (v2 arrives) → Reuse
```

## Features

| Area | What it does |
|---|---|
| **Profiling** | Parses CSVs **in your browser**, so raw data never leaves your machine. Only column profiles are sent: types, null %, lengths, patterns and hashed values. |
| **Rules engine** | Infers types, keys, naming-convention fixes, nullability and PII hints, and finds relationships across files. Rules are driven by config files you can edit. |
| **Spec editor** | An editable grid where every value shows its source (`user`, `config`, `reused`, `derived`, `ai` or `tbd`). Unverified values are highlighted yellow, in the app and in Confluence. |
| **Confluence publishing** | Parent and per-file spec pages, an ER diagram, and a live status macro. Updates are idempotent and protected against overwriting edits made outside SpecSmith. |
| **Jira planning** | An Epic plus template-driven stories with BDD acceptance criteria, linked both ways to the spec. |
| **Test design** | Rules choose the checks (type, length, nullability, keys, relationships, PII masking), and the test plan includes a traceability matrix. |
| **Export pack** | Target DDL, dbt `schema.yml`, a data contract (YAML), JSON Schema and SQL check scripts. |
| **Rovo agent crew** | Eight narrow agents that draft descriptions, PII verdicts with cited evidence, test wording and change summaries. Code validates their output, and a human accepts or rejects it. |
| **Schema drift** | Upload v2 of a feed to see added, removed and renamed columns, type and PII changes. SpecSmith versions the spec, raises change stories and re-plans only the affected tests. |
| **Reuse** | Column definitions approved for one feed pre-fill matching columns in the next. |
| **Sign-off** | Per-file review states, with the sign-off story moved forward automatically when every file is approved. |
| **MCP tools** | Read-only and plan-only tools for external AI clients through Rovo MCP. MCP never writes directly. |

## How it stays safe

- **Facts, not files.** Agents receive extracted column facts only, never raw data or page content. This is the main defense against prompt injection.
- **Validated in code.** AI output is checked against schemas, fixed value lists, length limits and evidence requirements before it can even become a suggestion.
- **Precedence.** `user > config > reused > derived > ai > tbd`, enforced in one function. AI can never overwrite a value set by a person or derived by a rule.
- **One write path.** Every Confluence and Jira write goes through a single gatekeeper that does dry runs, per-row results (`created | updated | skipped | failed | dry-run`), retries, and **fails closed** on ambiguity such as duplicate titles, missing parents or version conflicts.
- **Runs as you.** API calls run as the signed-in user, so SpecSmith can never do more than the person clicking Approve.
- **Works with AI off.** Without Rovo, everything still works. Unfilled fields stay `tbd` and highlighted.

## Requirements

- An Atlassian Cloud site with **Confluence** and **Jira**.
- **Rovo** enabled on the site for the AI agents. This is optional, because the app works without it.
- A Jira project that has **Epic** and **Story** (or Task) issue types. A team-managed Scrum project works out of the box.

## Development setup

You need Node.js **24.22 or newer** (required by Forge CLI 15) and an Atlassian account.

```bash
npm install -g @forge/cli        # Forge CLI
forge login                      # use an API token with the Forge scope

git clone https://github.com/Ananthakrishnan-Jayadev/specsmith.git
cd specsmith
npm install
npm install --prefix static/app

forge register                   # registers your own copy of the app (new app id)
npm run deploy                   # checks + UI build + forge deploy (development)

# SpecSmith uses both products, so install into both:
forge install --site <your-site>.atlassian.net --product confluence --environment development
forge install --site <your-site>.atlassian.net --product jira --environment development
```

Open **Confluence → Apps → SpecSmith**.

If a deploy changes permission scopes, Forge treats it as a major version: run `forge deploy --approve MAJOR_VERSION_RULE`, then `forge install --upgrade` for each product.

### Live development

```bash
npm run dev:ui      # terminal 1: rebuild the UI on save
forge tunnel        # terminal 2: route calls to your machine, stream logs
```

Reload the page to see UI changes. Restart the tunnel after editing `manifest.yml`.

### Scripts

| Command | What it does |
|---|---|
| `npm run check` | Typecheck, lint and unit tests (backend and UI) |
| `npm test` | Unit tests (Vitest) |
| `npm run build:ui` | Build the Custom UI into `static/app/build` |
| `npm run deploy` | `check`, then `build:ui`, then `forge deploy` to development |

## Architecture

```
Browser (Custom UI, React)                  Forge backend                       Atlassian
CSV → profiler (web worker) ──invoke──► resolvers → rules engine → spec store (KVS)
          raw data stays here                │
Review / approve ─────────────invoke──► gatekeeper ─► queue ─► Confluence / Jira (asUser)
                                             └─► run log
Rovo agents ─► actions (facts only) ─► guardrails ─► pending suggestions ─► human review
External AI clients ─► Rovo MCP ─► read-only / plan-only tools
```

```
manifest.yml        Forge modules, scopes, resources
src/
  shared/           API contract shared by UI and backend (compile-time checked)
  rules/            pure rule functions (precedence, types, keys, PII hints, …)
  gatekeeper/       write planning: create / update / skip / fail closed
  render/           Confluence storage format and Jira ADF builders
  platform/         product API wrapper (asUser), multipart builder
  resolvers/        Custom UI backend
  actions/          Rovo action handlers
static/app/         React Custom UI (Vite)
prompts/            system prompts for the Rovo agents
tests/              Vitest unit tests
```

### Permissions

Each scope is the one Atlassian's OpenAPI spec lists for an endpoint SpecSmith calls:

| Scope | Used for |
|---|---|
| `read:space:confluence` | Find the target space |
| `read:page:confluence` | Duplicate-title checks, page properties |
| `write:page:confluence` | Create and update spec pages and page properties |
| `write:confluence-file` | Attach the ER diagram and export files |
| `read:jira-work` | Projects, issue types, link types, transitions |
| `write:jira-work` | Create issues, links, remote links; transition issues |
| `storage:app` | App storage (specs, run history) |

## Roadmap

- [x] Platform foundations: Custom UI with a typed backend, Rovo agent and actions, MCP tool, Confluence and Jira writes, storage, background jobs
- [ ] Intake: browser profiling and the rules engine
- [ ] Spec editor and Confluence publishing with dry run
- [ ] Gatekeeper, Jira story planner and run history
- [ ] Relationship detection, ER diagram and export pack
- [ ] Rovo agent crew, guardrails and the suggestion review panel
- [ ] Test design and traceability
- [ ] Review and sign-off workflow
- [ ] Schema drift detection and spec versioning
- [ ] Cross-feed reuse, status macro, Jira issue panel and MCP tools

## License

[Apache-2.0](LICENSE)
