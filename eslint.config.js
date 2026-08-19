import globals from "globals";

export default [
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];