-- Update smtp_port from 587 to 465 for Gmail SSL
UPDATE "SystemConfig" SET "value" = '465' WHERE "key" = 'smtp_port' AND "value" = '587';
