const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'logo.png';
const OUTPUT_DIR = path.join(__dirname, 'public', 'icons');

async function generateIcons() {
    console.log('🎨 Flow Icon Generator');
    console.log('---------------------');

    // 0. Check for Source Image
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Error: Source file '${INPUT_FILE}' not found in root.`);
        console.log('Please place a high-quality PNG (at least 512x512) named "logo.png" in this folder.');
        process.exit(1);
    }

    // 1. Directory Setup
    if (!fs.existsSync(OUTPUT_DIR)) {
        console.log(`Creating directory: ${OUTPUT_DIR}`);
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    try {
        // 2. Standard Icon 192x192 (Purpose: Any)
        await sharp(INPUT_FILE)
            .resize(192, 192)
            .toFile(path.join(OUTPUT_DIR, 'icon-192.png'));
        console.log('✅ Created icon-192.png');

        // 3. Standard Icon 512x512 (Purpose: Any)
        await sharp(INPUT_FILE)
            .resize(512, 512)
            .toFile(path.join(OUTPUT_DIR, 'icon-512.png'));
        console.log('✅ Created icon-512.png');

        // 4. Maskable Icon 512x512 (Purpose: Maskable)
        // Requirements: 512x512 canvas, White background, Logo resized to 410x410 (80%), Centered.
        
        // Step 4a: Resize logo for the safe zone
        const safeZoneLogo = await sharp(INPUT_FILE)
            .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        // Step 4b: Composite onto white canvas
        await sharp({
            create: {
                width: 512,
                height: 512,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
        .composite([{ input: safeZoneLogo, gravity: 'center' }])
        .toFile(path.join(OUTPUT_DIR, 'icon-maskable-512.png'));
        
        console.log('✅ Created icon-maskable-512.png (with Safe Zone padding)');

        // 5. Verification / Manifest Snippet
        console.log('\n---------------------');
        console.log('🎉 Success! Paste this into your manifest.json icons array:');
        console.log(JSON.stringify([
            {
                "src": "/icons/icon-192.png",
                "type": "image/png",
                "sizes": "192x192",
                "purpose": "any"
            },
            {
                "src": "/icons/icon-512.png",
                "type": "image/png",
                "sizes": "512x512",
                "purpose": "any"
            },
            {
                "src": "/icons/icon-maskable-512.png",
                "type": "image/png",
                "sizes": "512x512",
                "purpose": "maskable"
            }
        ], null, 2));

    } catch (err) {
        console.error('❌ Processing Error:', err);
    }
}

generateIcons();