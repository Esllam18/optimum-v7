-- V7 invitation activation is intentionally previewable before sign-in.
-- The function is token-scoped: invalid/high-entropy token misses return {valid:false}.
revoke execute on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;
comment on function public.invitation_preview(text) is
  'Token-scoped invitation metadata preview. Intentionally callable before sign-in by anon users who possess the high-entropy invitation token; returns no data for invalid tokens.';
