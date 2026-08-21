export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#FFD700', 300: '#FFF6CC', 400: '#FFC300', 900: '#0A0A0A' }
      },
      fontFamily: { quick: ['Quicksand', 'sans-serif'] }
    }
  }
};
