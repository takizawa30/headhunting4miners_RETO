import { defineConfig, loadEnv } from 'vite';
import { execFileSync } from 'node:child_process';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  let revision = process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA;
  if (!revision) { try { revision = execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8', stdio:['ignore','pipe','ignore'] }).trim(); } catch { revision = 'local'; } }
  return { envDir: '..', define: { 'import.meta.env.VITE_REVISION': JSON.stringify(revision), 'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || env.VITE_API_URL || 'http://localhost:3000') }, plugins: [{ name: 'revision-file', generateBundle() { this.emitFile({ type:'asset', fileName:'version.json', source:JSON.stringify({ revision }) }); } }] };
});
