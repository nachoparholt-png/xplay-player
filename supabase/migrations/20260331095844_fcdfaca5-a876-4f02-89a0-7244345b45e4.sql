
-- 1. Update handle_new_user to seed referral row when ref code present
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ref_code text;
  _inviter_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );

  -- Check for referral code in signup metadata
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

-- 2. Create increment_points RPC
CREATE OR REPLACE FUNCTION public.increment_points(p_user_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET padel_park_points = padel_park_points + p_amount,
      lifetime_earned = lifetime_earned + p_amount
  WHERE user_id = p_user_id;
END;
$function$;
