/* _scripts/push-via-api.mjs —— github.com:443 被墙时经 gh CLI 推送的 API 执行端
   祖先校验与变更清单由 push-via-api.sh（bash）完成；本文件只做：
   blob 上传 → 基于远端 base_tree 建树 → commit（parents=远端 HEAD）→ fast-forward ref。
   用法：node _scripts/push-via-api.mjs <remoteHead> <baseTree> <changesFile>
   changesFile 行格式：<status>\t<path>（status 为 M/A/D） */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REPO = '5777-wq/openfinlens';
const [remoteHead, baseTree, changesFile] = process.argv.slice(2);
if (!remoteHead || !baseTree || !changesFile) { console.error('usage: node push-via-api.mjs <remoteHead> <baseTree> <changesFile>'); process.exit(1); }

const api = (path, method, bodyObj) => {
  const tmp = '.tmp-api-body.json';
  writeFileSync(tmp, JSON.stringify(bodyObj || {}));
  try {
    const m = method || 'GET';
    return JSON.parse(execSync(`gh api ${m === 'GET' ? '' : `--method ${m} --input ${tmp}`} "${path}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } finally { try { unlinkSync(tmp); } catch { /* ignore */ } }
};

const lines = readFileSync(changesFile, 'utf8').split('\n').filter(Boolean);
const tree = [];
for (const line of lines) {
  const tab = line.indexOf('\t');
  const status = line.slice(0, tab).trim();
  const p = line.slice(tab + 1).trim();
  if (status === 'D') { tree.push({ path: p, mode: '100644', type: 'blob', sha: null }); continue; }
  const blob = api('/repos/' + REPO + '/git/blobs', 'POST',
    { content: readFileSync(p).toString('base64'), encoding: 'base64' });
  tree.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
  console.log('  blob', status, p, blob.sha.slice(0, 8));
}

const newTree = api('/repos/' + REPO + '/git/trees', 'POST', { base_tree: baseTree, tree });
console.log('tree =', newTree.sha);

const localMsg = execSync('git log -1 --format=%B', { encoding: 'utf8' });
const commit = api('/repos/' + REPO + '/git/commits', 'POST', {
  message: localMsg,
  tree: newTree.sha,
  parents: [remoteHead],
  author: {
    name: execSync('git log -1 --format=%an', { encoding: 'utf8' }).trim(),
    email: execSync('git log -1 --format=%ae', { encoding: 'utf8' }).trim(),
    date: execSync('git log -1 --format=%aI', { encoding: 'utf8' }).trim(),
  },
  committer: {
    name: execSync('git log -1 --format=%cn', { encoding: 'utf8' }).trim(),
    email: execSync('git log -1 --format=%ce', { encoding: 'utf8' }).trim(),
    date: execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim(),
  },
});
console.log('commit =', commit.sha);

const upd = api('/repos/' + REPO + '/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
console.log('ref updated →', upd.object.sha);
console.log('NOTE: 本地提交与远端提交 sha 不同（同内容不同对象），后续网络恢复后请 '
  + '`git pull --rebase` 对齐一次。');
