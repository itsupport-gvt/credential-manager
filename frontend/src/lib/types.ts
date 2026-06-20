export interface Credential {
  id: number;
  credential_id: string;
  tenant_code: string;
  tenant_name: string;
  category: string;
  subcategory: string;
  service_name: string;
  service_url: string;
  environment: string;
  status: string;        // Active | Inactive | Expired | Compromised | Archived
  priority: string;      // Critical | High | Medium | Low
  username_email: string;
  recovery_email: string;
  recovery_phone: string;
  mfa_enabled: string;   // Yes | No
  mfa_type: string;
  mfa_app_name: string;
  backup_codes_location: string;
  security_notes: string;
  account_display_name: string;
  account_id: string;
  license_type: string;
  plan_tier: string;
  subscription_start: string;
  subscription_end: string;
  auto_renewal: string;
  monthly_cost: number;
  billing_cycle: string;
  billing_email: string;
  payment_reference: string;
  access_level: string;
  linked_credential_id: string;
  client_id: string;
  tenant_id_app: string;
  subscription_id_azure: string;
  server_hostname: string;
  port: string;
  protocol: string;
  database_name: string;
  managed_by: string;
  managed_by_email: string;
  created_by: string;
  created_date: string;
  last_updated_by: string;
  last_updated_date: string;
  last_verified_date: string;
  last_password_changed: string;
  password_expiry_date: string;
  next_review_date: string;
  tags: string;
  notes: string;
  record_status: string;
  has_password: boolean;
  has_api_key: boolean;
  has_api_secret: boolean;
  has_client_secret: boolean;
}

export interface CredentialsPage {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: Credential[];
}

export interface ChangeLogItem {
  id: number;
  log_id: string;
  timestamp: string;
  credential_id: string;
  tenant_code: string;
  tenant_name: string;
  service_name: string;
  action: string;
  field_changed: string;
  old_value_masked: string;
  new_value_masked: string;
  changed_by: string;
  changed_by_email: string;
  reason: string;
  notes: string;
}

export interface ChangeLogPage {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: ChangeLogItem[];
}

export interface Tenant {
  id: number;
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  industry: string;
  primary_contact: string;
  contact_email: string;
  contact_phone: string;
  account_manager: string;
  contract_start: string;
  contract_end: string;
  status: string;
  notes: string;
}

export interface Category {
  category_id: string;
  category_name: string;
  category_code: string;
  description: string;
  subcategories: string[];
}

export interface Stats {
  total_credentials: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_category: { name: string; count: number }[];
  by_tenant: { code: string; name: string; count: number }[];
  expiring_30d: number;
  expiring_90d: number;
  no_mfa: number;
  pending_sync: number;
  recent_log: ChangeLogItem[];
}

export interface SyncStatus {
  pending_credentials: number;
  pending_logs: number;
  last_sync: string | null;
}
