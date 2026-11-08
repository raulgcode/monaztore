import { ownerTest, test } from "../support/fixtures";

// Where the Planner and the Generator (.claude/agents) start: the owner of the worker's
// workspace, signed in, on its home. What a scenario needs on top of this goes through core with
// `workspace.tenant`. Not a scenario: it checks nothing.
test.describe("Seed", () => {
  ownerTest("seed", async ({ page, workspace }) => {
    await page.goto(`/app/${workspace.slug}`);
  });
});
