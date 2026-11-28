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

## Using SpecSmith

1. Open **Apps → SpecSmith** in Confluence.
2. Drop in the CSV extracts for a feed. They are profiled in your browser.
3. Review the spec. Yellow cells need a decision; hover a badge to see why a value was chosen; click a cell to edit it.
4. Pick a space and click **Preview (dry run)** to see exactly which pages would be created, updated or skipped, and why.
5. Click **Approve & publish**. Each page reports `created`, `updated`, `skipped` or `failed`, and every run is kept in **Run history**.
6. Under **Plan the delivery in Jira**, pick a project, preview, and approve. SpecSmith creates an Epic and seven stories from `config/story-templates.json`, with BDD acceptance criteria, story points, "Blocks" dependencies and links to the spec. The spec's parent page links back to the Epic.

Every publish also attaches an **export pack** to the spec's parent page. An attachment is only re-uploaded when its content changed.

| File | Contents |
|---|---|
| `ddl.sql` | ANSI SQL `CREATE` statements for the raw, curated and analytics zones. The analytics views leave out PII/PCI columns until a masking policy is approved. |
| `schema.yml` | dbt models with descriptions and `not_null`, `unique` and `accepted_values` tests |
| `data-contract.yaml` | A data contract in the Open Data Contract Standard (v3) layout, with classifications |
| `feed.schema.json` | A JSON Schema (draft 2020-12) for each file |
| `checks.sql` | One query per data check; an empty result means the check passed |

SpecSmith owns only the summary and description of the issues it creates. Status, assignee, estimates and comments can be changed freely in Jira. If someone edits a summary or description in Jira, SpecSmith reports that issue as `failed` and leaves it alone.

Publishing again with no changes skips every page. If someone edits a generated page directly in Confluence, SpecSmith refuses to overwrite it and tells you which page changed.

On the published pages, **yellow** means TBD, **grey** means derived by rules and not yet confirmed by a person, **purple** means an AI suggestion a reviewer accepted, and **no colour** means set by a person or by configuration.

## Demo data

`demo-data/retail-accounts/` holds a synthetic **Retail Accounts** feed: `customers`, `accounts`, `transactions` and `cards` (about 4,900 rows in total) in two versions. Everything is fake and deterministic, so you can regenerate it with `npm run demo-data`.

- **v1** includes the things SpecSmith should catch:
  - PII and PCI columns
  - leading-zero codes
  - `DD/MM/YYYY` dates
  - unclear columns (`col_17`, `FLAG_X`)
  - untrimmed values and `N/A` null tokens
  - one prompt-injection string in free text, used as a guardrail test fixture
- **v2** changes the schema, for the drift demo:
  - `customers.c_email` is renamed to `email_address`
  - `customers.alt_phone_no` is added (a new PII column)
  - `customers.FLAG_X` is dropped
  - `accounts.branch_no` is widened from 5 to 7 characters

## Rules configuration

All deterministic rules read their settings from `config/`:

| File | Controls |
|---|---|
| `types.json` | null and boolean tokens, the type-inference threshold, length headroom and standard sizes |
| `naming.json` | snake_case target names, abbreviation expansion, reserved words, "unclear name" patterns |
| `pii.json` | PII and PCI categories: name keywords plus content signals (email shape, Luhn-valid numbers, IPs, phone and postal shapes) |
| `lint.json` | the severity of each spec check, or `off` |
| `story-templates.json` | the Epic and story templates (placeholders like `{feedName}` and `{tbdCount}`), issue-type names, story-point field names, and dependencies |

Every derived value records its **evidence**, for example *"rule card_number: name contains "card_no"; 100.0% of values match luhnCard pattern"*. Rules never mark a column as non-PII; that is left `tbd` for a human or the PII Classifier agent to decide.

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
  domain/           profile and spec types (every spec field carries its source)
  profile/          streaming column profiler (runs in the browser)
  rules/            pure rule functions (precedence, types, keys, naming, PII hints, lint)
  spec/             build a spec from profiles; merge without overriding human edits
  gatekeeper/       write planning: create / update / skip / fail closed
  render/           Confluence storage format and Jira ADF builders
  platform/         product API wrapper (asUser), multipart builder
  resolvers/        Custom UI backend
  actions/          Rovo action handlers
static/app/         React Custom UI (Vite)
config/             rule settings (JSON)
demo-data/          synthetic demo feed generator and CSVs
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
- [x] Rules engine and column profiler (config-driven, tested on the demo feed)
- [x] Intake UI: upload, profiling in a web worker, spec grid with source badges and inline editing
- [x] Spec editor and Confluence publishing with dry run (idempotent, fails closed on outside edits, run history)
- [x] Gatekeeper, Jira story planner and run history
- [x] Export pack: DDL, dbt `schema.yml`, data contract, JSON Schema, SQL checks (attached to the spec, golden-file tested)
- [ ] Relationship detection and ER diagram
- [ ] Rovo agent crew, guardrails and the suggestion review panel
- [ ] Test design and traceability
- [ ] Review and sign-off workflow
- [ ] Schema drift detection and spec versioning
- [ ] Cross-feed reuse, status macro, Jira issue panel and MCP tools

## License

[Apache-2.0](LICENSE)
