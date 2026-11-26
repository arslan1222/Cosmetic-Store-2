/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Token names are unchanged so the admin/vendor dashboards keep working;
        // only the values moved to the new, cooler "bone + aubergine + tulip" palette.
        cream: "#F7F3EF",
        ink: "#241521",
        berry: {
          50: "#FBEAEE",
          100: "#F5DDE4",
          200: "#E3AFBE",
          300: "#D4849B",
          400: "#C24F6C",
          500: "#A6314F",
          600: "#8A2540",
          700: "#6E1D33",
        },
        gold: {
          400: "#D2AE5C",
          500: "#B8923D",
          600: "#96772F",
        },
        blush: "#F5E1E8",
        petal: "#F4E4E8",
        sage: "#DDE4D7",
        taupe: "#BDB2A7",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ["Figtree", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(36, 21, 33, 0.25)",
        lift: "0 20px 40px -20px rgba(36, 21, 33, 0.35)",
      },
      keyframes: {
        drawerRight: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        drawerLeft: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        dropIn: { from: { opacity: 0, transform: "translateY(-8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        "drawer-right": "drawerRight .3s cubic-bezier(.22,.8,.3,1)",
        "drawer-left": "drawerLeft .3s cubic-bezier(.22,.8,.3,1)",
        "fade-in": "fadeIn .25s ease-out",
        "drop-in": "dropIn .2s ease-out",
      },
    },
  },
  plugins: [],
};
