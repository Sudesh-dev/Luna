export const colors = {
  background: '#09070D', surface: '#15111E', raised: '#20192B',
  lavender: '#C9A7FF', purple: '#B996F5', white: '#F8F2FC',
  muted: '#93899F', line: '#352B42', rose: '#F3BEDF',
};

export const artwork = [
  require('../../assets/art/moon-lake.png'),
  require('../../assets/art/moon-bridge.png'),
  require('../../assets/art/moon-torii.png'),
];

export const artFor = (index = 0) => artwork[Math.abs(Number(index) || 0) % artwork.length];
