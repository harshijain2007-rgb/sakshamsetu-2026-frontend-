const fs = require('fs');
const path = require('path');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const frontendDir = path.join(workspaceRoot, 'frontend');
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

let changedCount = 0;

for (const file of htmlFiles) {
  const filePath = path.join(frontendDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // 1. Replace href="/css/main.css" or href="css/main.css" -> href="./css/main.css"
  content = content.replace(/href=["']\/?css\/main\.css["']/g, 'href="./css/main.css"');

  // 2. Replace src="/js/..." or src="js/..." -> src="./js/..."
  content = content.replace(/src=["']\/?js\/([^"']+)["']/g, 'src="./js/$1"');

  // 3. Replace from '/js/...' or from 'js/...' -> from './js/...'
  content = content.replace(/from\s+["']\/?js\/([^"']+)["']/g, "from './js/$1'");

  // 4. Also check for any leading slash in page links like href="/student-visual-dyslexic.html"
  content = content.replace(/href=["']\/([a-zA-Z0-9_-]+\.html)["']/g, 'href="./$1"');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[UPDATED] ${file}`);
    changedCount++;
  } else {
    console.log(`[OK] ${file}`);
  }
}

console.log(`\nTotal updated HTML files: ${changedCount} / ${htmlFiles.length}`);
