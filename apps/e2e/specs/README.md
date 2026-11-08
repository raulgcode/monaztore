# Test plans

The plans the Planner agent writes (`.claude/agents/playwright-test-planner.md`), one per
feature: `apps/e2e/specs/<feature>.md`. The Generator turns them into specs in `apps/e2e/tests`,
which are reviewed like any other code. A plan is a draft to decide what to test; the test that
counts is the spec.

## Pending: Generator, by hand or hybrid?

On the next feature with a new flow, its suite is written three ways and compared before deciding
which one to use from then on:
1. **By hand**, with the conventions in `AGENTS.md`.
2. **Planner + Generator**, as they come.
3. **Hybrid**: the Planner proposes the scenarios, they are reviewed and written by hand.

Measure the time, how much had to be fixed, whether they pass on `desktop` and `mobile` and how
explicit each scenario is (which behavior it proves and with what exact text or number it checks
it).
