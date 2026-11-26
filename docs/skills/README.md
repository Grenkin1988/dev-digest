# Sample skills

Skills are reusable, text-only instruction blocks that agents link and that are added
to the review prompt (see the Skills page in the web app). The starter skills are seeded
from `server/src/db/seed-skills.ts`; the samples here are for trying the **import** path.

| Sample | What it is |
|--------|------------|
| [`flaky-test-detector/`](./flaky-test-detector/SKILL.md) | A skill folder (`SKILL.md` + a `scripts/run.sh` that is never read or run). |
| `flaky-test-detector.zip` | The same folder zipped — upload it from **Skills → Add Skill → Import from file**. The preview lists `scripts/run.sh` under "Ignored — not read or executed"; nothing is saved until you press Save. |

Regenerate the zip after editing the folder: `node docs/skills/build-sample-zip.cjs`
(uses `fflate` from `server/node_modules`).
