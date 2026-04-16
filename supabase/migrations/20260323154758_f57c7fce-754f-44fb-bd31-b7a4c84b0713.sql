
-- Create 12 fake auth users for testing
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token)
VALUES
  ('aaaaaaaa-0001-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carlos.ruiz@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sofia.martinez@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'luca.rossi@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana.fernandez@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marco.silva@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elena.torres@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'diego.morales@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'valentina.cruz@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hugo.navarro@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camila.reyes@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mateo.vargas@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', ''),
  ('aaaaaaaa-0001-4000-a000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'isabella.rojas@test.local', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '', '')
ON CONFLICT (id) DO NOTHING;

-- Update the auto-created profiles with proper data
UPDATE public.profiles SET display_name = 'Carlos Ruiz', padel_level = 5.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000001';
UPDATE public.profiles SET display_name = 'Sofia Martinez', padel_level = 4.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000002';
UPDATE public.profiles SET display_name = 'Luca Rossi', padel_level = 3.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000003';
UPDATE public.profiles SET display_name = 'Ana Fernandez', padel_level = 6.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000004';
UPDATE public.profiles SET display_name = 'Marco Silva', padel_level = 2.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000005';
UPDATE public.profiles SET display_name = 'Elena Torres', padel_level = 4.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000006';
UPDATE public.profiles SET display_name = 'Diego Morales', padel_level = 5.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000007';
UPDATE public.profiles SET display_name = 'Valentina Cruz', padel_level = 3.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000008';
UPDATE public.profiles SET display_name = 'Hugo Navarro', padel_level = 6.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000009';
UPDATE public.profiles SET display_name = 'Camila Reyes', padel_level = 2.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000010';
UPDATE public.profiles SET display_name = 'Mateo Vargas', padel_level = 4.0, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000011';
UPDATE public.profiles SET display_name = 'Isabella Rojas', padel_level = 5.5, padel_park_points = 200, onboarding_completed = true WHERE user_id = 'aaaaaaaa-0001-4000-a000-000000000012';

-- 3 Matches
INSERT INTO public.matches (id, organizer_id, club, match_date, match_time, format, status, visibility, level_min, level_max, max_players)
VALUES
  ('bbbbbbbb-0001-4000-b000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000001', 'Rocket Padel Battersea', (CURRENT_DATE + interval '1 day')::date, '18:00', 'competitive', 'open', 'public', 4.0, 7.0, 4),
  ('bbbbbbbb-0001-4000-b000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000005', 'Padel Box Bermondsey', (CURRENT_DATE + interval '1 day')::date, '19:00', 'competitive', 'open', 'public', 1.0, 5.0, 4),
  ('bbbbbbbb-0001-4000-b000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000009', 'PADELHUB N20', (CURRENT_DATE + interval '1 day')::date, '20:00', 'competitive', 'open', 'public', 2.0, 7.0, 4);

-- Match players
INSERT INTO public.match_players (match_id, user_id, team, status) VALUES
  ('bbbbbbbb-0001-4000-b000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000001', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000007', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000004', 'B', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000006', 'B', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000005', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000003', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000002', 'B', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000011', 'B', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000009', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000012', 'A', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000008', 'B', 'confirmed'),
  ('bbbbbbbb-0001-4000-b000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000010', 'B', 'confirmed');

-- Match bet markets
INSERT INTO public.match_bet_markets (id, match_id, team_a_elo, team_b_elo, team_a_true_prob, team_b_true_prob, team_a_multiplier, team_b_multiplier, team_a_tier, team_b_tier, status)
VALUES
  ('cccccccc-0001-4000-c000-000000000001', 'bbbbbbbb-0001-4000-b000-000000000001', 1850.0, 1850.0, 0.5000, 0.5000, 1.82, 1.82, 'T3', 'T3', 'open'),
  ('cccccccc-0001-4000-c000-000000000002', 'bbbbbbbb-0001-4000-b000-000000000002', 1150.0, 1400.0, 0.3006, 0.6994, 2.47, 1.30, 'T4', 'T1', 'open'),
  ('cccccccc-0001-4000-c000-000000000003', 'bbbbbbbb-0001-4000-b000-000000000003', 1800.0, 1150.0, 0.9309, 0.0691, 0, 8.52, 'T1', 'T6', 'open');

-- Ensure match_bet_config exists
INSERT INTO public.match_bet_config (id, enabled) VALUES (gen_random_uuid(), true) ON CONFLICT DO NOTHING;

-- Tournament
INSERT INTO public.tournaments (id, created_by, name, status, visibility, format_type, tournament_type, player_count, court_count, match_config, bracket_config)
VALUES
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000001', 'Test Betting Tournament', 'draft', 'public', 'groups', 'pairs', 8, 2,
   '{"scoring_type": "points", "points_target": 21}'::jsonb,
   '{"group_count": 2, "teams_per_group": 4, "advance_count": 2, "knockout_structure": "groups_final"}'::jsonb);

-- Tournament teams (with player1_id required)
INSERT INTO public.tournament_teams (id, tournament_id, team_name, player1_id, player2_id) VALUES
  ('eeeeeeee-0001-4000-e000-000000000001', 'dddddddd-0001-4000-d000-000000000001', 'Team Alpha', 'aaaaaaaa-0001-4000-a000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000007'),
  ('eeeeeeee-0001-4000-e000-000000000002', 'dddddddd-0001-4000-d000-000000000001', 'Team Beta', 'aaaaaaaa-0001-4000-a000-000000000004', 'aaaaaaaa-0001-4000-a000-000000000006'),
  ('eeeeeeee-0001-4000-e000-000000000003', 'dddddddd-0001-4000-d000-000000000001', 'Team Gamma', 'aaaaaaaa-0001-4000-a000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000003'),
  ('eeeeeeee-0001-4000-e000-000000000004', 'dddddddd-0001-4000-d000-000000000001', 'Team Delta', 'aaaaaaaa-0001-4000-a000-000000000009', 'aaaaaaaa-0001-4000-a000-000000000008');

-- Tournament players
INSERT INTO public.tournament_players (tournament_id, user_id, team_id, status, role) VALUES
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000001', 'eeeeeeee-0001-4000-e000-000000000001', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000007', 'eeeeeeee-0001-4000-e000-000000000001', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000004', 'eeeeeeee-0001-4000-e000-000000000002', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000006', 'eeeeeeee-0001-4000-e000-000000000002', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000002', 'eeeeeeee-0001-4000-e000-000000000003', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000003', 'eeeeeeee-0001-4000-e000-000000000003', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000009', 'eeeeeeee-0001-4000-e000-000000000004', 'confirmed', 'player'),
  ('dddddddd-0001-4000-d000-000000000001', 'aaaaaaaa-0001-4000-a000-000000000008', 'eeeeeeee-0001-4000-e000-000000000004', 'confirmed', 'player');
