export function githubHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'] || process.env['SCRAPER_PAT'];
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}
