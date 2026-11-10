<script setup lang="ts">
import { about, profile } from '@/data/portfolio';

const links = [
  { icon: 'mdi-email-outline', label: profile.email, href: `mailto:${profile.email}` },
  { icon: 'mdi-linkedin', label: 'LinkedIn', href: profile.linkedin },
  { icon: 'mdi-github', label: 'GitHub', href: profile.github },
  { icon: 'mdi-file-document-outline', label: 'Résumé (PDF)', href: profile.resumeUrl }
];
</script>

<template>
  <v-container max-width="1000" class="px-4 px-md-8 py-8">
    <h1 class="page-title mb-8">About</h1>
    <div class="about-wrap">
      <!-- Photo + contact stay in view (sticky) while the bio scrolls on wide screens. -->
      <aside class="about-side">
        <v-avatar size="220" class="about-photo">
          <v-img
            :src="profile.photo"
            :srcset="profile.photoSrcset"
            sizes="220px"
            :alt="`Photo of ${profile.name}`"
            cover
          />
        </v-avatar>

        <h2 class="contact-title">Contact</h2>
        <div class="contact-list">
          <a
            v-for="link in links"
            :key="link.href"
            class="contact-row"
            :href="link.href"
            :target="link.href.startsWith('mailto:') ? undefined : '_blank'"
            rel="noopener"
          >
            <v-icon :icon="link.icon" size="24" />
            <span>{{ link.label }}</span>
          </a>
        </div>
      </aside>

      <div class="about-text">
        <p v-for="(paragraph, i) in about" :key="i">{{ paragraph }}</p>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.about-wrap {
  display: flex;
  gap: 48px;
  align-items: flex-start;
}

.about-side {
  position: sticky;
  /* Clear the 64px app bar with some breathing room. */
  top: 88px;
  flex: 0 0 250px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.about-photo {
  border: 4px solid rgba(142, 36, 170, 0.6);
}

.about-text {
  max-width: 68ch;
  line-height: 1.7;
  color: #e2e8f0;
}

.about-text p + p {
  margin-top: 16px;
}

.contact-title {
  margin: 28px 0 12px;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.contact-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #e2e8f0;
  text-decoration: none;
  font-size: 0.95rem;
  width: fit-content;
  overflow-wrap: anywhere;
}

/* Icons in the lighter purple: the theme purple is under 3:1 on the slate background. */
.contact-row :deep(.v-icon) {
  color: #c084fc;
}

.contact-row:hover,
.contact-row:focus-visible {
  color: #c084fc;
  text-decoration: underline;
}

@media (max-width: 760px) {
  .about-wrap {
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }

  /* Stacked on phones: photo + contact sit above the bio and scroll normally. */
  .about-side {
    position: static;
    flex-basis: auto;
    align-items: center;
  }
}
</style>
