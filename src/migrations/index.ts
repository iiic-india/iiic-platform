import * as migration_20261119_125620_initial from './20261119_125620_initial';
import * as migration_20261119_160247_staff_active from './20261119_160247_staff_active';
import * as migration_20261119_161126_staff_totp from './20261119_161126_staff_totp';

export const migrations = [
  {
    up: migration_20261119_125620_initial.up,
    down: migration_20261119_125620_initial.down,
    name: '20261119_125620_initial',
  },
  {
    up: migration_20261119_160247_staff_active.up,
    down: migration_20261119_160247_staff_active.down,
    name: '20261119_160247_staff_active',
  },
  {
    up: migration_20261119_161126_staff_totp.up,
    down: migration_20261119_161126_staff_totp.down,
    name: '20261119_161126_staff_totp'
  },
];
