-- Gift cards for a service (Nov 5, 2026): a card bought for one of the business's services ("60 min Deep tissue")
-- keeps the service's name with it; its amount is that service's price when it was bought. Empty for an amount.
alter table public.gift_orders add column if not exists service text check (service is null or length(service) <= 120);
