-- supabase_schema.sql — Database initialization for Job Search Agent
-- Copy and paste this into the Supabase SQL Editor (https://supabase.com)

-- Drop table if it exists (for clean setup)
DROP TABLE IF EXISTS jobs;

-- Create the jobs table
CREATE TABLE jobs (
    job_url TEXT PRIMARY KEY,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    location TEXT NOT NULL,
    experience TEXT NOT NULL,
    date_posted TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- 1. Create policy to allow read-only public access to all jobs
CREATE POLICY "Allow public read access" 
ON jobs FOR SELECT 
TO public 
USING (true);

-- 2. Create policy to allow anonymous inserts (for the scraper)
CREATE POLICY "Allow anon insert" 
ON jobs FOR INSERT 
TO anon 
WITH CHECK (true);

-- 3. Create policy to allow anonymous updates (for updating existing jobs)
CREATE POLICY "Allow anon update" 
ON jobs FOR UPDATE 
TO anon 
USING (true);

-- Create indexes to optimize search queries by role/keyword
CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
