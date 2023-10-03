module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    root: true,
    ignorePatterns: ["bin/*", "test/*", "lib/*.js", "jest.config.js", "lib/*.d.ts"],
    rules: {
        'quotes': ['error', 'single'],
        // we want to force semicolons
        'semi': ['error', 'always'],
        // we use 2 spaces to indent our code
        'indent': ['error', 2],
        // we want to avoid extraneous spaces
        'no-multi-spaces': ['error'],
        "@typescript-eslint/no-explicit-any": ["off"]
    }
};
