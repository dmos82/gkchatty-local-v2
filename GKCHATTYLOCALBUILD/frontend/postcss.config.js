module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    cssnano: {
      preset: ['default', { colormin: false }],
    },
  },
};
