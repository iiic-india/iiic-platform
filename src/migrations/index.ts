import * as migration_20261119_125620_initial from './20261119_125620_initial';

export const migrations = [
  {
    up: migration_20261119_125620_initial.up,
    down: migration_20261119_125620_initial.down,
    name: '20261119_125620_initial'
  },
];
