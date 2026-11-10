<script setup lang="ts">
import { profile } from '@/data/portfolio';

const contactLinks = [
  { label: 'Email', icon: 'mdi-email-outline', href: `mailto:${profile.email}` },
  { label: 'LinkedIn', icon: 'mdi-linkedin', href: profile.linkedin },
  { label: 'GitHub', icon: 'mdi-github', href: profile.github }
];
</script>

<template>
  <section class="hero" aria-labelledby="hero-name">
    <div class="hero-text">
      <h1 id="hero-name" class="hero-name">{{ profile.name }}</h1>
      <p class="hero-headline" data-testid="headline">{{ profile.headline }}</p>
      <p class="hero-summary">{{ profile.summary }}</p>
      <p class="hero-meta">{{ profile.current }} · {{ profile.location }}</p>

      <div class="hero-actions">
        <v-btn
          :href="profile.resumeUrl"
          target="_blank"
          color="secondary"
          variant="flat"
          size="large"
          prepend-icon="mdi-file-document-outline"
          data-testid="resume-link"
        >
          Résumé (PDF)
        </v-btn>
        <v-btn
          v-for="link in contactLinks"
          :key="link.label"
          :href="link.href"
          :target="link.href.startsWith('http') ? '_blank' : undefined"
          :rel="link.href.startsWith('http') ? 'noopener' : undefined"
          variant="text"
          :prepend-icon="link.icon"
        >
          {{ link.label }}
        </v-btn>
      </div>
    </div>

    <v-avatar size="200" class="hero-photo d-none d-md-flex">
      <v-img
        :src="profile.photo"
        :srcset="profile.photoSrcset"
        sizes="200px"
        :alt="`Photo of ${profile.name}`"
        cover
      />
    </v-avatar>
  </section>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 48px;
  padding: 40px 0 24px;
}

.hero-text {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-name {
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 800;
  line-height: 1.1;
  margin: 0;
}

.hero-headline {
  margin-top: 8px;
  font-size: clamp(1.1rem, 2.2vw, 1.4rem);
  font-weight: 600;
  color: #fbbf24;
}

.hero-summary {
  margin-top: 16px;
  max-width: 62ch;
  font-size: 1.1rem;
  line-height: 1.6;
  color: #e2e8f0;
}

.hero-meta {
  margin-top: 12px;
  font-size: 0.95rem;
  color: #94a3b8;
}

.hero-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 4px;
}

.hero-actions > :first-child {
  margin-right: 12px;
}

.hero-photo {
  flex: 0 0 auto;
  border: 4px solid rgba(142, 36, 170, 0.6);
}

@media (max-width: 600px) {
  .hero {
    padding-top: 24px;
  }

  .hero-summary {
    font-size: 1rem;
  }
}
</style>
