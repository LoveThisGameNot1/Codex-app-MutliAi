import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0a0f1c',
        panel: '#0d1424',
        border: '#243044',
        accent: '#38bdf8',
        muted: '#8da2bd',
        ember: '#f59e0b',
        mint: '#34d399',
      },
      boxShadow: {
        panel: '0 22px 70px rgba(1, 7, 19, 0.52)',
        glow: '0 0 0 1px rgba(56, 189, 248, 0.12), 0 28px 90px rgba(8, 47, 73, 0.35)',
      },
      backgroundImage: {
        'app-gradient': 'radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.22), transparent 24%), radial-gradient(circle at 88% 18%, rgba(52, 211, 153, 0.16), transparent 22%), radial-gradient(circle at 65% 95%, rgba(245, 158, 11, 0.09), transparent 28%), linear-gradient(135deg, #020617 0%, #06111f 42%, #0b1220 100%)',
        'panel-sheen': 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025) 42%, rgba(255,255,255,0.045))',
      },
    },
  },
  plugins: [],
} satisfies Config;
