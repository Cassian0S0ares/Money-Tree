import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Fronteira do domínio: src/domain/ não importa I/O. Regra de lint,
    // não convenção. O teste tests/unit/boundary.test.ts cobre a mesma
    // regra em runtime; esta config a reforça em tempo de edição/CI.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["postgres", "pg", "react", "next", "node:fs", "node:net"],
          patterns: ["postgres/*", "pg/*", "react/*", "next/*", "node:fs/*", "node:net/*"],
        },
      ],
    },
  },
];

export default eslintConfig;
