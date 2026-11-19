import * as migration_20261119_125620_initial from './20261119_125620_initial';
import * as migration_20261119_160247_staff_active from './20261119_160247_staff_active';

export const migrations = [
  {
    up: migration_20261119_125620_initial.up,
    down: migration_20261119_125620_initial.down,
    name: '20261119_125620_initial',
  },
  {
    up: migration_20261119_160247_staff_active.up,
    down: migration_20261119_160247_staff_active.down,
    name: '20261119_160247_staff_active'
  },
];
