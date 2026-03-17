-- Remove old SMTP config keys (replaced by Brevo API)
DELETE FROM "SystemConfig" WHERE "key" IN ('smtp_host', 'smtp_port', 'smtp_email', 'smtp_password', 'smtp_from_name');
