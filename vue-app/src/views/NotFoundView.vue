<template>
  <v-container class="py-16 text-center d-flex flex-column align-center">
    <div class="big-404">404</div>
    <h1 class="page-title">Page not found</h1>
    <p class="text-body-1 text-medium-emphasis mb-6 mt-3" style="max-width: 460px">
      That link doesn't lead anywhere. Maybe it moved, or never existed — let's get you back on track.
    </p>
    <div class="d-flex ga-3 justify-center flex-wrap">
      <v-btn color="primary" variant="flat" prepend-icon="mdi-home" :to="{ name: 'home' }">Home</v-btn>
      <v-btn color="secondary" variant="tonal" prepend-icon="mdi-gamepad-variant" :to="{ name: 'games' }">
        Games
      </v-btn>
    </div>
  </v-container>
</template>

<style scoped>
.big-404 {
  font-size: clamp(6rem, 22vw, 12rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.05em;
  background: linear-gradient(135deg, #8e24aa, #fbbf24);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  opacity: 0.9;
}
</style>
