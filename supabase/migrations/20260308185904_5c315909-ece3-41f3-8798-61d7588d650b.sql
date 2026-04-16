
-- Create court_type enum
CREATE TYPE public.court_type AS ENUM ('indoor', 'outdoor', 'mixed');

-- Create club_status enum
CREATE TYPE public.club_status AS ENUM ('active', 'inactive');

-- Create clubs table
CREATE TABLE public.clubs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_name TEXT NOT NULL,
  club_description TEXT,
  approximate_location TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  address_line_1 TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  number_of_courts INTEGER NOT NULL DEFAULT 1,
  main_court_type public.court_type NOT NULL DEFAULT 'indoor',
  typical_active_hours TEXT NOT NULL DEFAULT '07:00–23:00',
  club_status public.club_status NOT NULL DEFAULT 'active',
  amenities TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  operating_hours TEXT,
  parking_info TEXT,
  notes_for_admin TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read active clubs
CREATE POLICY "Anyone can read active clubs"
ON public.clubs FOR SELECT TO authenticated
USING (club_status = 'active' OR public.has_role(auth.uid(), 'admin'));

-- Admins can insert
CREATE POLICY "Admins can insert clubs"
ON public.clubs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update
CREATE POLICY "Admins can update clubs"
ON public.clubs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete
CREATE POLICY "Admins can delete clubs"
ON public.clubs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add unique constraint on club_name to detect duplicates
CREATE UNIQUE INDEX clubs_club_name_unique ON public.clubs (lower(club_name));
