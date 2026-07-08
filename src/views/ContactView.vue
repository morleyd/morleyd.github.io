<script setup lang="ts">
const links = [
  { icon: 'mdi-email-outline', label: 'morley.david.c@gmail.com', href: 'mailto:morley.david.c@gmail.com' },
  { icon: 'mdi-phone-outline', label: '(435) 494-1538', href: 'tel:4354941538' },
  { icon: 'mdi-github', label: 'GitHub Repositories', href: 'https://github.com/morleyd' },
  { icon: 'mdi-linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/dcmorley' },
]
</script>

<template>
  <v-container class="py-8 fill-height">
    <div class="contact-wrap d-flex flex-column flex-md-row align-center justify-center ga-8 mx-auto">
      <v-avatar size="240" class="flex-shrink-0">
        <v-img src="/images/DMorley2021_lite.png" alt="David Morley" cover />
      </v-avatar>

      <div class="contact-list">
        <a
          v-for="link in links"
          :key="link.href"
          class="contact-row"
          :href="link.href"
          :target="link.href.startsWith('http') ? '_blank' : undefined"
          rel="noopener"
        >
          <v-icon :icon="link.icon" color="primary" size="32" />
          <span>{{ link.label }}</span>
        </a>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.contact-wrap {
  max-width: 760px;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #e2e8f0;
  text-decoration: none;
  font-size: 1.15rem;
  transition: color 0.15s ease;
}

.contact-row:hover {
  color: rgb(var(--v-theme-primary));
}

.contact-row:hover :deep(.v-icon) {
  transform: scale(1.1);
}

@media (max-width: 600px) {
  .contact-row {
    font-size: 1rem;
  }
}
</style>
