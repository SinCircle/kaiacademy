import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [problemEditor, playgroundEditor, problemQueries, playgroundQueries, contentTransfer, adminScreens, candidateRoute] = await Promise.all([
  readFile(new URL("../app/components/ProblemEditor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/PlaygroundEditor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../db/queries.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/playground.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/content-transfer.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AdminScreens.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/problems/[id]/transfer-candidates/route.ts", import.meta.url), "utf8"),
]);

test("problem and playground editors reuse the same ownership-transfer dialog", () => {
  assert.match(problemEditor, /import \{ ContentTransferDialog/);
  assert.match(problemEditor, /<ContentTransferDialog/);
  assert.match(playgroundEditor, /import \{ ContentTransferDialog/);
  assert.match(playgroundEditor, /<ContentTransferDialog/);
});

test("creator-level content access is limited to the owner and superadmin", () => {
  assert.match(contentTransfer, /viewer\.id === currentOwnerId \|\| viewer\.role === "superadmin"/);
  assert.match(problemQueries, /action === "transfer_ownership"/);
  assert.match(problemQueries, /canEditProblem: canActAsContentCreator\(viewer, problem\.creatorId\)/);
  assert.match(problemQueries, /requireActiveTransferTarget\(authority\.creatorId, payload\.targetMemberId\)/);
  assert.doesNotMatch(problemQueries, /authority\.isCreator \|\| viewer\.role === "admin"/);
  assert.match(playgroundQueries, /canEdit: canManageContent, canDelete: canManageContent/);
  assert.match(playgroundQueries, /requireActiveTransferTarget\(post\.authorId, targetMemberIdValue\)/);
  assert.match(adminScreens, /member\?\.role === "superadmin" && <Link href=\{`\/problems\/\$\{problem\.id\}\/settings`\}/);
  assert.match(candidateRoute, /searchProblemTransferCandidates/);
});
