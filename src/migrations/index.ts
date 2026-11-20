import * as migration_20261119_125620_initial from './20261119_125620_initial';
import * as migration_20261119_160247_staff_active from './20261119_160247_staff_active';
import * as migration_20261119_161126_staff_totp from './20261119_161126_staff_totp';
import * as migration_20261119_162709_staff_recovery_codes from './20261119_162709_staff_recovery_codes';
import * as migration_20261120_094503_audit_log from './20261120_094503_audit_log';
import * as migration_20261120_094534_audit_log_append_only from './20261120_094534_audit_log_append_only';
import * as migration_20261120_112710_media_object_key from './20261120_112710_media_object_key';
import * as migration_20261120_153934_pages from './20261120_153934_pages';
import * as migration_20261120_171130_page_comparison_points from './20261120_171130_page_comparison_points';
import * as migration_20261120_172749_page_cards from './20261120_172749_page_cards';
import * as migration_20261120_184904_page_scope_and_notes from './20261120_184904_page_scope_and_notes';
import * as migration_20261120_191404_page_certificate from './20261120_191404_page_certificate';
import * as migration_20261120_195622_page_contact from './20261120_195622_page_contact';

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
    name: '20261119_161126_staff_totp',
  },
  {
    up: migration_20261119_162709_staff_recovery_codes.up,
    down: migration_20261119_162709_staff_recovery_codes.down,
    name: '20261119_162709_staff_recovery_codes',
  },
  {
    up: migration_20261120_094503_audit_log.up,
    down: migration_20261120_094503_audit_log.down,
    name: '20261120_094503_audit_log',
  },
  {
    up: migration_20261120_094534_audit_log_append_only.up,
    down: migration_20261120_094534_audit_log_append_only.down,
    name: '20261120_094534_audit_log_append_only',
  },
  {
    up: migration_20261120_112710_media_object_key.up,
    down: migration_20261120_112710_media_object_key.down,
    name: '20261120_112710_media_object_key',
  },
  {
    up: migration_20261120_153934_pages.up,
    down: migration_20261120_153934_pages.down,
    name: '20261120_153934_pages',
  },
  {
    up: migration_20261120_171130_page_comparison_points.up,
    down: migration_20261120_171130_page_comparison_points.down,
    name: '20261120_171130_page_comparison_points',
  },
  {
    up: migration_20261120_172749_page_cards.up,
    down: migration_20261120_172749_page_cards.down,
    name: '20261120_172749_page_cards',
  },
  {
    up: migration_20261120_184904_page_scope_and_notes.up,
    down: migration_20261120_184904_page_scope_and_notes.down,
    name: '20261120_184904_page_scope_and_notes',
  },
  {
    up: migration_20261120_191404_page_certificate.up,
    down: migration_20261120_191404_page_certificate.down,
    name: '20261120_191404_page_certificate',
  },
  {
    up: migration_20261120_195622_page_contact.up,
    down: migration_20261120_195622_page_contact.down,
    name: '20261120_195622_page_contact'
  },
];
