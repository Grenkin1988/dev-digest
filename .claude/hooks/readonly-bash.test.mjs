// Unit tests for the read-only Bash guard. Zero deps: node's built-in runner.
//   node --test .claude/hooks/
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classify } from "./readonly-bash.mjs";

const HOOK = fileURLToPath(new URL("./readonly-bash.mjs", import.meta.url));

test("allows read-only inspection, lint, typecheck and test commands", () => {
  for (const cmd of [
    "git diff --name-only main...HEAD",
    "cd server && pnpm lint",
    "git log --oneline | head -20",
    "pnpm exec vitest run test/x.test.ts",
    "cd client && pnpm exec vitest run src/a.test.tsx && pnpm typecheck",
    "git status",
    "git grep -n \"a > b\" -- client",
    "git diff main...HEAD | grep -c foo | wc -l",
    "cat AGENTS.md",
    "ls -la .claude",
    "node --test .claude/hooks/",
    "pnpm test",
  ]) {
    assert.equal(classify(cmd).allow, true, cmd);
  }
});

test("blocks write flags and mutating commands", () => {
  for (const cmd of [
    "pnpm lint --fix",
    "pnpm exec vitest run -u",
    "pnpm exec vitest run --update",
    "git checkout main",
    "git commit -m x",
    "git push",
    "pnpm install",
    "sed -i s/a/b/ file",
    "rm -rf x",
    "git log --output=out.txt",
    "node -e 1",
    "node --test --eval 1",
    "node script.mjs",
  ]) {
    assert.equal(classify(cmd).allow, false, cmd);
  }
});

test("blocks chaining, redirects and substitution", () => {
  for (const cmd of [
    "git diff > out.txt",
    "cat a; rm b",
    "cat a || rm b",
    "cat a & rm b",
    "echo $(rm -rf x)",
    "cat \"$(rm -rf x)\"",
    "cat `rm x`",
    "cat a < b",
    "git diff | tee out.txt",
    "git diff | sort -o out.txt",
    "ls\nrm x",
    "cat \"unterminated",
  ]) {
    assert.equal(classify(cmd).allow, false, cmd);
  }
});

test("quoted text that merely mentions a command is not scanned", () => {
  assert.equal(classify("git grep \"rm -rf; x\" -- server").allow, true);
  assert.equal(classify("git grep -n 'a\\b' -- server").allow, true);
  assert.equal(classify("git grep -n \"say \\\"hi\\\"; x\" -- server").allow, true);
});

test("regression: escaped quotes cannot hide metacharacters", () => {
  for (const cmd of [
    String.raw`ls \' ; touch pwned ; \'`,
    String.raw`ls \" ; rm -rf src ; \"`,
    String.raw`cat \' > out.txt \'`,
    String.raw`cd D:\Workspace`,
  ]) {
    assert.equal(classify(cmd).allow, false, cmd);
  }
});

test("regression: flags that run programs or write files are blocked", () => {
  for (const cmd of [
    "git grep -Orm -l TODO",
    "git grep -nOrm TODO",
    "git grep --open-files-in-pager=rm TODO",
    "git diff --ext-diff main",
    "git log -p --textconv",
    "git diff | sort --compress-program=sh -S 1",
    "git diff | sort -T /tmp",
    "git diff | sort --temporary-directory=/tmp",
    "git diff | sort -no out.txt",
    "pnpm test --reporter=json --outputFile=x.json",
    "pnpm exec vitest run --outputFile.json=x.json",
    "node --test --test-reporter-destination=x.txt .claude/hooks/",
  ]) {
    assert.equal(classify(cmd).allow, false, cmd);
  }
});

test("blocks empty and non-string commands", () => {
  for (const cmd of ["", "   ", undefined, null, 42, {}]) {
    const r = classify(cmd);
    assert.equal(r.allow, false);
    assert.ok(r.reason.length > 0);
  }
});

function runHook(stdin) {
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: "utf8" });
}

test("entry point: exit 0 on allowed, 2 on blocked, 2 on malformed or missing input", () => {
  assert.equal(runHook(JSON.stringify({ tool_input: { command: "git status" } })).status, 0);
  const blocked = runHook(JSON.stringify({ tool_input: { command: "rm -rf x" } }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /readonly-bash/);
  assert.equal(runHook("{not json").status, 2);
  assert.equal(runHook("").status, 2);
  assert.equal(runHook("{}").status, 2);
  assert.equal(runHook(JSON.stringify({ tool_input: { command: 5 } })).status, 2);
});
