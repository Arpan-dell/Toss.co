-- Jobs given to drivers before confirmations existed (0030) never had a "Got it" button: count them as confirmed
-- when they were assigned, so the live board only tracks jobs sent from now on.
update public.orders set driver_ack_at = coalesce(assigned_at, accepted_at, placed_at)
 where driver_id is not null and driver_ack_at is null;
update public.orders set delivery_ack_at = coalesce(delivery_assigned_at, ready_at, completed_at)
 where delivery_driver_id is not null and delivery_ack_at is null;
