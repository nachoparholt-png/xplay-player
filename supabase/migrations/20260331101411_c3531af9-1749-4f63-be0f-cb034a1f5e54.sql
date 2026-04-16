
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ref_code text;
  _inviter_id uuid;
  _new_referral_code text;
BEGIN
  _new_referral_code := 'XP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.profiles (user_id, display_name, avatar_url, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    _new_referral_code
  );

  _ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF _ref_code IS NOT NULL AND _ref_code <> '' THEN
    SELECT user_id INTO _inviter_id
    FROM public.profiles
    WHERE referral_code = _ref_code
    LIMIT 1;

    IF _inviter_id IS NOT NULL AND _inviter_id <> NEW.id THEN
      INSERT INTO public.referrals (inviter_user_id, invited_user_id, referral_code, referral_status)
      VALUES (_inviter_id, NEW.id, _ref_code, 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.profiles
SET referral_code = 'XP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;
