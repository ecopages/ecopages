import { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/includes/layouts/base.layout.tsx"],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    'hidden'
  ]
}

export default config;