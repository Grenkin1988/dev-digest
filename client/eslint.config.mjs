// ESLint (flat config) for the web client.
//
// Next's recommended rules (React, react-hooks, jsx-a11y, import, core web
// vitals) plus the frontend-architecture boundaries from
// .claude/skills/frontend-architecture/references/enforcement.md:
//   - shared code (components/, lib/) never imports from routes (app/);
//   - no `export *` barrels;
//   - no reaching into another shared component's internals.
// Rules this codebase already satisfies are errors; the rest start as warnings
// so they can be paid down without blocking CI.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "src/vendor/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./src/components", "./src/lib"],
              from: "./src/app",
              message: "Shared code cannot import from routes. Move the code down or pass it in.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message: "Use explicit named re-exports in index.ts (narrow public API). No export *.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*/_components/*", "@/components/*/helpers", "@/components/*/constants"],
              message: "Import the component folder through its index.ts. If you need an internal, promote it.",
            },
          ],
        },
      ],
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@next/next/no-img-element": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
];
