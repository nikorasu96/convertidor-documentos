// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",

  // Mapeos de alias para "@/..."
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Transformar módulos ESM en node_modules (p-limit, yocto-queue)
  transformIgnorePatterns: [
    "/node_modules/(?!p-limit|yocto-queue)"
  ],

  // Soporte para .ts, .tsx y .mjs
  transform: {
    "^.+\\.(ts|tsx|mjs)$": "ts-jest",
  },

  testMatch: [
    "<rootDir>/src/**/*.test.(ts|tsx)",
    "<rootDir>/__tests__/**/*.test.(ts|tsx)"
  ],

  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // Configuración de ts-jest
  globals: {
    "ts-jest": {
      tsconfig: {
        jsx: "react"
      }
    }
  }
};
