module.exports = {
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    endOfLine: 'lf',
    semi: false,
    singleQuote: true,
    overrides: [
        {
            files: '*.json',
            options: {
                tabWidth: 2,
            },
        },
    ],
}
