import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        // build-test.js y tools/ son scripts locales de empaquetado y generación,
        // no forman parte del visual que se publica.
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "build-test.js", "tools/**"],
    },
];
