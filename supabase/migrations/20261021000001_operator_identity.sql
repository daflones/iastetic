-- Identidade de operador no chat: PIN por profissional + cor + registro de quem enviou
alter table professionals add column if not exists pin_hash text;
alter table professionals add column if not exists color text;
alter table companies add column if not exists owner_pin_hash text;

alter table messages add column if not exists operator_id uuid references professionals(id) on delete set null;
alter table messages add column if not exists operator_name text;
create index if not exists messages_operator_idx on messages(operator_id);
