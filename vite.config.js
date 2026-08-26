import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        activities: resolve(__dirname, 'activities.html'),
        news: resolve(__dirname, 'news.html'),
        newsArticle: resolve(__dirname, 'news-article.html'),
        about: resolve(__dirname, 'about.html'),
        members: resolve(__dirname, 'members.html'),
        memberProfile: resolve(__dirname, 'member-profile.html'),
        simRigs: resolve(__dirname, 'sim-rigs.html'),
        media: resolve(__dirname, 'media.html'),
        shop: resolve(__dirname, 'shop.html'),
        contact: resolve(__dirname, 'contact.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
});
