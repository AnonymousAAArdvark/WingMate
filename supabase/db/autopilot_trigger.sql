-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Create function to call edge function
CREATE OR REPLACE FUNCTION notify_autopilot_handler()
RETURNS trigger AS $$
DECLARE
  edge_secret text;
BEGIN
  -- Get the edge function secret from config
  edge_secret := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYmZ3ZnR1dHBqb3BhcmVtcmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwODMwMTksImV4cCI6MjA3NjY1OTAxOX0.Ex9OZeOZBhlYEMJTE6gAfcLSz9CP0nS0kN4wgxWz5YU';
  
  -- Call the edge function asynchronously
  PERFORM net.http_post(
    url := 'https://fcbfwftutpjoparemrhi.supabase.co/functions/v1/autopilot-handler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || edge_secret
    ),
    body := jsonb_build_object(
      'message_id', NEW.id,
      'match_id', NEW.match_id,
      'sender_id', NEW.sender_id,
      'is_seed', NEW.is_seed
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS on_message_insert_autopilot ON messages;
CREATE TRIGGER on_message_insert_autopilot
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION notify_autopilot_handler();