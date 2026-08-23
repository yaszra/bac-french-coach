import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "eslint-config-next";

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "playwright-report/**"]),
  ...nextPlugin,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Marginalia component system: raw controls are forbidden in product UI.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use the Marginalia <Button>/<IconButton> component, not raw <button>. (Allowed only inside src/modules/design/.)",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use the Marginalia <Field>/<Input> component, not raw <input>. (Allowed only inside src/modules/design/.)",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: "Use the Marginalia <Select> component, not raw <select>. (Allowed only inside src/modules/design/.)",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: "Use the Marginalia <Textarea> component, not raw <textarea>. (Allowed only inside src/modules/design/.)",
        },
      ],
    },
  },
  {
    // The design system itself is the only place raw controls may exist.
    files: ["src/modules/design/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": "off" },
  },
]);
