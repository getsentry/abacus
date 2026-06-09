import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://getsentry.github.io',
  base: '/abacus',
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  integrations: [
    starlight({
      title: 'Abacus',
      description: 'Track and analyze AI coding tool usage across your team',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/getsentry/abacus',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'script',
          content: `
            localStorage.setItem('starlight-theme', 'dark');
            document.documentElement.dataset.theme = 'dark';
          `,
        },
      ],
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      sidebar: [
        { label: 'Welcome', link: '/' },
        {
          label: 'Getting Started',
          items: [{ autogenerate: { directory: 'getting-started' } }],
        },
        {
          label: 'Providers',
          items: [{ autogenerate: { directory: 'providers' } }],
        },
        {
          label: 'CLI Reference',
          items: [{ autogenerate: { directory: 'cli' } }],
        },
        {
          label: 'Deployment',
          items: [{ autogenerate: { directory: 'deployment' } }],
        },
        {
          label: 'Development',
          collapsed: true,
          items: [{ autogenerate: { directory: 'development' } }],
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/getsentry/abacus/edit/main/docs/',
      },
      lastUpdated: true,
    }),
  ],
});
