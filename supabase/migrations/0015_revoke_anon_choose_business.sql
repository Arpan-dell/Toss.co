-- Supabase grants EXECUTE on new public functions to `anon` by default. Choosing a business needs a signed-in
-- customer (the function checks too), and the distance helper is internal to nearby_businesses().
revoke execute on function public.choose_business(text, double precision, double precision) from anon;
revoke execute on function public.join_tenant(text) from anon;
revoke execute on function public.km_between(double precision, double precision, double precision, double precision) from anon, authenticated, public;
