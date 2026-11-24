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
import * as migration_20261120_200720_page_legal_review from './20261120_200720_page_legal_review';
import * as migration_20261120_213852_page_section_anchor from './20261120_213852_page_section_anchor';
import * as migration_20261121_094426_review_fixes from './20261121_094426_review_fixes';
import * as migration_20261121_105711_facts_source_page_copy from './20261121_105711_facts_source_page_copy';
import * as migration_20261121_185417_redirects_and_missing_pages from './20261121_185417_redirects_and_missing_pages';
import * as migration_20261122_082807_trust_layer from './20261122_082807_trust_layer';
import * as migration_20261122_083110_services_practitioners_faqs from './20261122_083110_services_practitioners_faqs';
import * as migration_20261122_083335_journal from './20261122_083335_journal';
import * as migration_20261122_095120_search_index from './20261122_095120_search_index';
import * as migration_20261122_095224_testimonials from './20261122_095224_testimonials';
import * as migration_20261122_150424_m3_foundation from './20261122_150424_m3_foundation';
import * as migration_20261122_150505_bookings_no_overlap from './20261122_150505_bookings_no_overlap';
import * as migration_20261122_161212_m3_job_tasks from './20261122_161212_m3_job_tasks';
import * as migration_20261123_083835_m3_flows from './20261123_083835_m3_flows';
import * as migration_20261123_162918_m4_pipeline from './20261123_162918_m4_pipeline';
import * as migration_20261124_073139_m5_admin from './20261124_073139_m5_admin';

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
    name: '20261120_195622_page_contact',
  },
  {
    up: migration_20261120_200720_page_legal_review.up,
    down: migration_20261120_200720_page_legal_review.down,
    name: '20261120_200720_page_legal_review',
  },
  {
    up: migration_20261120_213852_page_section_anchor.up,
    down: migration_20261120_213852_page_section_anchor.down,
    name: '20261120_213852_page_section_anchor',
  },
  {
    up: migration_20261121_094426_review_fixes.up,
    down: migration_20261121_094426_review_fixes.down,
    name: '20261121_094426_review_fixes',
  },
  {
    up: migration_20261121_105711_facts_source_page_copy.up,
    down: migration_20261121_105711_facts_source_page_copy.down,
    name: '20261121_105711_facts_source_page_copy',
  },
  {
    up: migration_20261121_185417_redirects_and_missing_pages.up,
    down: migration_20261121_185417_redirects_and_missing_pages.down,
    name: '20261121_185417_redirects_and_missing_pages',
  },
  {
    up: migration_20261122_082807_trust_layer.up,
    down: migration_20261122_082807_trust_layer.down,
    name: '20261122_082807_trust_layer',
  },
  {
    up: migration_20261122_083110_services_practitioners_faqs.up,
    down: migration_20261122_083110_services_practitioners_faqs.down,
    name: '20261122_083110_services_practitioners_faqs',
  },
  {
    up: migration_20261122_083335_journal.up,
    down: migration_20261122_083335_journal.down,
    name: '20261122_083335_journal',
  },
  {
    up: migration_20261122_095120_search_index.up,
    down: migration_20261122_095120_search_index.down,
    name: '20261122_095120_search_index',
  },
  {
    up: migration_20261122_095224_testimonials.up,
    down: migration_20261122_095224_testimonials.down,
    name: '20261122_095224_testimonials',
  },
  {
    up: migration_20261122_150424_m3_foundation.up,
    down: migration_20261122_150424_m3_foundation.down,
    name: '20261122_150424_m3_foundation',
  },
  {
    up: migration_20261122_150505_bookings_no_overlap.up,
    down: migration_20261122_150505_bookings_no_overlap.down,
    name: '20261122_150505_bookings_no_overlap',
  },
  {
    up: migration_20261122_161212_m3_job_tasks.up,
    down: migration_20261122_161212_m3_job_tasks.down,
    name: '20261122_161212_m3_job_tasks',
  },
  {
    up: migration_20261123_083835_m3_flows.up,
    down: migration_20261123_083835_m3_flows.down,
    name: '20261123_083835_m3_flows',
  },
  {
    up: migration_20261123_162918_m4_pipeline.up,
    down: migration_20261123_162918_m4_pipeline.down,
    name: '20261123_162918_m4_pipeline',
  },
  {
    up: migration_20261124_073139_m5_admin.up,
    down: migration_20261124_073139_m5_admin.down,
    name: '20261124_073139_m5_admin'
  },
];
