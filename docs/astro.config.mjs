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
      social: {
        github: 'https://github.com/getsentry/abacus',
      },
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
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Providers',
          autogenerate: { directory: 'providers' },
        },
        {
          label: 'CLI Reference',
          autogenerate: { directory: 'cli' },
        },
        {
          label: 'Deployment',
          autogenerate: { directory: 'deployment' },
        },
        {
          label: 'Development',
          collapsed: true,
          autogenerate: { directory: 'development' },
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/getsentry/abacus/edit/main/docs/',
      },
      lastUpdated: true,
    }),
  ],
});
