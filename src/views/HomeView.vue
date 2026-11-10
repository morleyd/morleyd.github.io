<script setup>
import HeroSection from '@/components/HeroSection.vue';
import FeaturedWork from '@/components/FeaturedWork.vue';
import SideProjects from '@/components/SideProjects.vue';
import Timeline from '@/components/Timeline.vue';
</script>

<template>
  <v-container max-width="1100" class="px-4 px-md-8">
    <HeroSection />
    <FeaturedWork />
    <SideProjects />
    <Timeline />
  </v-container>
</template>
