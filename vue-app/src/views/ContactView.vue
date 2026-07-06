<template>
  <v-card class="bg-blue-grey-darken-4 fill-height d-flex flex-column flex-md-row justify-center align-center ga-6 pa-4">
    
    <div class="images_holder">
      <img src="/images/DMorley2021_lite.png" style="border-radius: 100%;" alt="David Morley" />
    </div>
    <div class="box_contact">
      <span class="email">
        <a href="mailto:morley.david.c@gmail.com" target="_blank">morley.david.c@gmail.com</a>
      </span>
      <span class="phone">
        <a href="tel:4354941538" target="_blank">(435) 494-1538</a>
      </span>
      <span class="git">
        <a href="https://github.com/morleyd" target="_blank">GitHub Repositories</a>
      </span>
      <span class="linked">
        <a href="https://linkedin.com/in/dcmorley" target="_blank">LinkedIn</a>
      </span>
    </div>
  </v-card>
</template>

<script setup lang="ts"></script>

<style scoped>
.clear {
  clear: both;
}

.images_holder {
  float: left;
  margin: 5px 130px 0 0;
  width: 370px;
}

.images_holder img {
  width: 100%;
  height: auto;
  display: inline;
}

.box_contact {
  overflow: hidden;
  margin: 54px 0 0 0;
}

.box_contact span {
  color: #fff;
  font-family: 'novecento_sans_widebook', sans-serif;
  font-size: 30px;
  line-height: 32px;
  text-transform: uppercase;
  display: block;
  margin: 0 0 55px;
  padding: 5px 0 18px 80px;
}

.box_contact span.email {
  background: url(/images/icon_email2.png) no-repeat;
}

.box_contact span.phone {
  background: url(/images/icon_phone.png) no-repeat;
}

.box_contact span.git {
  background: url(/images/icon_git.png) no-repeat;
}

.box_contact span.linked {
  background: url(/images/icon_linked.png) no-repeat;
}

.box_contact span a {
  color: #fff;
  text-decoration: none;
}

.box_contact span a:hover {
  text-decoration: underline;
}

@media only screen and (max-width: 1130px) {
  .images_holder {
    margin: 5px 80px 0 0;
  }

  .box_contact span {
    font-size: 25px;
  }
}

@media only screen and (max-width: 980px) {
  .box_contact span {
    font-size: 23px;
    margin: 0 0 40px;
  }

  .images_holder {
    margin: 5px 30px 0 0;
    width: 300px;
  }

  .box_contact {
    margin: 40px 0 0 0;
  }
}

@media only screen and (max-width: 840px) {
  .images_holder {
    margin: 5px auto 20px;
    width: 300px;
    float: none;
  }

  .box_contact {
    margin: 40px auto 0;
    width: 460px;
  }
}

@media only screen and (max-width: 550px) {
  .box_contact {
    margin: 40px auto 0;
    width: 300px;
  }

  .box_contact span.email {
    font-size: 14px;
  }
}

@media screen and (max-width: 420px) {
  .box_contact {
    margin: 40px auto 0;
    width: 280px;
  }

  .box_contact span.email {
    font-size: 12px;
  }

  .images_holder {
    width: 280px;
    margin: 0 auto 20px;
  }
}

@media (-webkit-min-device-pixel-ratio: 2),
  (min--moz-device-pixel-ratio: 2),
  (-o-min-device-pixel-ratio: 2/1),
  (min-device-pixel-ratio: 2),
  (min-resolution: 192dpi),
  (min-resolution: 2dppx) {
  .box_contact span.email {
    background-image: url(/images/icon_email2@x2.png);
    background-size: 54px 41px;
  }

  .box_contact span.phone {
    background-image: url(/images/icon_phone@x2.png);
    background-size: 54px 54px;
  }
}
</style>

