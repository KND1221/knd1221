import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.argv[2] || process.env.GITHUB_USER || 'KND1221';
const OUTPUT_DIR = process.argv[3] || process.env.OUTPUT_DIR || 'dist';

const GRAPHQL_URL = 'https://api.github.com/graphql';

async function fetchContributions(user) {
  const query = `
    query($user: String!) {
      user(login: $user) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { user } })
  });

  const json = await response.json();

  if (json.errors) {
    console.error('GraphQL Errors:', json.errors);
    throw new Error('GraphQL query failed');
  }

  return json.data.user.contributionsCollection.contributionCalendar;
}

function generateGrid(calendar) {
  const weeks = calendar.weeks;
  const grid = [];

  for (const week of weeks) {
    for (const day of week.contributionDays) {
      grid.push({
        date: day.date,
        count: day.contributionCount,
        level: day.contributionCount === 0 ? 0 :
               day.contributionCount <= 2 ? 1 :
               day.contributionCount <= 4 ? 2 :
               day.count <= 6 ? 3 : 4
      });
    }
  }

  return grid;
}

function findSnakePath(grid, cols = 53, rows = 7) {
  const visited = new Set();
  const path = [];

  function getKey(index) {
    return `${Math.floor(index / rows)}-${index % rows}`;
  }

  function canMove(index) {
    if (index < 0 || index >= grid.length) return false;
    const key = getKey(index);
    if (visited.has(key)) return false;
    const col = Math.floor(index / rows);
    const row = index % rows;
    return col >= 0 && col < cols && row >= 0 && row < rows;
  }

  function findPath(startIndex) {
    const stack = [[startIndex, []]];

    while (stack.length > 0) {
      const [current, currentPath] = stack.pop();

      if (!canMove(current)) continue;

      const newPath = [...currentPath, current];
      visited.add(getKey(current));

      if (grid[current] && grid[current].count > 0) {
        path.push(...newPath);
        return;
      }

      const neighbors = [
        current + rows,
        current + 1,
        current - rows,
        current - 1
      ];

      for (const neighbor of neighbors) {
        if (canMove(neighbor)) {
          stack.push([neighbor, newPath]);
        }
      }
    }
  }

  for (let i = 0; i < grid.length; i++) {
    if (grid[i].count > 0 && !visited.has(getKey(i))) {
      findPath(i);
      break;
    }
  }

  return path;
}

function generateSnakeSVG(grid, path, dark = false) {
  const cellSize = 12;
  const gap = 2;
  const cols = 53;
  const rows = 7;
  const width = cols * (cellSize + gap) + 20;
  const height = rows * (cellSize + gap) + 20;

  const colors = dark ? {
    empty: '#161b22',
    level1: '#0e4429',
    level2: '#006d32',
    level3: '#26a641',
    level4: '#39d353',
    snake: '#ff6b6b'
  } : {
    empty: '#ebedf0',
    level1: '#9be9a8',
    level2: '#40c463',
    level3: '#30a14e',
    level4: '#216e39',
    snake: '#ff6b6b'
  };

  let rects = '';
  for (let i = 0; i < grid.length; i++) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = col * (cellSize + gap) + 10;
    const y = row * (cellSize + gap) + 10;
    const level = grid[i].level;
    const color = level === 0 ? colors.empty :
                  level === 1 ? colors.level1 :
                  level === 2 ? colors.level2 :
                  level === 3 ? colors.level3 :
                  colors.level4;
    rects += `<rect class="c" x="${x}" y="${y}" rx="2" ry="2" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
  }

  let snakeSegments = '';
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    const col = Math.floor(idx / rows);
    const row = idx % rows;
    const x = col * (cellSize + gap) + 10;
    const y = row * (cellSize + gap) + 10;
    const size = cellSize - 2 - (i % 4);
    snakeSegments += `<rect class="s s${i % 4}" x="${x + 1}" y="${y + 1}" width="${size}" height="${size}" rx="2" ry="2" fill="${colors.snake}"/>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <desc>Generated snake from GitHub contributions for ${GITHUB_USER}</desc>
  <style>
    .c { shape-rendering: geometricPrecision; }
    .s { shape-rendering: geometricPrecision; animation: snake 3s linear infinite; }
    @keyframes snake {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }
  </style>
  ${rects}
  ${snakeSegments}
</svg>`;
}

async function main() {
  console.log(`Fetching contributions for user: ${GITHUB_USER}`);

  const calendar = await fetchContributions(GITHUB_USER);
  console.log(`Total contributions: ${calendar.totalContributions}`);

  const grid = generateGrid(calendar);
  console.log(`Grid cells: ${grid.length}`);

  const path = findSnakePath(grid);
  console.log(`Snake path length: ${path.length}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const svgLight = generateSnakeSVG(grid, path, false);
  const svgDark = generateSnakeSVG(grid, path, true);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'github-contribution-grid-snake.svg'), svgLight);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'github-contribution-grid-snake-dark.svg'), svgDark);

  console.log(`Generated SVG files in ${OUTPUT_DIR}/`);
  console.log(`- github-contribution-grid-snake.svg`);
  console.log(`- github-contribution-grid-snake-dark.svg`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
