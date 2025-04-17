// server.js (or sever.js - use the correct name when running)
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Basic Setup ---
dotenv.config(); // Load environment variables from .env file

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
//const port = process.env.PORT || 3000; // Use port from environment or default to 3000
const port = process.env.PORT || 10000;
// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing for frontend requests
app.use(express.json()); // Enable parsing of JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (index.html, images, etc.) from the 'public' folder

// --- API Route for Image Generation ---
app.post('/api/generate-image', async (req, res) => {
    console.log("\n--- Received request for /api/generate-image ---");

    // 1. Get and Validate Input
    const { description } = req.body;
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
        console.error('❌ Bad Request: Missing or invalid description in request body.');
        return res.status(400).json({ error: 'Missing or invalid image description.' });
    }
    const trimmedDescription = description.trim();
    console.log(`   Description received: "${trimmedDescription.substring(0, 70)}..."`);

    // 2. Get and Validate API Token
    const replicateApiToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateApiToken) {
        console.error('❌ Server Error: REPLICATE_API_TOKEN is not set in the .env file or environment.');
        return res.status(500).json({ error: 'Image generation service is not configured correctly.' });
    }
    console.log(`   Using Replicate Token starting with: ${replicateApiToken.substring(0, 5)}...`);

    // 3. Prepare Replicate API Request
    const REPLICATE_API_URL = "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions";
    const requestBody = {
        input: {
            prompt: trimmedDescription,
            prompt_upsampling: true
        }
    };

    // 4. Call Replicate API
    console.log(`   Sending request to Replicate model: ${REPLICATE_API_URL}`);
    try {
        const replicateResponse = await fetch(REPLICATE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${replicateApiToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!replicateResponse.ok && replicateResponse.headers.get('content-type')?.includes('application/json') !== true) {
             console.error(`❌ Replicate API HTTP Error: ${replicateResponse.status} ${replicateResponse.statusText}`);
            const rawText = await replicateResponse.text();
            console.log("Raw response body (text):", rawText);
 
            return res.status(502).json({ error: `Image service connection failed with status: ${replicateResponse.status}` });
        }

        const responseData = await replicateResponse.json();

        if (!replicateResponse.ok) {
            const errorDetail = responseData?.error || responseData?.detail || `Replicate API Status: ${replicateResponse.status}`;
            console.error(`❌ Replicate API Error Response (${replicateResponse.status}):`, errorDetail);
            console.warn("   Full Replicate error response:", JSON.stringify(responseData, null, 2));
            return res.status(502).json({ error: `Failed to generate image. ${errorDetail}` });
        }

        // 5. Process Replicate Response
        console.log(`   Received response from Replicate. Status field: '${responseData.status}'`);

        // --- CORRECTED SUCCESS LOGIC ---
        let imageUrlToSend = null; // Initialize variable to store the final URL

        // Check if the status indicates potential success AND output exists
        if ((responseData.status === 'succeeded' || responseData.status === 'processing') && responseData.output) {
            console.log(`   [Debug] Potential Success. Type of responseData.output: ${typeof responseData.output}`);
            console.log(`   [Debug] Value of responseData.output:`, responseData.output);

            // Check if output is an array with at least one element
            if (Array.isArray(responseData.output) && responseData.output.length > 0) {
                imageUrlToSend = responseData.output[0];
                console.log(`   [Debug] Output is Array. Using output[0]: ${imageUrlToSend}`);
            }
            // Check if output is directly a string (this handles the observed case)
            else if (typeof responseData.output === 'string') {
                imageUrlToSend = responseData.output;
                 console.log(`   [Debug] Output is String. Using output directly: ${imageUrlToSend}`);
            }
        }

        // FINAL CHECK: Validate the extracted URL before sending
        if (typeof imageUrlToSend === 'string' && imageUrlToSend.startsWith('http')) {
            console.log(`✅ SUCCESS: Sending JSON to frontend: { imageUrl: '${imageUrlToSend}' }`);
            return res.json({ imageUrl: imageUrlToSend }); // Send the valid URL back
        } else {
            // FAILURE CONDITION: Status was wrong, output was missing, or output wasn't a valid URL format
            const errorMessage = `Image service returned status '${responseData.status}' or did not provide a valid image URL.`;
            console.warn(`❌ FAILURE/UNEXPECTED: ${errorMessage}`);
            console.warn(`   [Debug] imageUrlToSend at failure point was:`, imageUrlToSend); // Log what we ended up with
            console.warn("   Full Replicate response:", JSON.stringify(responseData, null, 2));
            return res.status(502).json({ error: errorMessage });
        }
        // --- END CORRECTED SUCCESS LOGIC ---

    } catch (error) {
        console.error('❌ CATCH BLOCK ERROR (Fetch/JSON Parse):', error);
        return res.status(500).json({ error: 'Internal server error during image generation call.' });
    }
});

// --- SPA Fallback Route ---
app.get(/^(?!\/api).*/, (req, res) => {
    console.log(`   Fallback route triggered for path: ${req.path}. Sending index.html.`);
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error(`❌ Error sending index.html: ${err.message}`);
            res.status(500).send("Error loading application.");
        }
    });
});

// --- Start the Server ---
//Danh commented, old app.listen(port, () => {
//This makes your app compatible with Render’s platform, which routes web traffic into your container through that dynamic port. Ref: https://render.com/docs/web-services#port-binding
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 Server listening at http://localhost:${port}`);
    if (!process.env.REPLICATE_API_TOKEN) {
        console.warn('⚠️ WARNING: REPLICATE_API_TOKEN environment variable is not set!');
    } else {
        console.log('   REPLICATE_API_TOKEN loaded successfully.');
    }
    console.log(`   Serving static files from: ${path.join(__dirname, 'public')}`);
});
