import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envContent = `# Development-only placeholders – replace with real keys for actual processing
VITE_SUPABASE_URL=https://uenjzvbtwlawhpsybamnp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-...
RAPIDAPI_KEY=...
RAPIDAPI_HOST=youtube-media-downloader.p.rapidapi.com
YOUTUBE_API_KEY=...
PEXELS_API_KEY=
JAMENDO_CLIENT_ID=
`;

writeFileSync(resolve('.env'), envContent.trim(), { encoding: 'utf8' });
console.log('✅ Created .env with development placeholders. Edit it with real keys before running workers.');