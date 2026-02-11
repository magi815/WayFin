const https = require('https');
const fs = require('fs');
const path = require('path');

// 울산 동구 방어동
const BOUNDS = {
    north: 35.525,
    south: 35.495,
    west: 129.410,
    east: 129.445,
};

const MIN_ZOOM = 10;
const MAX_ZOOM = 19;

function lon2tile(lon, z) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function lat2tile(lat, z) {
    return Math.floor(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
            Math.pow(2, z)
    );
}

// Count tiles first
let totalTiles = 0;
const zoomInfo = [];
for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const xMin = lon2tile(BOUNDS.west, z);
    const xMax = lon2tile(BOUNDS.east, z);
    const yMin = lat2tile(BOUNDS.north, z);
    const yMax = lat2tile(BOUNDS.south, z);
    const count = (xMax - xMin + 1) * (yMax - yMin + 1);
    totalTiles += count;
    zoomInfo.push({ z, xMin, xMax, yMin, yMax, count });
    console.log(`Zoom ${z}: ${count} tiles (x:${xMin}-${xMax}, y:${yMin}-${yMax})`);
}
console.log(`\nTotal tiles: ${totalTiles}`);
console.log(`Estimated size: ~${Math.round(totalTiles * 15 / 1024)} MB\n`);

const TILE_DIR = path.join(__dirname, 'www', 'tiles');
const SERVERS = ['a', 'b', 'c'];
let downloaded = 0;
let failed = 0;
let serverIdx = 0;

function downloadTile(z, x, y) {
    return new Promise((resolve) => {
        const dir = path.join(TILE_DIR, String(z), String(x));
        const file = path.join(dir, y + '.png');

        if (fs.existsSync(file)) {
            downloaded++;
            resolve();
            return;
        }

        fs.mkdirSync(dir, { recursive: true });

        const s = SERVERS[serverIdx % 3];
        serverIdx++;
        const url = `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

        const req = https.get(url, {
            headers: { 'User-Agent': 'MmapOfflineBuilder/1.0' },
            timeout: 15000,
        }, (res) => {
            if (res.statusCode !== 200) {
                failed++;
                resolve();
                return;
            }
            const ws = fs.createWriteStream(file);
            res.pipe(ws);
            ws.on('finish', () => {
                downloaded++;
                if (downloaded % 100 === 0) {
                    process.stdout.write(`\rDownloaded: ${downloaded}/${totalTiles} (failed: ${failed})`);
                }
                resolve();
            });
            ws.on('error', () => { failed++; resolve(); });
        });
        req.on('error', () => { failed++; resolve(); });
        req.on('timeout', () => { req.destroy(); failed++; resolve(); });
    });
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('Downloading tiles...\n');
    for (const info of zoomInfo) {
        console.log(`\nZoom ${info.z}...`);
        for (let x = info.xMin; x <= info.xMax; x++) {
            for (let y = info.yMin; y <= info.yMax; y++) {
                await downloadTile(info.z, x, y);
                await sleep(50); // rate limit
            }
        }
    }
    console.log(`\n\nDone! Downloaded: ${downloaded}, Failed: ${failed}`);
}

main();
