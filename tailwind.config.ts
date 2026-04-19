import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#111827',
        panel: '#0f172a',
        border: '#1f2937',
        accent: '#38bdf8',
        muted: '#94a3b8',
      },
      boxShadow: {
        panel: '0 22px 50px rgba(2, 6, 23, 0.42)',
      },
      backgroundImage: {
        'app-gradient': 'radial-gradient(circle at top, rgba(14, 165, 233, 0.2), transparent 30%), radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.1), transparent 22%), linear-gradient(180deg, #020617 0%, #0f172a 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;