const globals = require("globals");

// Función para limpiar (trim) las claves de los globales
const cleanGlobals = (obj) => {
  const newObj = {};
  for (const key in obj) {
    newObj[key.trim()] = obj[key];
  }
  return newObj;
};

module.exports = [
  // Configuración global para ignorar archivos de declaración y directorios generados
  {
    ignores: ["node_modules/", "dist/", ".next/", "**/*.d.ts"],
  },
  // Configuración para archivos TypeScript
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...cleanGlobals(globals.browser),
        ...cleanGlobals(globals.node),
      },
    },
    plugins: {
      "unused-imports": require("eslint-plugin-unused-imports"),
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Configuración para archivos JavaScript
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...cleanGlobals(globals.browser),
        ...cleanGlobals(globals.node),
      },
    },
    plugins: {
      "unused-imports": require("eslint-plugin-unused-imports"),
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
