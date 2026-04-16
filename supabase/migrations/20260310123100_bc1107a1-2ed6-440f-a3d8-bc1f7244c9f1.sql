
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  _user_id uuid, _type text, _title text, _body text, _link text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_user_id, _type, _title, _body, _link);
END;
$$;
