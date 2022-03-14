module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    env: {
        node: true,
    },
    parserOptions: { ecmaVersion: 2017 },
    rules: {
        'prettier/prettier': 'error',
        'max-params': ['error', 5],
        curly: 'error',
        'arrow-body-style': ['error', 'always'],
    },
    extends: ['prettier'],
    plugins: ['prettier'],
}
